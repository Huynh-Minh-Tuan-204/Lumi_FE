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

import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Monitor, MoreHorizontal, Users, MessageSquare, 
  X, Send, Smile, ShieldCheck, Minimize2, Maximize2, Download, FileText
} from 'lucide-react'
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

function DecryptedText({ 
    message, user, mySenderKey, peerSenderKeys, peerIdentityKeys, identityKeys, initiateHandshake 
}: { 
    message: any, user: any, mySenderKey: any, peerSenderKeys: Map<number, any>, 
    peerIdentityKeys: Map<number, any>, identityKeys: any, initiateHandshake: (cid: number) => Promise<void> 
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
            if (!content || content === "[Attachment]") { setDecrypted(""); return; }
            try {
                const isOwn = user && senderId === user.id;
                const senderKey = isOwn ? mySenderKey : peerSenderKeys?.get(senderId);
                const senderIdPubKey = isOwn ? identityKeys?.publicKey : peerIdentityKeys?.get(senderId);
                if (senderKey && senderIdPubKey && iv && sig) {
                    const result = await decryptMessagePro(content, iv, sig, senderKey, senderIdPubKey);
                    setDecrypted(result);
                } else if (!iv || !sig) {
                    setDecrypted(content);
                } else {
                    setDecrypted("⏳ [Mã hóa đầu cuối]");
                    if (message.conversationId) initiateHandshake(message.conversationId);
                }
            } catch (e) { setDecrypted("[Lỗi giải mã]"); }
        };
        decrypt();
    }, [message.id, message.message, message.encryptedContent, mySenderKey, peerSenderKeys?.size, peerIdentityKeys?.size]);
    return <span className="leading-relaxed">{decrypted}</span>;
}

function VideoPlayer({ stream, isLocal, isCameraOn, userAvatar, userName, isMuted }: { 
  stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean, userAvatar?: string, userName: string, isMuted?: boolean 
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream])

  return (
    <div className="relative w-full h-full bg-[#121212] flex items-center justify-center overflow-hidden rounded-2xl border border-white/5 group shadow-2xl">
      <video
        ref={videoRef} autoPlay playsInline muted={isLocal}
        className={cn("max-w-full max-h-full object-contain transition-all duration-700", isLocal && "scale-x-[-1]", !isCameraOn && "opacity-0 invisible")}
      />
      {!isCameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1e1e1e] to-[#0f0f0f]">
          <Avatar className="h-24 w-24 ring-4 ring-primary/20 shadow-2xl">
            <AvatarImage src={userAvatar} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary text-3xl font-black">{userName?.[0] || "?"}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-4 left-4 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border border-white/10 z-20">
        {isMuted && <MicOff className="h-3 w-3 text-red-500 mr-1" />}
        {userName} {isLocal && "(Bạn)"}
      </div>
    </div>
  )
}

