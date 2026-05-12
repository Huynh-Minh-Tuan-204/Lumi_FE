'use client'

import { useMemo, useEffect, useRef, useState, useCallback } from 'react'
import { cn, getAvatarUrl, getAttachmentUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi, conversationsApi } from '@/lib/api'
import { useSignalR, ChatMessage } from '@/hooks/use-signalr'
import { useCall } from '@/hooks/use-call'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, 
  Monitor, MoreHorizontal, Users, MessageSquare, 
  X, Send, Smile, ShieldCheck, Minimize2, Maximize2, Download, FileText, Image as ImageIcon,
  Circle, StopCircle, Share2
} from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { VideoPlayer } from '@/features/call/video-player'
import { DecryptedText } from '@/features/chat/decrypted-text'
import { AttachmentImage } from '@/features/chat/attachment-image'

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

// [Fix 5] Adaptive grid config based on participant count
function getGridConfig(count: number) {
  if (count === 1) return { gridClass: 'grid-cols-1', maxW: 'max-w-5xl', aspect: 'aspect-video' }
  if (count === 2) return { gridClass: 'grid-cols-1 md:grid-cols-2', maxW: 'max-w-7xl', aspect: 'aspect-video' }
  if (count === 3) return { gridClass: 'grid-cols-2', maxW: 'max-w-7xl', aspect: 'aspect-video md:aspect-[16/10]' }
  if (count === 4) return { gridClass: 'grid-cols-2', maxW: 'max-w-6xl', aspect: 'aspect-video' }
  if (count <= 6) return { gridClass: 'grid-cols-2 md:grid-cols-3', maxW: 'max-w-7xl', aspect: 'aspect-video' }
  return { gridClass: 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4', maxW: 'max-w-full', aspect: 'aspect-video' }
}

// Fixed Attachment Renderer inside Call Chat
function CallChatAttachment({ message, token }: { message: any, token?: string }) {
    if (!message.attachments || message.attachments.length === 0) return null;
    const att = message.attachments[0];
    const isImage = att.contentType?.startsWith('image/') || (typeof att.fileName === 'string' && att.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i));
    
    if (isImage) {
        return (
            <div className="mt-2 rounded-lg overflow-hidden border border-white/10 cursor-pointer hover:ring-2 ring-primary transition-all" onClick={() => window.open(getAttachmentUrl(att.id || att.Id, token), '_blank')}>
                <AttachmentImage
                  src={getAttachmentUrl(att.id || att.Id, token)}
                  alt="attachment"
                  className="max-w-full h-auto object-cover"
                  title="Bấm để xem ảnh lớn"
                />
            </div>
        );
    }
    return (
        <div className="mt-2 p-2 bg-white/5 rounded-lg flex items-center gap-2 border border-white/10">
            <div className="p-1.5 bg-blue-500/10 rounded-lg">
                <FileText className="h-4 w-4 text-blue-400" />
            </div>
            <span className="text-[10px] truncate flex-1 font-bold">{att.fileName}</span>
            <a href={getAttachmentUrl(att.id || att.Id, token)} target="_blank" rel="noopener noreferrer" className="p-1.5 hover:bg-white/10 rounded-md transition-colors">
                <Download className="h-3.5 w-3.5 text-primary" />
            </a>
        </div>
    );
}

function CallChatDecryptedText(props: any) {
  return (
    <div className="flex flex-col">
      <DecryptedText {...props} />
      <CallChatAttachment message={props.message} token={props.token} />
    </div>
  )
}

import { useIsMobile } from '@/hooks/use-mobile'

