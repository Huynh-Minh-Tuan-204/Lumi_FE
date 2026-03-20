'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi } from '@/lib/api'
import { CallSignalR } from '@/lib/call-signalr'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MoreHorizontal, Users, MessageSquare, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSignalR } from '@/hooks/use-signalr'
import { useCallback } from 'react'
import { toast } from 'sonner'

interface VideoCallUIProps {
  callId: string
  callType: 'video' | 'voice'
  participantName: string
  onEndCall: () => void
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
  const { sendMessage, messages: globalMessages } = useSignalR()

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

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const signalRRef = useRef<CallSignalR | null>(null)
  const peersRef = useRef<Map<number, PeerState>>(new Map())
  const [remotePeers, setRemotePeers] = useState<UserPeer[]>([]) // For rendering

  interface UserPeer {
    userId: number
    userName: string
    stream: MediaStream | null
  }

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
      await sendMessage(convId, chatInput.trim(), "PLAIN") 
      setChatInput('')
    } catch (err) {
      console.error("Failed to send message in call", err)
    }
  }

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  // --- WebRTC Logic (Mesh) ---

  const createPeerConnection = (targetUserId: number, targetUserName: string, isPolite: boolean) => {
    console.log(`WebRTC: Creating peer connection to ${targetUserName} (ID: ${targetUserId}), polite: ${isPolite}`);
    
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

    // Add local tracks
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
      console.log(`WebRTC: Received remote track from ${targetUserName}`);
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
      console.log(`WebRTC: Connection state with ${targetUserName}: ${pc.connectionState}`);
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
        // 1. Get local media
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: callType === 'video'
        });
        if (!active) { stream.getTracks().forEach(t => t.stop()); return; }
        
        localStreamRef.current = stream;
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // 2. Initialize SignalR
        const signalR = new CallSignalR({
          onUserJoined: async (_connId, remoteUserId, displayName) => {
            if (remoteUserId === user.id) return;
            toast.info(`${displayName} joined the meeting`);
            
            // In Mesh, the newly joined user is usually polite? 
            // Better: use numeric comparison for politeness (Perfect Negotiation)
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
            if (peer) {
              await peer.connection.setRemoteDescription(answer);
            }
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
        
        // Notify others I'm present via API
        meetingsApi.joinMeeting(token, Number(callId)).catch(() => {});

      } catch (err) {
        console.error("WebRTC Error:", err);
        setError("Unable to access camera/microphone.");
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
      // Stop
      const screenTracks = localStreamRef.current?.getTracks().filter(t => (t as any).label.toLowerCase().includes('screen') || t.kind === 'video'); // Simple check
      // This is complex for Mesh. Usually we should replace track for each peer.
      toast.info("Stopping screen share...");
      setIsScreenSharing(false);
      return;
    }
    toast.info("Screen sharing started");
    setIsScreenSharing(true);
  };

  const endCall = () => {
    onEndCall();
  };

  // Render logic for grid
  const allStreams = useMemo(() => {
    return [
      { id: user?.id || 0, name: "You", stream: localStreamRef.current, isLocal: true },
      ...remotePeers.map(p => ({ id: p.userId, name: p.userName, stream: p.stream, isLocal: false }))
    ];
  }, [user?.id, remotePeers, localStreamRef.current]);

  return (
    <div className="flex h-screen flex-col bg-[#1F1F1F] text-white overflow-hidden">
      {/* Header */}
      <div className="flex h-12 items-center justify-between bg-[#1F1F1F] px-4 border-b border-white/5 z-10">
        <div className="flex items-center gap-3">
          <Avatar className="h-6 w-6">
            <AvatarImage src="/logo.png" />
            <AvatarFallback>L</AvatarFallback>
          </Avatar>
          <span className="text-sm font-semibold">{participantName} Meeting</span>
          <span className="bg-stone-800 px-2 py-0.5 text-[10px] rounded text-gray-400">{formatDuration(callDuration)}</span>
        </div>
        <div className="flex items-center gap-1">
           <Button variant="ghost" size="sm" className={cn("h-8 gap-2", showPeople && "bg-white/10")} onClick={() => { setShowPeople(!showPeople); setShowChat(false); }}>
            <Users className="h-4 w-4" /> <span className="hidden sm:inline">People</span>
           </Button>
           <Button variant="ghost" size="sm" className={cn("h-8 gap-2", showChat && "bg-white/10")} onClick={() => { setShowChat(!showChat); setShowPeople(false); }}>
            <MessageSquare className="h-4 w-4" /> <span className="hidden sm:inline">Chat</span>
           </Button>
        </div>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        {/* Call Grid */}
        <div className="flex-1 bg-[#111111] p-4 flex items-center justify-center overflow-auto">
          <div className={cn(
            "grid gap-4 w-full h-full max-w-6xl max-h-[80vh]",
            allStreams.length === 1 ? "grid-cols-1" : 
            allStreams.length === 2 ? "grid-cols-1 md:grid-cols-2" : 
            allStreams.length <= 4 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"
          )}>
            {allStreams.map((p) => (
              <div key={p.id} className="relative rounded-xl overflow-hidden bg-stone-900 aspect-video ring-1 ring-white/10 group">
                <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.isLocal ? isCameraOn : true} />
                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-2 py-1 rounded text-xs flex items-center gap-2">
                  <span className="font-medium">{p.name} {p.isLocal && "(You)"}</span>
                  {!p.isLocal && p.stream && <div className="h-2 w-2 rounded-full bg-green-500" />}
                </div>
                {p.isLocal && isMuted && (
                  <div className="absolute top-3 right-3 bg-red-500/80 p-1 rounded-full">
                    <MicOff className="h-3 w-3" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar */}
        {(showPeople || showChat) && (
           <div className="w-80 border-l border-white/5 bg-[#1F1F1F] flex flex-col z-20 animate-in slide-in-from-right duration-300">
             <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h3 className="font-semibold text-sm">{showPeople ? 'Participants' : 'Chat'}</h3>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => { setShowPeople(false); setShowChat(false); }}>
                  <X className="h-4 w-4" />
                </Button>
             </div>
             
             {showPeople && (
               <ScrollArea className="flex-1 p-4">
                 <div className="space-y-4">
                    {meetingParticipants.map((p, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8 ring-2 ring-stone-800">
                          <AvatarFallback className="bg-indigo-600 text-[10px]">{p.fullName?.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{p.fullName}</p>
                          <p className="text-[10px] text-gray-500">{p.isPresent ? 'Active' : 'Offline'}</p>
                        </div>
                      </div>
                    ))}
                 </div>
               </ScrollArea>
             )}
           </div>
        )}
      </div>

      {/* Footer Controls */}
      <div className="h-20 bg-[#1F1F1F] border-t border-white/5 flex items-center justify-center p-4">
        <div className="flex items-center gap-4 bg-stone-900/50 p-2 px-6 rounded-2xl ring-1 ring-white/5">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleMic} className={cn("h-12 w-12 rounded-xl", isMuted ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/5 hover:bg-white/10")}>
                  {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Mute/Unmute</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleCamera} className={cn("h-12 w-12 rounded-xl", !isCameraOn ? "bg-red-500/20 text-red-500 hover:bg-red-500/30" : "bg-white/5 hover:bg-white/10")}>
                  {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Camera On/Off</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={toggleScreenShare} className={cn("h-12 w-12 rounded-xl bg-white/5 hover:bg-white/10", isScreenSharing && "text-indigo-500 bg-indigo-500/10")}>
                  <Monitor className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Share Screen</TooltipContent>
            </Tooltip>

            <div className="w-px h-8 bg-white/10 mx-2" />

            <Button onClick={endCall} className="h-12 px-8 rounded-xl bg-red-600 hover:bg-red-700 text-white font-bold flex items-center gap-2">
              <PhoneOff className="h-5 w-5" /> <span className="hidden sm:inline">Leave</span>
            </Button>
          </TooltipProvider>
        </div>
      </div>

      {error && <div className="absolute top-16 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-2xl z-50 text-sm font-medium">{error}</div>}
    </div>
  )
}

function VideoPlayer({ stream, isLocal, isCameraOn }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  
  useEffect(() => {
    if (ref.current && stream) {
      ref.current.srcObject = stream;
    }
  }, [stream]);

  if (!isLocal && !stream) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-stone-900 border border-white/5">
        <div className="animate-pulse flex flex-col items-center">
           <div className="w-12 h-12 rounded-full bg-white/5 mb-2" />
           <span className="text-[10px] text-gray-500">Wait for video...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full">
      <video
        ref={ref}
        autoPlay
        playsInline
        muted={isLocal}
        className={cn("h-full w-full object-cover", isLocal && "scale-x-[-1]", !isCameraOn && "hidden")}
      />
      {!isCameraOn && (
         <div className="flex h-full w-full items-center justify-center bg-stone-950">
           <div className="h-20 w-20 rounded-full bg-linear-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl">
              <span className="text-2xl font-bold">U</span>
           </div>
         </div>
      )}
    </div>
  );
}