export function VideoCallUI({ callId, callType, participantName, onEndCall, initialMic = true, initialCam = true }: VideoCallUIProps) {
  const { user, token } = useAuth()
  const signalRData = useSignalR()
  const { sendMessage, lastMessage, mySenderKey, peerSenderKeys, peerIdentityKeys, identityKeys, initiateE2EEHandshake } = signalRData
  
  const { 
    joinCall, endCall, activeCallId, localStream, remotePeers,
    isMuted, setIsMuted, isCameraOn, setIsCameraOn,
    isMinimized, setIsMinimized, isScreenSharing, toggleScreenShare,
    setConversationId
  } = useCall()
  
  const router = useRouter()
  const [callDuration, setCallDuration] = useState(0)
  const [showChat, setShowChat] = useState(false)
  const [convId, setConvId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [callMessages, setCallMessages] = useState<ChatMessage[]>([])
  const chatEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const timer = setInterval(() => setCallDuration(v => v + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    const fetch = async () => {
      if (!token || !callId) return
      try {
        const meeting = await meetingsApi.getMeeting(token, callId)
        const cid = meeting.conversationId || meeting.ConversationId
        setConvId(cid); setConversationId(cid);
        const history = await conversationsApi.getMessages(token, cid)
        setCallMessages(history.map((d: any) => ({
          id: d.id || d.Id, conversationId: cid, senderId: d.senderId || d.SenderId,
          sender: d.senderName || d.sender || 'User', message: d.content || d.encryptedContent || "",
          time: new Date(d.createdAt), iv: d.iv, messageType: d.messageType
        })))
      } catch (e) { console.error(e) }
    }
    fetch()
  }, [callId, token, setConversationId])

  useEffect(() => { if (callId && token) joinCall(callId, callType); }, [callId, token, callType, joinCall])
  
  // Áp dụng thiết lập Mic/Cam ban đầu từ Lobby
  useEffect(() => {
    setIsMuted(!initialMic);
    setIsCameraOn(initialCam);
  }, [initialMic, initialCam, setIsMuted, setIsCameraOn]);

  useEffect(() => {
    if (lastMessage && lastMessage.conversationId === convId) {
      setCallMessages(prev => [...prev.filter(m => m.id !== lastMessage.id), lastMessage]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  }, [lastMessage, convId]);

  const allStreams = useMemo(() => [
    { id: user?.id || 0, name: user?.fullName || "Bạn", stream: localStream, isLocal: true, avatar: getAvatarUrl(user?.id), cameraOn: isCameraOn, muted: isMuted },
    ...remotePeers.map(p => ({ id: p.userId, name: p.userName, stream: p.stream, isLocal: false, avatar: getAvatarUrl(p.userId), cameraOn: true, muted: false }))
  ], [user, remotePeers, localStream, isCameraOn, isMuted]);

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-white overflow-hidden font-sans">
      <header className="flex h-14 items-center justify-between bg-[#1A1A1A]/80 backdrop-blur-md px-6 border-b border-white/5 z-30">
          <div className="flex items-center gap-4">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center font-black">L</div>
              <div className="flex flex-col">
                <span className="text-xs font-black uppercase tracking-widest">{participantName} Meeting</span>
                <span className="text-[10px] text-gray-400 font-bold">{formatDuration(callDuration)} | ID: {callId}</span>
              </div>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMinimized(true)}><Minimize2 className="h-4 w-4" /></Button>
      </header>

      <main className="flex-1 flex min-h-0 relative">
        <section className="flex-1 p-4 md:p-6 grid gap-4 auto-rows-fr place-items-center relative overflow-hidden" 
                 style={{ gridTemplateColumns: `repeat(${allStreams.length > 2 ? 2 : allStreams.length}, 1fr)` }}>
            {allStreams.map(p => (
                <VideoPlayer key={p.id} stream={p.stream} isLocal={p.isLocal} isCameraOn={p.cameraOn} userAvatar={p.avatar} userName={p.name} isMuted={p.muted} />
            ))}

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-[#1A1A1A]/90 backdrop-blur-xl p-3 rounded-[2.5rem] border border-white/10 shadow-2xl z-20">
                <TooltipProvider>
                    <Button variant={isCameraOn ? "ghost" : "destructive"} size="icon" onClick={() => setIsCameraOn(!isCameraOn)} className="h-12 w-12 rounded-full">
                        {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                    <Button variant={isMuted ? "destructive" : "ghost"} size="icon" onClick={() => setIsMuted(!isMuted)} className="h-12 w-12 rounded-full">
                        {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                    <div className="w-px h-8 bg-white/10 mx-1" />
                    <Button variant={isScreenSharing ? "secondary" : "ghost"} size="icon" onClick={toggleScreenShare} className="h-12 w-12 rounded-full">
                        <Monitor className="h-5 w-5" />
                    </Button>
                    <Button variant={showChat ? "secondary" : "ghost"} size="icon" onClick={() => setShowChat(!showChat)} className="h-12 w-12 rounded-full">
                        <MessageSquare className="h-5 w-5" />
                    </Button>
                    <div className="w-px h-8 bg-white/10 mx-1" />
                    <Button onClick={() => { endCall(); onEndCall(); }} className="h-12 px-6 rounded-full bg-red-600 hover:bg-red-700 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-red-600/20">
                        <PhoneOff className="h-4 w-4 mr-2" /> Kết thúc
                    </Button>
                </TooltipProvider>
            </div>
        </section>

        {showChat && (
            <aside className="w-80 md:w-96 bg-[#121212] border-l border-white/5 flex flex-col z-20 animate-in slide-in-from-right duration-300">
                <header className="p-4 border-b border-white/5 flex items-center justify-between">
                    <h3 className="font-black text-[10px] uppercase tracking-[0.2em] text-primary">Trò chuyện trực tiếp</h3>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowChat(false)}><X className="h-4 w-4" /></Button>
                </header>
                <ScrollArea className="flex-1 p-4">
                    <div className="space-y-4">
                        {callMessages.map(msg => (
                            <div key={msg.id} className={cn("flex flex-col gap-1", msg.senderId === user?.id ? "items-end" : "items-start")}>
                                <p className="text-[9px] font-black text-white/20 uppercase tracking-widest">{msg.sender}</p>
                                <div className={cn("px-3 py-2 text-xs rounded-xl max-w-[90%] break-words", msg.senderId === user?.id ? "bg-primary text-white" : "bg-white/5 border border-white/10")}>
                                  <DecryptedText message={msg} user={user} mySenderKey={mySenderKey} peerSenderKeys={peerSenderKeys} peerIdentityKeys={peerIdentityKeys} identityKeys={identityKeys} initiateHandshake={initiateE2EEHandshake} />
                                </div>
                            </div>
                        ))}
                        <div ref={chatEndRef} />
                    </div>
                </ScrollArea>
                <div className="p-4 border-t border-white/5 flex gap-2">
                    <input className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs outline-none focus:border-primary/50 font-bold" placeholder="Nhập tin nhắn..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (sendMessage(convId!, chatInput, 'PLAIN'), setChatInput(''))} />
                    <Button size="icon" className="h-9 w-9 bg-primary" onClick={() => { sendMessage(convId!, chatInput, 'PLAIN'); setChatInput(''); }}><Send className="h-4 w-4" /></Button>
                </div>
            </aside>
        )}
      </main>
    </div>
  )
}
