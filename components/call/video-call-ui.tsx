'use client'

import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { cn, getAvatarUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi, conversationsApi } from '@/lib/api'
import { CallSignalR } from '@/lib/call-signalr'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MoreHorizontal, Users, MessageSquare, X, Send, Smile } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSignalR, ChatMessage } from '@/hooks/use-signalr'
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
  const { sendMessage, lastMessage, lastUserLeft } = useSignalR()

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
  const [processedUserLeft, setProcessedUserLeft] = useState<number | null>(null)
  
  const meetingStartTime = useRef<Date>(new Date())
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const signalRRef = useRef<CallSignalR | null>(null)
  const peersRef = useRef<Map<number, PeerState>>(new Map())
  const [remotePeers, setRemotePeers] = useState<UserPeer[]>([]) 
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const updatePeerUI = useCallback(() => {
    const list: UserPeer[] = Array.from(peersRef.current.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      stream: p.stream
    }));
    setRemotePeers(list);
  }, []);

  const removePeer = useCallback((userId: number) => {
    const peer = peersRef.current.get(userId);
    if (peer) {
      peer.connection.close();
      peersRef.current.delete(userId);
      updatePeerUI();
    }
  }, [updatePeerUI]);

  // Sync participant UI when UserLeft event is received via SignalR
  useEffect(() => {
    if (lastUserLeft && lastUserLeft !== processedUserLeft) {
      setProcessedUserLeft(lastUserLeft)
      setMeetingParticipants(prev => prev.filter(p => (p.userId || p.Id) !== lastUserLeft))
      removePeer(lastUserLeft)
      toast.info(`Một thành viên đã rời khỏi phiên thảo luận.`)
    }
  }, [lastUserLeft, processedUserLeft, removePeer])

  const fetchMeetingData = useCallback(async (signal?: AbortSignal) => {
    if (!token || !callId) return
    try {
      const meeting = await meetingsApi.getMeeting(token, Number(callId))
      if (signal?.aborted) return
      setConvId(meeting.conversationId)
      
      const history = await conversationsApi.getMessages(token, meeting.conversationId)
      if (!signal?.aborted) {
        const mappedHistory: ChatMessage[] = history.map((d: any) => ({
          id: d.id ?? d.Id,
          conversationId: meeting.conversationId,
          senderId: d.senderId ?? d.SenderId,
          sender: d.senderName ?? d.SenderName ?? d.sender ?? 'User',
          message: d.content ?? d.message ?? d.encryptedContent ?? "",
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
      if (!signal?.aborted) console.error("Error fetching meeting data", e)
    }
  }, [callId, token])

  useEffect(() => {
    const ac = new AbortController()
    fetchMeetingData(ac.signal)
    return () => ac.abort()
  }, [fetchMeetingData])

  const createPeerConnection = useCallback((targetUserId: number, targetUserName: string, isPolite: boolean) => {
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
  }, [callId, removePeer, updatePeerUI]);

  useEffect(() => {
    if (!token || !user) return;
    let active = true;

    const startCall = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video'
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        const signalR = new CallSignalR({
          onUserJoined: async (_connId, remoteUserId, displayName) => {
            if (remoteUserId === user.id) return;
            toast.info(`${displayName} đã tham gia cuộc gọi`);
            const isPolite = user.id > remoteUserId;
            if (!peersRef.current.has(remoteUserId)) {
              createPeerConnection(remoteUserId, displayName, isPolite);
            }
          },
          onUserLeft: (_connId, remoteUserId, displayName) => {
            toast.info(`${displayName} đã rời khỏi cuộc gọi`);
            removePeer(remoteUserId);
            // Backup removal via specific call-hub event
            setMeetingParticipants(prev => prev.filter(p => (p.userId || p.Id) !== remoteUserId))
          },
          onReceiveOffer: async (offer, fromUserId) => {
            let peer = peersRef.current.get(fromUserId);
            if (!peer) {
              const name = meetingParticipants.find(p => (p.userId || p.Id) === fromUserId)?.fullName || "User";
              peer = createPeerConnection(fromUserId, name, user.id > fromUserId);
            }
            const pc = peer.connection;
            const offerCollision = offer.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable");
            peer.ignoreOffer = !peer.isPolite && offerCollision;
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
  }, [callId, token, user, callType, createPeerConnection, meetingParticipants, removePeer]);

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
        window.location.reload(); // Simple reset for demo, or re-acquire camera stream
        return;
    }
    try {
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getVideoTracks()[0];
      screenTrack.onended = () => setIsScreenSharing(false);
      peersRef.current.forEach(peer => {
        const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(screenTrack);
      });
      setIsScreenSharing(true);
      toast.info("Đang chia sẻ màn hình...");
    } catch (err) {
      toast.error("Không thể chia sẻ màn hình");
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (lastMessage && lastMessage.conversationId === convId) {
      setCallMessages(prev => [...prev, lastMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [lastMessage, convId]);

  const allStreams = useMemo(() => [
    { id: user?.id || 0, name: "Bạn", stream: localStreamRef.current, isLocal: true },
    ...remotePeers.map(p => ({ id: p.userId, name: p.userName, stream: p.stream, isLocal: false }))
  ], [user, remotePeers]);

  const filteredCallMessages = useMemo(() => 
    callMessages.filter(m => new Date(m.time) >= meetingStartTime.current)
  , [callMessages]);

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-white overflow-hidden relative font-sans">
      <div className="absolute inset-0 bg-gradient-to-br from-red-900/20 via-black to-red-900/20 opacity-50 pointer-events-none" />

      <header className="relative flex h-14 items-center justify-between bg-[#1A1A1A]/80 backdrop-blur-2xl px-6 border-b border-white/5 z-30 shadow-2xl">
        <div className="flex items-center gap-4">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-xs shadow-lg shadow-primary/30">L</div>
            <div className="flex flex-col -space-y-0.5">
               <span className="text-sm font-black tracking-tight">{participantName} Meeting</span>
               <div className="flex items-center gap-2 text-[10px] text-gray-500 font-bold uppercase tracking-tighter">
                 <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                 Lumi Live | {formatDuration(callDuration)}
               </div>
            </div>
        </div>
        <div className="flex -space-x-2">
            {meetingParticipants.slice(0, 3).map((p, i) => (
                <Avatar key={i} className="w-8 h-8 border-2 border-[#1A1A1A] ring-1 ring-white/10">
                    <AvatarImage src={getAvatarUrl(p.avatarPath)} />
                    <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-black">{p.fullName?.substring(0, 1)}</AvatarFallback>
                </Avatar>
            ))}
        </div>
      </header>

      <main className="flex-1 flex min-h-0 relative z-10">
        <section className="flex-1 p-6 flex items-center justify-center relative overflow-hidden">
             <div className={cn(
                "grid gap-4 w-full h-full max-w-[1400px]",
                allStreams.length === 1 ? "grid-cols-1" : allStreams.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"
             )}>
                {allStreams.map((p) => (
                  <div key={p.id} className="relative rounded-3xl overflow-hidden bg-[#1A1A1A] aspect-video border border-white/5 shadow-2xl group transition-all duration-500 hover:border-primary/30">
                    <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.isLocal ? isCameraOn : true} />
                    <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-xl px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ring-1 ring-white/10">
                        {p.name} {p.isLocal && "(Tôi)"}
                    </div>
                  </div>
                ))}
             </div>

             <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1A1A1A]/90 backdrop-blur-2xl p-2 rounded-[2rem] border border-white/10 shadow-2xl ring-1 ring-white/5">
                <Button variant="ghost" size="icon" onClick={toggleCamera} className={cn("h-14 w-14 rounded-full", !isCameraOn && "bg-primary text-white hover:bg-primary/80 shadow-lg shadow-primary/30")}>
                    {isCameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                </Button>
                <Button variant="ghost" size="icon" onClick={toggleMic} className={cn("h-14 w-14 rounded-full", isMuted && "bg-primary text-white hover:bg-primary/80 shadow-lg shadow-primary/30")}>
                    {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                </Button>
                <div className="w-[1px] h-8 bg-white/10 mx-1" />
                <Button variant="ghost" size="icon" onClick={toggleScreenShare} className={cn("h-14 w-14 rounded-full", isScreenSharing && "bg-primary text-white shadow-lg shadow-primary/30")}>
                    <Monitor className="h-6 w-6" />
                </Button>
                <div className="w-[1px] h-8 bg-white/10 mx-1" />
                <Button variant="ghost" size="icon" className={cn("h-14 w-14 rounded-full", showPeople && "text-primary bg-primary/10")} onClick={() => { setShowPeople(!showPeople); setShowChat(false); }}>
                    <Users className="h-6 w-6" />
                </Button>
                <Button variant="ghost" size="icon" className={cn("h-14 w-14 rounded-full", showChat && "text-primary bg-primary/10")} onClick={() => { setShowChat(!showChat); setShowPeople(false); }}>
                    <MessageSquare className="h-6 w-6" />
                </Button>
                <div className="ml-2">
                    <Button onClick={onEndCall} className="h-14 px-8 rounded-3xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-red-600/20 active:scale-95 transition-all">
                        <PhoneOff className="h-5 w-5 mr-3 fill-current" /> Kết thúc
                    </Button>
                </div>
             </div>
        </section>

        {(showPeople || showChat) && (
            <aside className="w-96 bg-[#121212]/95 border-l border-white/5 backdrop-blur-3xl flex flex-col z-20 animate-in slide-in-from-right duration-500 shadow-2xl">
                <header className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-black text-sm uppercase tracking-widest text-primary">{showPeople ? 'Người tham gia' : 'Trò chuyện'}</h3>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { setShowPeople(false); setShowChat(false); }}><X className="h-4 w-4" /></Button>
                </header>
                
                {showPeople && (
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-3">
                            {meetingParticipants.map((p, i) => (
                                <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5">
                                    <Avatar className="h-10 w-10">
                                        <AvatarImage src={getAvatarUrl(p.avatarPath)} />
                                        <AvatarFallback className="bg-primary/10 text-primary text-xs font-black uppercase">{p.fullName?.substring(0, 1)}</AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-xs font-black truncate text-white/90">{p.fullName} {p.userId === user?.id && '(Bạn)'}</p>
                                        <p className="text-[10px] font-bold text-primary/60 uppercase tracking-tighter">Đang tham gia</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {showChat && (
                    <div className="flex-1 flex flex-col min-h-0">
                        <ScrollArea className="flex-1 p-6">
                            <div className="space-y-6">
                                {filteredCallMessages.map((msg: any) => (
                                    <div key={msg.id} className={cn("flex flex-col gap-2", msg.senderId === user?.id ? "items-end" : "items-start")}>
                                        <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{msg.sender}</p>
                                        <div className={cn("px-4 py-2 text-sm rounded-2xl max-w-[90%] break-words", msg.senderId === user?.id ? "bg-primary text-white rounded-tr-none shadow-lg shadow-primary/20" : "bg-white/5 border border-white/10 shadow-inner rounded-tl-none")}>
                                            {msg.message}
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        </ScrollArea>
                        <div className="p-6 border-t border-white/5 flex gap-2">
                            <input 
                                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-primary/50 transition-all font-bold placeholder:text-white/20" 
                                placeholder="Nhập tin nhắn..." 
                                value={chatInput} 
                                onChange={(e) => setChatInput(e.target.value)} 
                                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), sendMessage(convId!, chatInput, 'PLAIN'), setChatInput(''))} 
                            />
                            <Button size="icon" className="h-9 w-9 rounded-xl bg-primary hover:bg-primary/80" onClick={() => (sendMessage(convId!, chatInput, 'PLAIN'), setChatInput(''))}><Send className="h-4 w-4" /></Button>
                        </div>
                    </div>
                )}
            </aside>
        )}

        {error && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-destructive text-white px-6 py-3 rounded-full font-black uppercase tracking-widest text-[10px] shadow-2xl animate-in fade-in slide-in-from-top-4 z-50">{error}</div>
        )}
      </main>
    </div>
  )
}

function VideoPlayer({ stream, isLocal, isCameraOn }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current && stream) ref.current.srcObject = stream;
  }, [stream]);

  return (
    <div className="relative w-full h-full bg-black flex items-center justify-center">
        <video ref={ref} autoPlay playsInline muted={isLocal} className={cn("h-full w-full object-cover transition-opacity duration-1000", isLocal && "scale-x-[-1]", !isCameraOn ? "opacity-0" : "opacity-100")} />
        {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center">
                <Avatar className="h-24 w-24 ring-4 ring-red-500/20 shadow-2xl">
                    <AvatarFallback className="bg-gradient-to-br from-red-600 to-red-900 text-3xl font-black text-white">L</AvatarFallback>
                </Avatar>
            </div>
        )}
    </div>
  );
}
