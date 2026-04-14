'use client'

import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { cn, getAvatarUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi, conversationsApi } from '@/lib/api'
import { useSignalR, ChatMessage } from '@/hooks/use-signalr'
import { useCall } from '@/hooks/use-call'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { decryptMessagePro } from '@/lib/crypto-utils'

import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MoreHorizontal, Users, MessageSquare, X, Send, Smile, ShieldCheck, Minimize2, Maximize2 } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'

interface VideoCallUIProps {
  callId: string 
  callType: 'video' | 'voice'
  participantName: string
  onEndCall: () => void
  initialMic?: boolean
  initialCam?: boolean
}

function formatDuration(seconds: number) {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  return [h > 0 ? h : null, m, s].filter(x => x !== null).map(x => x!.toString().padStart(2, '0')).join(':')
}

  // Video Player Component with Avatar support
  function VideoPlayer({ stream, isLocal, isCameraOn, userAvatar, userName }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean, userAvatar?: string, userName: string }) {
    const videoRef = useRef<HTMLVideoElement>(null)
    
    useEffect(() => {
      if (videoRef.current && stream) {
        videoRef.current.srcObject = stream
      }
    }, [stream])

    return (
      <div className="relative w-full h-full bg-[#121212] flex items-center justify-center overflow-hidden rounded-2xl">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className={cn(
            "max-w-full max-h-full object-contain transition-all duration-700",
            isLocal && "scale-x-[-1]",
            !isCameraOn && "opacity-0 invisible"
          )}
        />
        {!isCameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1e1e1e] to-[#0f0f0f]">
            <Avatar className="h-32 w-32 ring-4 ring-primary/20 shadow-2xl animate-in zoom-in-95 duration-500">
              <AvatarImage src={userAvatar} className="object-cover" />
              <AvatarFallback className="bg-primary/10 text-primary text-4xl font-black uppercase">
                {userName?.substring(0, 1) || "?"}
              </AvatarFallback>
            </Avatar>
          </div>
        )}
      </div>
    )
  }

// Internal component for async decryption
function DecryptedText({ 
    message, 
    user, 
    mySenderKey, 
    peerSenderKeys, 
    peerIdentityKeys, 
    identityKeys,
    initiateHandshake
}: { 
    message: any, 
    user: any, 
    mySenderKey: any, 
    peerSenderKeys: Map<number, any>, 
    peerIdentityKeys: Map<number, any>,
    identityKeys: any,
    initiateHandshake: (cid: number) => Promise<void>
}) {
    const [decrypted, setDecrypted] = useState<string>("⌛ [Đang giải mã...]");

    useEffect(() => {
        const decrypt = async () => {
            if (message.messageType !== 'PLAIN' && message.messageType !== 'Text' && message.messageType !== 'PLAIN_SECURE' && message.messageType) {
                setDecrypted(message.message || message.encryptedContent || "");
                return;
            }

            const senderId = message.senderId;
            const content = message.message || message.encryptedContent;
            const iv = message.iv;
            const sig = message.signature || message.sig;

            if (!content || content === "[Attachment]") {
                setDecrypted("");
                return;
            }

            try {
                const isOwn = user && senderId === user.id;
                const senderKey = isOwn ? mySenderKey : peerSenderKeys?.get(senderId);
                const senderIdPubKey = isOwn ? identityKeys?.publicKey : peerIdentityKeys?.get(senderId);

                if (senderKey && senderIdPubKey && iv && sig) {
                    const result = await decryptMessagePro(content, iv, sig, senderKey, senderIdPubKey);
                    setDecrypted(result);
                } else {
                    setDecrypted("⏳ [Mã hóa đầu cuối]");
                    if (message.conversationId) initiateHandshake(message.conversationId);
                }
            } catch (e) {
                setDecrypted("[Lỗi giải mã]");
            }
        };

        decrypt();
    }, [message.id, message.message, message.encryptedContent, mySenderKey, peerSenderKeys?.size, peerIdentityKeys?.size]);

    return <span>{decrypted}</span>;
}