export function VideoCallUI({ callId, callType, participantName, onEndCall, initialMic = true, initialCam = true }: VideoCallUIProps) {
  const { user, token } = useAuth()
  const signalRData = useSignalR()
  const { sendMessage, lastMessage, mySenderKey, peerSenderKeys, peerIdentityKeys, identityKeys, initiateE2EEHandshake, keyVersion } = signalRData
  
  const { 
    joinCall, endCall, activeCallId, localStream, remotePeers, screenStream,
    isMuted, setIsMuted, isCameraOn, setIsCameraOn,
    isMinimized, setIsMinimized, isScreenSharing, toggleScreenShare,
    isRecording, startRecording, stopRecording,
    setConversationId
  } = useCall()
  
  const router = useRouter()
  const isMobile = useIsMobile()
  const [callDuration, setCallDuration] = useState(0)
  const [sidebarType, setSidebarType] = useState<'chat' | 'people' | null>(null)
  const [convId, setConvId] = useState<number | null>(null)
  const [hostId, setHostId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [isEnding, setIsEnding] = useState(false)
  const [callMessages, setCallMessages] = useState<ChatMessage[]>([])
  const [pinnedUserId, setPinnedUserId] = useState<number | null>(null)
  const [activeSpeakerId, setActiveSpeakerId] = useState<number | null>(null)
  
  const chatEndRef = useRef<HTMLDivElement>(null)
  const joinedRef = useRef<string | null>(null)

  useEffect(() => {
    const timer = setInterval(() => setCallDuration(v => v + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const allStreams = useMemo(() => [
    { id: user?.id || 0, name: user?.fullName || "Bạn", stream: localStream, isLocal: true, avatar: getAvatarUrl(user?.id), cameraOn: isCameraOn, muted: isMuted, isHost: (user?.id === hostId) },
    ...remotePeers.map(p => ({ id: p.userId, name: p.userName, stream: p.stream, isLocal: false, avatar: getAvatarUrl(p.userId), cameraOn: true, muted: false, isHost: (p.userId === hostId) }))
  ], [user, remotePeers, localStream, isCameraOn, isMuted, hostId]);

  const activePeers = allStreams.length;
  const isSharing = isScreenSharing || !!screenStream;

  // Active Speaker Detection logic
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const analysers: { id: number, analyser: AnalyserNode }[] = [];

    allStreams.forEach(p => {
      if (p.stream && p.stream.getAudioTracks().length > 0 && !p.muted) {
        try {
          const source = audioContext.createMediaStreamSource(p.stream);
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 32;
          source.connect(analyser);
          analysers.push({ id: p.id, analyser });
        } catch (e) { /* Ignore cross-origin audio issues */ }
      }
    });

    const checkAudio = setInterval(() => {
      let maxLevel = 0;
      let speakerId: number | null = null;

      analysers.forEach(({ id, analyser }) => {
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        analyser.getByteFrequencyData(dataArray);
        const volume = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        if (volume > 15 && volume > maxLevel) { // Threshold for "speaking"
          maxLevel = volume;
          speakerId = id;
        }
      });

      setActiveSpeakerId(speakerId);
    }, 400);

    return () => {
      clearInterval(checkAudio);
      audioContext.close();
    };
  }, [allStreams]);

  useEffect(() => {
    const fetch = async () => {
      if (!token || !callId) return
      try {
        const meeting = await meetingsApi.getMeeting(token, callId)
        const cid = meeting.conversationId || meeting.ConversationId
        const hId = meeting.creatorId || meeting.CreatorId || meeting.hostId || meeting.HostId || 
                   meeting.createdBy || meeting.CreatedBy ||
                   meeting.creator?.id || meeting.Creator?.Id || meeting.host?.id || meeting.Host?.Id
        const finalHostId = hId ? Number(hId) : null;
        setConvId(cid); setConversationId(cid); setHostId(finalHostId);
        const history = await conversationsApi.getMessages(token, cid)
        setCallMessages(history.map((d: any) => ({
          id: d.id || d.Id, conversationId: cid, senderId: d.senderId || d.SenderId,
          sender: d.senderName || d.sender || 'User', message: d.content || d.encryptedContent || "",
          time: new Date(d.createdAt), iv: d.iv, sig: d.signature || d.sig, 
          messageType: d.messageType, attachments: d.attachments || d.Attachments || []
        })))
        // Auto-handshake for E2EE messages
        if (initiateE2EEHandshake) initiateE2EEHandshake(cid);
      } catch (e) { console.error(e) }
    }
    fetch()
  }, [callId, token, setConversationId, initiateE2EEHandshake])

  useEffect(() => { 
    if (callId && token && !activeCallId && !isEnding && joinedRef.current !== callId) {
        joinedRef.current = callId as string;
        joinCall(callId as string, callType); 
    }
  }, [callId, token, callType, joinCall, activeCallId, isEnding])

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

  // Determine grid columns based on rules
  const getGridCols = () => {
    if (pinnedUserId) return 'grid-cols-1 md:grid-cols-4'; // Pinned mode: main + sidebar
    if (activePeers === 1) return 'grid-cols-1';
    if (activePeers === 2) return 'grid-cols-1 md:grid-cols-2';
    if (activePeers <= 4) return 'grid-cols-2';
    if (activePeers <= 9) return 'grid-cols-2 md:grid-cols-3';
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4';
  };

  return (
    <div className="flex h-screen flex-col bg-[#0a0a0a] text-white overflow-hidden font-sans relative">
      <header className="flex h-14 items-center justify-between bg-[#1A1A1A]/95 backdrop-blur-2xl px-6 border-b border-white/5 z-30">
          <div className="flex items-center gap-4">
              <div className="h-8 w-8 bg-primary rounded-lg flex items-center justify-center font-black shadow-lg shadow-primary/20">L</div>
              <div className="flex flex-col -space-y-0.5">
                <span className="text-xs font-black uppercase tracking-widest">{participantName} Meeting</span>
                <span className="text-[10px] text-primary font-black uppercase tracking-[0.1em] flex items-center gap-2">
                   <ShieldCheck className="h-2.5 w-2.5" /> MÃ PHÒNG: {callId} | {formatDuration(callDuration)}
                </span>
              </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-white/60 hover:text-white text-[10px] font-black uppercase tracking-widest gap-2"
              onClick={async () => {
                const url = `${window.location.origin}/call/${callId}`;
                await navigator.clipboard.writeText(url).catch(() => {});
                toast.success('Đã copy link phòng họp!');
              }}
            >
              <Share2 className="h-3.5 w-3.5" />
              Copy Link
            </Button>
            <TooltipProvider>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-white/40 hover:text-white" onClick={() => { setIsMinimized(true); router.push('/chat'); }}>
                            <Minimize2 className="h-4 w-4" />
                        </Button>
                    </TooltipTrigger>
                    <TooltipContent>Thu nhỏ (Về Home)</TooltipContent>
                </Tooltip>
            </TooltipProvider>
          </div>
      </header>

      <main className="flex-1 flex min-h-0 relative">
        <section className="flex-1 p-6 relative overflow-hidden flex flex-col items-center justify-center">
            <div className="flex-1 w-full h-full p-2 flex items-center justify-center overflow-hidden">
                {isSharing ? (
                    /* Screen Sharing Layout: 80% screen, 20% sidebar */
                    <div className="flex flex-col md:flex-row w-full h-full gap-4">
                        <div className="flex-[4] relative rounded-2xl overflow-hidden bg-black border border-white/10 shadow-2xl">
                           <VideoPlayer 
                              stream={screenStream || localStream} 
                              isLocal={true} 
                              isCameraOn={true} 
                              userName="Đang chia sẻ màn hình" 
                           />
                           <div className="absolute top-4 left-4 bg-primary/90 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                               <Monitor className="h-3 w-3" /> Đang trình chiếu
                           </div>
                        </div>
                        <div className="flex-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto scrollbar-hide p-1">
                            {allStreams.map(p => (
                                <div key={p.id} className="relative aspect-video w-48 md:w-full flex-shrink-0 rounded-xl overflow-hidden border border-white/5 bg-[#121212] group">
                                    <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.cameraOn} userAvatar={p.avatar} userName={p.name} isMuted={p.muted} />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/10 hover:bg-primary" onClick={() => setPinnedUserId(p.id)}>
                                            <Maximize2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : pinnedUserId ? (
                    /* Pinned User Layout */
                    <div className="flex flex-col md:flex-row w-full h-full gap-4">
                        <div className="flex-[4] relative rounded-2xl overflow-hidden bg-[#121212] border border-primary/20 shadow-2xl">
                           {allStreams.find(p => p.id === pinnedUserId) && (
                               <>
                                    <VideoPlayer 
                                        stream={allStreams.find(p => p.id === pinnedUserId)!.stream} 
                                        isLocal={allStreams.find(p => p.id === pinnedUserId)!.isLocal} 
                                        isCameraOn={allStreams.find(p => p.id === pinnedUserId)!.cameraOn} 
                                        userAvatar={allStreams.find(p => p.id === pinnedUserId)!.avatar} 
                                        userName={allStreams.find(p => p.id === pinnedUserId)!.name} 
                                        isMuted={allStreams.find(p => p.id === pinnedUserId)!.muted} 
                                    />
                                    <Button 
                                        size="sm" 
                                        variant="secondary" 
                                        className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-[10px] font-black uppercase tracking-widest rounded-full"
                                        onClick={() => setPinnedUserId(null)}
                                    >
                                        Bỏ ghim
                                    </Button>
                               </>
                           )}
                        </div>
                        <div className="flex-1 flex md:flex-col gap-3 overflow-x-auto md:overflow-y-auto scrollbar-hide p-1">
                            {allStreams.filter(p => p.id !== pinnedUserId).map(p => (
                                <div key={p.id} className="relative aspect-video w-40 md:w-full flex-shrink-0 rounded-xl overflow-hidden border border-white/5 bg-[#121212] group">
                                    <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.cameraOn} userAvatar={p.avatar} userName={p.name} isMuted={p.muted} />
                                    <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/10 hover:bg-primary" onClick={() => setPinnedUserId(p.id)}>
                                            <Maximize2 className="h-4 w-4" />
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    /* Standard Dynamic Grid Layout */
                    <div 
                        className={cn(
                            "grid gap-4 w-full h-full max-w-7xl mx-auto items-center justify-center content-center overflow-y-auto scrollbar-hide py-4",
                            getGridCols()
                        )}
                    >
                        {allStreams.map((p) => (
                            <div
                                key={p.id}
                                className={cn(
                                    'relative rounded-2xl overflow-hidden bg-[#121212] border border-white/5 shadow-2xl transition-all duration-500 aspect-video group w-full',
                                    activePeers === 1 && "max-w-5xl mx-auto scale-105",
                                    activePeers === 2 && "max-w-full",
                                    p.id === activeSpeakerId && "ring-2 ring-primary border-primary/50"
                                )}
                            >
                                <VideoPlayer stream={p.stream} isLocal={p.isLocal} isCameraOn={p.cameraOn} userAvatar={p.avatar} userName={p.name} isMuted={p.muted} />
                                
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full bg-white/10 hover:bg-primary" onClick={() => setPinnedUserId(p.id)} title="Ghim video">
                                        <Maximize2 className="h-4 w-4" />
                                    </Button>
                                </div>

                                {!p.isLocal && !p.stream && (
                                    <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center gap-3 animate-pulse">
                                        <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest">Đang kết nối...</p>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Waiting for peers banner */}
            {sidebarType && activePeers > 1 && (
                <div className="absolute top-6 right-6 flex flex-col gap-3 z-10 pointer-events-none">
                    {/* Optional: could show mini-vids here if preferred */}
                </div>
            )}
            
            {/* Waiting for peers banner */}
            {activePeers === 1 && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 bg-black/60 backdrop-blur-md px-6 py-3 rounded-full border border-white/10 flex items-center gap-3 animate-in fade-in slide-in-from-top-10 duration-500 z-10 shadow-xl">
                    <div className="flex gap-1">
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs font-bold text-white/80 uppercase tracking-widest">Đang chờ người khác tham gia...</span>
                </div>
            )}

            {/* Floating Controls */}
            <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#1A1A1A]/95 backdrop-blur-3xl p-3 rounded-[3rem] border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-40 scale-110 md:scale-100 origin-bottom">
                <TooltipProvider>
                    <Button variant={isCameraOn ? "ghost" : "destructive"} size="icon" onClick={() => setIsCameraOn(!isCameraOn)} className={cn("h-14 w-14 rounded-full", isCameraOn && "bg-white/5")}>
                        {isCameraOn ? <Video className="h-6 w-6" /> : <VideoOff className="h-6 w-6" />}
                    </Button>
                    <Button variant={isMuted ? "destructive" : "ghost"} size="icon" onClick={() => setIsMuted(!isMuted)} className={cn("h-14 w-14 rounded-full", !isMuted && "bg-white/5")}>
                        {isMuted ? <MicOff className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
                    </Button>
                    
                    <div className="w-px h-10 bg-white/10 mx-1" />
                    
                    <Button variant={isScreenSharing ? "secondary" : "ghost"} size="icon" onClick={toggleScreenShare} className={cn("h-14 w-14 rounded-full", isScreenSharing && "bg-primary text-white shadow-lg shadow-primary/30")}>
                        <Monitor className="h-6 w-6" />
                    </Button>
                    
                    <Button variant={sidebarType === 'people' ? "secondary" : "ghost"} size="icon" onClick={() => setSidebarType(sidebarType === 'people' ? null : 'people')} className={cn("h-14 w-14 rounded-full", sidebarType === 'people' && "bg-primary text-white")}>
                        <Users className="h-6 w-6" />
                    </Button>
                    
                    <Button variant={sidebarType === 'chat' ? "secondary" : "ghost"} size="icon" onClick={() => setSidebarType(sidebarType === 'chat' ? null : 'chat')} className={cn("h-14 w-14 rounded-full", sidebarType === 'chat' && "bg-primary text-white")}>
                        <MessageSquare className="h-6 w-6" />
                    </Button>
                    
                    <div className="w-px h-10 bg-white/10 mx-1" />

                    {/* [Fix 6] Record button with better UI feedback */}
                    <Button 
                      variant="ghost"
                      size="icon"
                      onClick={isRecording ? stopRecording : startRecording}
                      className={cn(
                        'h-14 w-14 rounded-full transition-all duration-300',
                        isRecording
                          ? 'bg-red-500 text-white shadow-xl shadow-red-500/40 scale-110'
                          : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-red-400'
                      )}
                      title={isRecording ? 'Dừng ghi hình' : 'Bắt đầu ghi hình'}
                    >
                        {isRecording ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="h-3 w-3 rounded-sm bg-white animate-pulse" />
                            <span className="text-[8px] font-black">STOP</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-0.5">
                            <div className="h-3 w-3 rounded-full bg-red-500" />
                            <span className="text-[8px] font-black opacity-60">REC</span>
                          </div>
                        )}
                    </Button>
                    
                    <Button onClick={() => { setIsEnding(true); endCall(); onEndCall(); }} className="h-14 px-8 rounded-full bg-red-600 hover:bg-red-700 text-white font-black uppercase text-xs tracking-[0.1em] shadow-xl shadow-red-600/30 transition-transform active:scale-95 z-50">
                        <PhoneOff className="h-5 w-5 mr-3" /> Kết thúc
                    </Button>
                </TooltipProvider>
            </div>
        </section>

        {sidebarType && (
            <aside className="w-96 h-full bg-[#0f0f0f]/95 border-l border-white/5 backdrop-blur-3xl flex flex-col z-50 animate-in slide-in-from-right duration-500 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] overflow-hidden">
                <header className="p-6 border-b border-white/5 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-[12px] uppercase tracking-[0.2em] text-primary">{sidebarType === 'chat' ? 'Trò chuyện trực tiếp' : 'Thành viên'}</h3>
                        <p className="text-[10px] text-white/30 font-bold mt-1 uppercase tracking-widest">{sidebarType === 'chat' ? 'Tin nhắn được mã hóa E2EE' : `${activePeers} người tham gia`}</p>
                    </div>
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-white/10" onClick={() => setSidebarType(null)}><X className="h-4 w-4" /></Button>
                </header>
                
                {sidebarType === 'people' && (
                    <ScrollArea className="flex-1">
                        <div className="p-6 space-y-4">
                            {allStreams.map(p => (
                                <div key={p.id} className="flex items-center gap-4 p-3 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors group">
                                    <div className="relative">
                                        <Avatar className="h-10 w-10 border-2 border-primary/20">
                                            <AvatarImage src={p.avatar} className="object-cover" />
                                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">{p.name?.[0]}</AvatarFallback>
                                        </Avatar>
                                        <div className={cn("absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-black", p.stream ? "bg-green-500" : "bg-gray-500" )} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-black truncate text-white/90 uppercase tracking-tight">{p.name} {p.isLocal && "(Bạn)"}</p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {p.muted && <MicOff className="h-2.5 w-2.5 text-red-500" />}
                                            <span className={cn("text-[10px] font-bold uppercase", p.isHost ? "text-primary" : "text-white/20")}>
                                                {p.isHost ? 'Người tổ chức' : 'Người tham gia'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {sidebarType === 'chat' && (
                    <>
                        <ScrollArea className="flex-1 min-h-0">
                            <div className="p-6 space-y-6">
                                {callMessages.map(msg => (
                                    <div key={msg.id} className={cn("flex flex-col gap-2", msg.senderId === user?.id ? "items-end" : "items-start")}>
                                        <div className="flex items-center gap-2">
                                            {msg.senderId !== user?.id && <Avatar className="h-5 w-5"><AvatarImage src={getAvatarUrl(msg.senderId)} /><AvatarFallback className="text-[8px]">{msg.sender?.[0]}</AvatarFallback></Avatar>}
                                            <p className="text-[10px] font-black text-white/20 uppercase tracking-widest">{msg.sender}</p>
                                        </div>
                                        <div className={cn("px-4 py-2.5 text-xs rounded-2xl max-w-[85%] break-words shadow-sm", msg.senderId === user?.id ? "bg-primary text-white rounded-tr-none" : "bg-white/5 border border-white/10 rounded-tl-none")}>
                                            <CallChatDecryptedText message={msg} user={user} mySenderKey={mySenderKey} peerSenderKeys={peerSenderKeys} peerIdentityKeys={peerIdentityKeys} identityKeys={identityKeys} initiateHandshake={initiateE2EEHandshake} token={token} keyVersion={keyVersion} />
                                        </div>
                                    </div>
                                ))}
                                <div ref={chatEndRef} />
                            </div>
                        </ScrollArea>
                        <div className="p-6 border-t border-white/5 bg-black/20">
                            <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 focus-within:border-primary/50 transition-all">
                                <input className="flex-1 bg-transparent py-2 text-xs outline-none font-bold placeholder:text-white/20 placeholder:font-medium" placeholder="Viết tin nhắn công khai..." value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && chatInput.trim() && convId && (sendMessage(convId, chatInput), setChatInput(''))} />
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10 rounded-full" onClick={() => { if(chatInput.trim() && convId) { sendMessage(convId, chatInput, 'PLAIN'); setChatInput(''); } }}>
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </>
                )}
            </aside>
        )}
      </main>

    </div>
  )
}

