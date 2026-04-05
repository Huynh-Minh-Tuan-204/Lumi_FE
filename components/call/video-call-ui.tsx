'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi, conversationsApi } from '@/lib/api'
import { CallSignalR } from '@/lib/call-signalr'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MoreHorizontal, Users, MessageSquare, X, Send, Smile } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSignalR, ChatMessage } from '@/hooks/use-signalr'
import { useCallback } from 'react'
import { toast } from 'sonner'

interface VideoCallUIProps {
  callId: string
  callType: 'video' | 'voice'
  participantName: string
  onEndCall: () => void
}

interface UserPeer {
  userId: number
  userName: string
  stream: MediaStream | null
}

interface PeerState {
  userId: number
  userName: string
  stream: MediaStream | null
  connection: RTCPeerConnection
  isPolite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

export function VideoCallUI({ callId, callType, participantName, onEndCall }: VideoCallUIProps) {
  const { user, token } = useAuth()
  const { sendMessage, lastMessage } = useSignalR()

  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(callType === 'video')
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)

  // Sidebar states
  const [showPeople, setShowPeople] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [meetingParticipants, setMeetingParticipants] = useState<any[]>([])
  const [convId, setConvId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [callMessages, setCallMessages] = useState<ChatMessage[]>([])
  const [reaction, setReaction] = useState<string | null>(null)

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const signalRRef = useRef<CallSignalR | null>(null)
  const peersRef = useRef<Map<number, PeerState>>(new Map())
  const [remotePeers, setRemotePeers] = useState<UserPeer[]>([]) // For rendering

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchMeetingData = useCallback(async (signal?: AbortSignal) => {
    if (!token || !callId) return
    try {
      const meeting = await meetingsApi.getMeeting(token, Number(callId))
      if (signal?.aborted) return
      setConvId(meeting.conversationId)
      
      // Load initial chat history for this call
      const history = await conversationsApi.getMessages(token, meeting.conversationId)
      if (!signal?.aborted) {
        const mappedHistory: ChatMessage[] = history.map((d: any) => ({
          id: d.id ?? d.Id,
          conversationId: meeting.conversationId,
          senderId: d.senderId ?? d.SenderId,
          sender: d.senderName ?? d.SenderName ?? d.sender ?? 'User',
          message: d.content ?? d.message ?? d.encryptedContent ?? d.EncryptedContent ?? "",
          time: new Date(d.createdAt ?? d.CreatedAt ?? d.time ?? Date.now()),
          iv: d.iv ?? d.Iv,
          messageType: d.messageType ?? d.MessageType,
        }))
        setCallMessages(mappedHistory)
      }

      const parts = await meetingsApi.getParticipants(token, Number(callId))
      if (signal?.aborted) return
      setMeetingParticipants(parts)
    } catch (e) {
      if (!signal?.aborted) {
        console.error("Error fetching meeting data", e)
      }
    }
  }, [callId, token])

  useEffect(() => {
    const ac = new AbortController()
    fetchMeetingData(ac.signal)
    return () => ac.abort()
  }, [fetchMeetingData])

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !convId) return
    try {
      const content = chatInput.trim();
      setChatInput('')
      await sendMessage(convId, content, "PLAIN") 
    } catch (err) {
      console.error("Failed to send message in call", err)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const createPeerConnection = (targetUserId: number, targetUserName: string, isPolite: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG);
    const peerState: PeerState = {
      userId: targetUserId,
      userName: targetUserName,
      stream: null,
      connection: pc,
      isPolite,
      makingOffer: false,
      ignoreOffer: false
    };

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!);
      });
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && signalRRef.current?.isConnected) {
        signalRRef.current.sendIceCandidate(callId, targetUserId, candidate.toJSON());
      }
    };

    pc.ontrack = ({ streams }) => {
      if (streams[0]) {
        peerState.stream = streams[0];
        updatePeerUI();
      }
    };

    pc.onnegotiationneeded = async () => {
      try {
        peerState.makingOffer = true;
        await pc.setLocalDescription();
        if (signalRRef.current?.isConnected) {
          await signalRRef.current.sendOffer(callId, targetUserId, pc.localDescription!);
        }
      } catch (err) {
        console.error(`WebRTC: Negotiation error with ${targetUserName}`, err);
      } finally {
        peerState.makingOffer = false;
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(targetUserId);
      }
    };

    peersRef.current.set(targetUserId, peerState);
    updatePeerUI();
    return peerState;
  };

  const removePeer = (userId: number) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(userId);
      updatePeerUI();
    }
  };

  const updatePeerUI = () => {
    const list: UserPeer[] = Array.from(peersRef.current.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      stream: p.stream
    }));
    setRemotePeers(list);
  };

  useEffect(() => {
    if (!token || !user) return;
    let active = true;

    const startCall = async () => {
      try {
        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: callType === 'video'
          });
        } catch (mediaErr: any) {
          if (callType === 'video') {
             try {
                stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
                setIsCameraOn(false);
                toast.warning("Camera not found. Starting with audio only.");
             } catch (audioErr) {
                throw audioErr;
             }
          } else {
            throw mediaErr;
          }
        }
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const signalR = new CallSignalR({
          onUserJoined: async (_connId, remoteUserId, displayName) => {
            if (remoteUserId === user.id) return;
            toast.info(`${displayName} joined the meeting`);
            const isPolite = user.id > remoteUserId;
            if (!peersRef.current.has(remoteUserId)) {
              createPeerConnection(remoteUserId, displayName, isPolite);
            }
          },
          onUserLeft: (_connId, remoteUserId, displayName) => {
            toast.info(`${displayName} left the meeting`);
            removePeer(remoteUserId);
          },
          onReceiveOffer: async (offer, fromUserId) => {
            let peer = peersRef.current.get(fromUserId);
            if (!peer) {
              const name = meetingParticipants.find(p => p.userId === fromUserId)?.fullName || "User";
              peer = createPeerConnection(fromUserId, name, user.id > fromUserId);
            }
            const pc = peer.connection;
            const isPolite = peer.isPolite;
            const offerCollision = offer.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
            peer.ignoreOffer = !isPolite && offerCollision;
            if (peer.ignoreOffer) return;
            if (offerCollision) {
              await Promise.all([
                pc.setLocalDescription({ type: "rollback" }),
                pc.setRemoteDescription(offer)
              ]);
            } else {
              await pc.setRemoteDescription(offer);
            }
            if (offer.type === "offer") {
              await pc.setLocalDescription();
              await signalR.sendAnswer(callId, fromUserId, pc.localDescription!);
            }
          },
          onReceiveAnswer: async (answer, fromUserId) => {
            const peer = peersRef.current.get(fromUserId);
            if (peer) await peer.connection.setRemoteDescription(answer);
          },
          onReceiveIceCandidate: async (candidate, fromUserId) => {
            const peer = peersRef.current.get(fromUserId);
            if (peer && !peer.ignoreOffer) {
              await peer.connection.addIceCandidate(candidate).catch(() => {});
            }
          }
        });

        signalRRef.current = signalR;
        await signalR.connect(token);
        await signalR.joinCall(callId);
        meetingsApi.joinMeeting(token, Number(callId)).catch(() => {});
      } catch (err) {
        setError("Không thể truy cập Microphone/Camera.");
      }
    };
    startCall();
    return () => {
      active = false;
      localStreamRef.current?.getTracks().forEach(t => t.stop());
      peersRef.current.forEach(p => p.connection.close());
      peersRef.current.clear();
      signalRRef.current?.disconnect();
    };
  }, [callId, token, user?.id]);

  const toggleMic = () => {
    setIsMuted(prev => {
      const next = !prev;
      localStreamRef.current?.getAudioTracks().forEach(t => t.enabled = !next);
      return next;
    });
  };

  const toggleCamera = () => {
    setIsCameraOn(prev => {
      const next = !prev;
      localStreamRef.current?.getVideoTracks().forEach(t => t.enabled = next);
      return next;
    });
  };

  const toggleScreenShare = async () => {
    if (isScreenSharing) {
      // Stop screen share and revert to camera
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        const videoTrack = stream.getVideoTracks()[0];
        
        // Update local ref
        if (localStreamRef.current) {
          const oldTrack = localStreamRef.current.getVideoTracks()[0];
          if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
          localStreamRef.current.addTrack(videoTrack);
        }
        
        // Update peers
        peersRef.current.forEach(peer => {
          const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(videoTrack);
        });

        setIsScreenSharing(false);
        setIsCameraOn(true);
        toast.info("Đã dừng chia sẻ màn hình");
      } catch (err) {
        console.error("Failed to revert to camera", err);
      }
      return;
    }

    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // Handle "Stop Sharing" button from browser UI
      screenTrack.onended = () => {
        toggleScreenShare();
      };

      // Update local ref
      if (localStreamRef.current) {
        const oldTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldTrack) localStreamRef.current.removeTrack(oldTrack);
        localStreamRef.current.addTrack(screenTrack);
      }

      // Update peers
      peersRef.current.forEach(peer => {
        const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });

      setIsScreenSharing(true);
      setIsCameraOn(true);
      toast.info("Đang chia sẻ màn hình...");
    } catch (err) {
      console.error("Screen share failed", err);
      toast.error("Không thể chia sẻ màn hình");
    }
  };

  const sendReaction = (icon: string) => {
    setReaction(icon);
    setTimeout(() => setReaction(null), 3000);
  };

  const endCall = () => {
    onEndCall();
  };

  useEffect(() => {
    if (lastMessage && lastMessage.conversationId === convId) {
      setCallMessages(prev => {
        if (prev.some(m => m.id === lastMessage.id)) return prev;
        return [...prev, lastMessage];
      });
    }
  }, [lastMessage, convId]);

  const allStreams = useMemo(() => {
    return [
      { id: user?.id || 0, name: "Bạn", stream: localStreamRef.current, isLocal: true },
      ...remotePeers.map(p => ({ id: p.userId, name: p.userName, stream: p.stream, isLocal: false }))
    ];
  }, [user?.id, remotePeers, localStreamRef.current]);

  const chatMessages = useMemo(() => callMessages, [callMessages]);

  return (
    <div className="flex h-screen flex-col bg-[#111111] text-white overflow-hidden relative font-sans leading-relaxed">
      {/* Dynamic Background Blur */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-black to-purple-900/20 opacity-50" />

      {/* Teams-like Header */}
      <header className="relative flex h-14 items-center justify-between bg-[#1F1F1F]/60 backdrop-blur-2xl px-6 border-b border-white/5 z-30 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xs shadow-lg shadow-indigo-500/20 ring-1 ring-white/10">L</div>
            <div className="flex flex-col -space-y-0.5">
               <span className="text-sm font-bold tracking-tight truncate max-w-[250px]">{participantName} Meeting</span>
               <div className="flex items-center gap-2 text-[10px] text-gray-400 font-bold uppercase tracking-tighter">
                 <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                 Lumi Live | {formatDuration(callDuration)}
               </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
            <div className="flex -space-x-2.5">
                {meetingParticipants.slice(0, 3).map((p, i) => (
                    <Avatar key={i} className="w-8 h-8 ring-4 ring-[#1F1F1F] bg-stone-800 border border-white/10 shadow-lg">
                        {p.avatarPath && <AvatarImage src={p.avatarPath} />}
                        <AvatarFallback className="text-[10px] font-black uppercase">{p.fullName?.substring(0, 1)}</AvatarFallback>
                    </Avatar>
                ))}
                {meetingParticipants.length > 3 && (
                  <div className="w-8 h-8 rounded-full ring-4 ring-[#1F1F1F] bg-indigo-600 flex items-center justify-center text-[10px] font-black border border-white/10 shadow-lg">
                      +{meetingParticipants.length - 3}
                  </div>
                )}
            </div>
        </div>
      </header>

      <main className="flex-1 flex min-h-0 relative">
        {/* Gallery View */}
        <section className="flex-1 p-6 flex items-center justify-center overflow-hidden relative z-10">
          <div className={cn(
            "grid gap-6 w-full h-full transition-all duration-700 max-w-[1600px]",
            allStreams.length === 1 ? "grid-cols-1" : 
            allStreams.length === 2 ? "grid-cols-1 md:grid-cols-2" : 
            allStreams.length <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
          )}>
            {allStreams.map((p) => (
              <div key={p.id} className="relative rounded-[2rem] overflow-hidden bg-[#242424] aspect-video group transition-all duration-300 hover:ring-4 hover:ring-indigo-500/30 shadow-2xl border border-white/5">
                <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.isLocal ? isCameraOn : true} />
                
                <div className="absolute bottom-6 left-6 flex items-center gap-2">
                  <div className="bg-black/40 backdrop-blur-xl px-4 py-2 rounded-2xl text-[11px] font-bold flex items-center gap-3 ring-1 ring-white/10 shadow-lg">
                    {p.name} {p.isLocal && "(Tôi)"}
                    {!p.isLocal && p.stream && <div className="h-2 w-2 rounded-full bg-green-500 shadow-[0_0_12px_#22c55e]" />}
                  </div>
                </div>

                {p.isLocal && isMuted && (
                  <div className="absolute top-6 right-6 bg-red-600/90 p-2.5 rounded-2xl shadow-2xl ring-1 ring-white/20">
                    <MicOff className="h-4 w-4" />
                  </div>
                )}

                {p.isLocal && reaction && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 animate-in zoom-in duration-300">
                    <span className="text-8xl drop-shadow-2xl">{reaction}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Floating Teams Controller */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[40]">
            <div className="flex items-center gap-3 bg-[#1F1F1F]/80 backdrop-blur-3xl p-3 px-4 rounded-[2.5rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-white/5">
              <div className="flex items-center gap-2">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={toggleCamera} className={cn("h-14 w-14 rounded-full transition-all duration-300", !isCameraOn ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20" : "hover:bg-white/10")}>
                        {isCameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Máy ảnh</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={toggleMic} className={cn("h-14 w-14 rounded-full transition-all duration-300", isMuted ? "bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20" : "hover:bg-white/10")}>
                        {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Micro</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="w-[1px] h-8 bg-white/10 mx-1" />

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" onClick={toggleScreenShare} className={cn("h-14 w-14 rounded-full transition-all duration-300", isScreenSharing ? "bg-indigo-600 text-white" : "hover:bg-white/10")}>
                        <Monitor className="h-6 w-6" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Chia sẻ</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative group/react">
                        <Button variant="ghost" size="icon" className="h-14 w-14 rounded-full hover:bg-white/10 transition-all duration-300">
                          <Smile className="h-6 w-6" />
                        </Button>
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-6 bg-[#262626]/95 backdrop-blur-xl p-3 rounded-2xl flex gap-2 border border-white/10 shadow-2xl scale-0 group-hover/react:scale-100 transition-all duration-300 origin-bottom ring-1 ring-white/5">
                         {['👍', '❤️', '👏', '😂', '😮'].map(emoji => (
                             <button key={emoji} onClick={() => sendReaction(emoji)} className="w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl text-2xl transition-transform hover:scale-125 active:scale-95">
                                {emoji}
                             </button>
                         ))}
                        </div>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Cảm xúc</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="w-[1px] h-8 bg-white/10 mx-1" />

                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                       <Button variant="ghost" size="icon" className={cn("h-14 w-14 rounded-full transition-all duration-300", showPeople && "bg-indigo-600/30 text-indigo-400")} onClick={() => { setShowPeople(!showPeople); setShowChat(false); }}>
                        <Users className="h-6 w-6" />
                       </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Mọi người</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="ghost" size="icon" className={cn("h-14 w-14 rounded-full transition-all duration-300", showChat && "bg-indigo-600/30 text-indigo-400")} onClick={() => { setShowChat(!showChat); setShowPeople(false); }}>
                        <MessageSquare className="h-6 w-6" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="rounded-xl font-bold">Trò chuyện</TooltipContent>
                  </Tooltip>
                </TooltipProvider>

                <div className="ml-3">
                   <Button onClick={endCall} className="h-14 px-8 rounded-[1.5rem] bg-red-600 hover:bg-red-700 text-white font-black flex items-center gap-3 group border-none shadow-xl shadow-red-600/20 transition-all active:scale-95">
                      <PhoneOff className="h-6 w-6 fill-current" />
                      <span className="hidden sm:inline tracking-tighter">Kết thúc</span>
                   </Button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Improved Right Sidebar */}
        {(showPeople || showChat) && (
           <aside className="w-[400px] border-l border-white/5 bg-[#1A1A1A]/95 backdrop-blur-3xl flex flex-col z-20 animate-in slide-in-from-right duration-500 shadow-[-20px_0_60px_rgba(0,0,0,0.6)]">
              <header className="p-6 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-500/10 rounded-xl">
                        {showPeople ? <Users className="h-5 w-5 text-indigo-400" /> : <MessageSquare className="h-5 w-5 text-indigo-400" />}
                    </div>
                    <h3 className="font-black text-base tracking-tight">{showPeople ? 'Người tham gia' : 'Trò chuyện'}</h3>
                </div>
                <Button variant="ghost" size="icon" className="h-10 w-10 text-gray-400 hover:bg-white/10 rounded-full transition-all" onClick={() => { setShowPeople(false); setShowChat(false); }}>
                  <X className="h-5 w-5" />
                </Button>
              </header>
              
              {showPeople && (
                <ScrollArea className="flex-1">
                  <div className="p-6 space-y-6">
                    <div className="flex items-center justify-between px-2">
                        <span className="text-[10px] font-black text-gray-500 uppercase tracking-[0.2em]">Tổng số: {meetingParticipants.length}</span>
                        <Button variant="link" size="sm" className="text-[10px] text-indigo-400 p-0 h-auto font-bold uppercase tracking-widest">Mời thêm</Button>
                    </div>
                    <div className="space-y-2">
                        {meetingParticipants.map((p, i) => (
                        <div key={i} className="flex items-center gap-4 p-3 hover:bg-white/5 rounded-2xl transition-all duration-300 group ring-1 ring-transparent hover:ring-white/5">
                            <div className="relative">
                                <Avatar className="h-11 w-11 ring-2 ring-white/5">
                                    {p.avatarPath && <AvatarImage src={p.avatarPath} />}
                                    <AvatarFallback className="bg-gradient-to-br from-indigo-600 to-purple-600 text-sm font-black">{p.fullName?.substring(0, 2).toUpperCase()}</AvatarFallback>
                                </Avatar>
                                <div className={cn("absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-[#1A1A1A]", p.isPresent ? "bg-green-500" : "bg-gray-500")} />
                            </div>
                            <div className="flex-1 min-w-0">
                            <p className="text-sm font-black truncate">{p.fullName} {p.userId === user?.id && '(Bạn)'}</p>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-tight">{p.isPresent ? 'Đang hoạt động' : 'Đã ngoại tuyến'}</p>
                            </div>
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg hover:bg-white/10"><Mic className="h-4 w-4 text-gray-400" /></Button>
                            </div>
                        </div>
                        ))}
                    </div>
                  </div>
                </ScrollArea>
              )}

              {showChat && (
                <div className="flex-1 flex flex-col min-h-0">
                  <ScrollArea className="flex-1 p-6 scroll-smooth">
                    <div className="space-y-6">
                      {chatMessages.length === 0 ? (
                        <div className="py-32 text-center px-8 flex flex-col items-center">
                          <div className="w-20 h-20 bg-indigo-500/5 rounded-[2rem] flex items-center justify-center mb-6 ring-1 ring-white/5 shadow-inner">
                             <MessageSquare className="h-10 w-10 text-indigo-500/20" />
                          </div>
                          <p className="text-base font-black text-white/50 tracking-tight">Cùng thảo luận nhé!</p>
                          <p className="text-xs text-white/20 mt-2">Mọi người trong cuộc gọi sẽ thấy tin nhắn của bạn.</p>
                        </div>
                      ) : chatMessages.map((msg: any) => (
                        <div key={msg.id} className={cn("flex flex-col gap-2", msg.senderId === user?.id ? "items-end" : "items-start")}>
                          <div className="flex items-center gap-3 mb-1 px-1">
                             {msg.senderId !== user?.id && <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{msg.sender}</span>}
                             <span className="text-[9px] text-gray-600 font-bold">{new Date(msg.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className={cn(
                            "px-5 py-3 rounded-[1.5rem] text-sm max-w-[90%] break-words shadow-2xl relative ring-1 ring-white/5 selection:bg-white/20",
                            msg.senderId === user?.id 
                              ? "bg-gradient-to-br from-indigo-600 to-indigo-700 text-white rounded-tr-none shadow-indigo-900/20" 
                              : "bg-[#2A2A2A] text-gray-100 rounded-tl-none"
                          )}>
                            {msg.message}
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                  <footer className="p-6 pt-4 border-t border-white/5 bg-black/20">
                    <div className="flex items-end gap-3 bg-[#262626] p-3 rounded-2xl ring-1 ring-white/5 focus-within:ring-indigo-500/50 transition-all shadow-inner">
                       <textarea 
                         placeholder="Nhập nội dung tin nhắn..." 
                         className="flex-1 bg-transparent border-none py-1.5 px-1 rounded-xl text-sm outline-none resize-none min-h-[44px] max-h-[140px] font-medium placeholder:text-gray-600 scrollbar-hide"
                         rows={1}
                         value={chatInput}
                         onChange={(e) => setChatInput(e.target.value)}
                         onKeyDown={(e) => {
                             if(e.key === 'Enter' && !e.shiftKey) {
                                 e.preventDefault();
                                 handleSendChatMessage(e as any);
                             }
                         }}
                       />
                       <Button type="submit" size="icon" className="h-10 w-10 rounded-xl bg-indigo-600 hover:bg-indigo-700 shrink-0 shadow-lg shadow-indigo-600/20 active:scale-90 transition-all">
                          <Send className="h-5 w-5" />
                       </Button>
                    </div>
                  </footer>
                </div>
              )}
           </aside>
        )}
      </main>

      {/* Modern Error Toast */}
      {error && (
        <div className="absolute top-24 left-1/2 -translate-x-1/2 bg-red-600/90 backdrop-blur-2xl text-white px-8 py-4 rounded-[2rem] shadow-2xl z-50 text-sm font-black flex items-center gap-4 border border-red-400/50 animate-in fade-in slide-in-from-top-10 duration-500">
          <div className="w-2.5 h-2.5 rounded-full bg-white animate-ping" />
          {error}
        </div>
      )}
    </div>
  )
}

function VideoPlayer({ stream, isLocal, isCameraOn }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  if (!isLocal && !stream) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-[#1A1A1A]">
        <div className="animate-pulse flex flex-col items-center gap-6">
           <div className="w-24 h-24 rounded-full bg-white/5 ring-8 ring-white/[0.02]" />
           <span className="text-[10px] text-gray-600 font-bold uppercase tracking-[0.4em]">Đang kết nối...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn("h-full w-full object-cover transition-opacity duration-1000", isLocal && "scale-x-[-1]", !isCameraOn ? "opacity-0" : "opacity-100")}
      />
      {!isCameraOn && (
         <div className="absolute inset-0 flex h-full w-full items-center justify-center bg-[#1A1A1A]">
           <div className="relative">
             <div className="h-32 w-32 rounded-full bg-gradient-to-br from-indigo-500 via-purple-600 to-indigo-800 flex items-center justify-center shadow-[0_20px_50px_rgba(79,70,229,0.3)] animate-in zoom-in duration-500">
                <span className="text-4xl font-black text-white tracking-tighter">U</span>
             </div>
             <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 bg-black/40 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                <VideoOff className="w-3 h-3 text-red-400" />
             </div>
           </div>
         </div>
      )}
    </div>
  );
}