export function VideoCallUI({ callId, callType, participantName, onEndCall, initialMic = true, initialCam = true }: VideoCallUIProps) {
  const { user, token } = useAuth()
  const { sendMessage, lastMessage } = useSignalR()
  const { 
    joinCall, endCall, activeCallId, localStream, remotePeers,
    isMuted, setIsMuted, isCameraOn, setIsCameraOn,
    isMinimized, setIsMinimized, isScreenSharing, toggleScreenShare,
    signalR, setConversationId
  } = useCall()
  
  const router = useRouter()
  const [callDuration, setCallDuration] = useState(0)

  // Sidebar states
  const [showPeople, setShowPeople] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [meetingParticipants, setMeetingParticipants] = useState<any[]>([])
  const [hostId, setHostId] = useState<number | null>(null)
  const [convId, setConvId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [callMessages, setCallMessages] = useState<ChatMessage[]>([])
  const [meetingStartTimeState, setMeetingStartTimeState] = useState<Date | null>(null)
  const [waitingList, setWaitingList] = useState<any[]>([])

  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  // Navigation Logic on Minimize
  useEffect(() => {
    if (isMinimized && convId) {
       router.push(`/dashboard?convId=${convId}`)
    }
  }, [isMinimized, convId, router])

  const fetchMeetingData = useCallback(async (signal?: AbortSignal) => {
    if (!token || !callId) return
    try {
      const meeting = await meetingsApi.getMeeting(token, callId)
      if (signal?.aborted) return

      if (meeting.meetingGuid && meeting.meetingGuid !== callId) {
         window.location.replace(`/call/${meeting.meetingGuid}${window.location.search}`);
         return;
      }

      setConvId(meeting.conversationId ?? meeting.ConversationId)
      setConversationId(meeting.conversationId ?? meeting.ConversationId)
      setHostId(meeting.createdBy ?? meeting.CreatedBy)
      
      const startAtRaw = meeting.createdAt || meeting.startTime || meeting.CreatedAt || meeting.StartTime;
      if (startAtRaw) {
          // Add buffer to keep it isolated
          setMeetingStartTimeState(new Date(new Date(startAtRaw).getTime() - 2000));
      }
      
      try {
        const history = await conversationsApi.getMessages(token, meeting.conversationId)
        if (!signal?.aborted) {
          const mappedHistory: ChatMessage[] = history.map((d: any) => ({
            id: d.id ?? d.Id,
            conversationId: meeting.conversationId,
            senderId: d.senderId ?? d.SenderId,
            sender: d.senderName ?? d.SenderName ?? d.sender ?? d.Sender ?? 'User',
            message: d.content ?? d.message ?? d.encryptedContent ?? d.EncryptedContent ?? "",
            time: d.createdAt ? new Date(d.createdAt) : new Date(),
            iv: d.iv ?? d.Iv,
            messageType: d.messageType ?? d.MessageType,
          }))
          setCallMessages(mappedHistory)
        }
      } catch(e) { console.warn(e); }
    } catch (e) {
      if (!signal?.aborted) console.error(e)
    }
  }, [callId, token])

  useEffect(() => {
    const ac = new AbortController()
    fetchMeetingData(ac.signal)
    return () => ac.abort()
  }, [fetchMeetingData])

  useEffect(() => {
    if (callId && token) {
        joinCall(callId, callType)
    }
  }, [callId, token, callType, joinCall])

  useEffect(() => {
    if (lastMessage && lastMessage.conversationId === convId) {
      setCallMessages(prev => [...prev.filter(m => m.id !== lastMessage.id), lastMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [lastMessage, convId]);

  const allStreams = useMemo(() => [
    { 
        id: user?.id || 0, 
        name: user?.fullName || "Bạn", 
        stream: localStream, 
        isLocal: true, 
        avatar: getAvatarUrl(user?.id) 
    },
    ...remotePeers.map(p => ({ 
        id: p.userId, 
        name: p.userName, 
        stream: p.stream, 
        isLocal: false, 
        avatar: getAvatarUrl(p.userId) 
    }))
  ], [user, remotePeers, localStream]);


  const filteredCallMessages = useMemo(() => 
    meetingStartTimeState 
      ? callMessages.filter(m => new Date(m.time) >= meetingStartTimeState)
      : callMessages
  , [callMessages, meetingStartTimeState]);

  const partnerPeer = remotePeers[0];
  const displayStream = partnerPeer ? partnerPeer.stream : localStream;
  const isLocalDisplay = !partnerPeer;
  const displayNameDisplay = partnerPeer ? partnerPeer.userName : (user?.fullName || "Bạn");
  const displayAvatarDisplay = partnerPeer ? getAvatarUrl(partnerPeer.userId) : getAvatarUrl(user?.id);


  return (
    <div className={cn(
        "flex h-screen flex-col bg-[#0a0a0a] text-white overflow-hidden relative font-sans transition-all duration-500 shadow-2xl"
    )}>
      <div className="absolute inset-0 bg-gradient-to-br from-blue-900/10 via-black to-blue-900/10 opacity-50 pointer-events-none" />

      <header className="relative flex h-14 items-center justify-between bg-[#1A1A1A]/80 backdrop-blur-2xl px-6 border-b border-white/5 z-30 shadow-2xl">
          <div className="flex items-center gap-4">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-xs shadow-lg shadow-blue-500/20">L</div>
              <div className="flex flex-col -space-y-0.5">
                <span className="text-sm font-black tracking-tight">{participantName} Meeting</span>
                <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-full border border-primary/20">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                        <span className="text-[10px] font-black text-primary uppercase">ID: {callId}</span>
                    </div>
                    <span className="text-[10px] text-gray-500 font-bold tracking-tighter uppercase whitespace-nowrap">
                    {formatDuration(callDuration)}
                    </span>
                    <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-5 w-5 text-gray-500 hover:text-primary transition-colors"
                        onClick={() => {
                            navigator.clipboard.writeText(callId);
                            toast.success("Đã sao chép mã phòng (Guid)");
                        }}
                    >
                        <Send className="w-3 h-3" />
                    </Button>
                </div>
              </div>
          </div>
          <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400 hover:text-white" onClick={() => setIsMinimized(true)}>
                  <Minimize2 className="h-4 w-4" />
              </Button>
          </div>
      </header>

      <main className="flex-1 flex min-h-0 relative z-10">
        <section className="flex-1 p-6 flex flex-col relative overflow-hidden">
            <div className={cn(
                "grid gap-4 w-full h-full p-2 place-items-center",
                allStreams.length === 1 ? "grid-cols-1" : allStreams.length === 2 ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"
            )}>
                {allStreams.map((p) => (
                    <div key={p.id} className="relative rounded-3xl overflow-hidden bg-[#121212] w-full h-full border border-white/5 shadow-2xl group transition-all duration-500 hover:border-primary/30 flex items-center justify-center">
                        <VideoPlayer 
                            stream={p.stream} 
                            isLocal={p.isLocal} 
                            isCameraOn={p.isLocal ? isCameraOn : true} 
                            userAvatar={p.avatar}
                            userName={p.name}
                        />
                        <div className="absolute bottom-4 left-4 bg-black/60 backdrop-blur-xl px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest ring-1 ring-white/10 flex items-center gap-2 z-20">
                            {p.name} {p.isLocal && "(Tôi)"}
                        </div>
                    </div>
                ))}
            </div>

            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1A1A1A]/95 backdrop-blur-2xl p-2 rounded-[2rem] border border-white/10 shadow-2xl">
                <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setIsCameraOn(!isCameraOn)} className={cn("h-14 w-14 rounded-full", !isCameraOn && "bg-primary text-white")}>
                                {isCameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Bật/Tắt Camera</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button variant="ghost" size="icon" onClick={() => setIsMuted(!isMuted)} className={cn("h-14 w-14 rounded-full", isMuted && "bg-primary text-white")}>
                                {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>Bật/Tắt Mic</TooltipContent>
                    </Tooltip>
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
                        <Button onClick={() => {
                            const durationStr = formatDuration(callDuration);
                            if (convId) sendMessage(convId, `📞 Cuộc họp đã kết thúc (${durationStr})`, 'Text');
                            endCall();
                            onEndCall();
                        }} className="h-14 px-8 rounded-3xl bg-red-600 hover:bg-red-700 text-white font-black uppercase tracking-widest text-[11px] shadow-xl shadow-red-600/20">
                            <PhoneOff className="h-5 w-5 mr-3" /> Kết thúc
                        </Button>
                    </div>
                </TooltipProvider>
            </div>
        </section>

        {(showPeople || showChat) && (
            <aside className="w-96 bg-[#121212]/95 border-l border-white/5 backdrop-blur-3xl flex flex-col z-20 animate-in slide-in-from-right duration-500">
                <header className="p-6 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-black text-sm uppercase tracking-widest text-primary">{showPeople ? 'Người tham gia' : 'Trò chuyện'}</h3>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" onClick={() => { setShowPeople(false); setShowChat(false); }}><X className="h-4 w-4" /></Button>
                </header>
                
                {showPeople && (
                    <ScrollArea className="flex-1 p-6">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                {allStreams.map((p, i) => (
                                    <div key={i} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 group">
                                        <Avatar className="h-10 w-10">
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-black uppercase">{p.name?.substring(0, 1)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-black truncate text-white/90">{p.name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
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
                                            <DecryptedText 
                                                message={msg}
                                                user={user}
                                                mySenderKey={(useSignalR() as any).mySenderKey}
                                                peerSenderKeys={(useSignalR() as any).peerSenderKeys}
                                                peerIdentityKeys={(useSignalR() as any).peerIdentityKeys}
                                                identityKeys={(useSignalR() as any).identityKeys}
                                                initiateHandshake={(useSignalR() as any).initiateE2EEHandshake}
                                            />
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
      </main>
    </div>
  )
}
