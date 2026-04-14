'use client'

import React, { useRef, useEffect } from 'react'
import { useCall } from '@/hooks/use-call'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, 
  ChevronUp, ChevronDown 
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { getAvatarUrl } from '@/lib/utils'
import { useSignalR } from '@/hooks/use-signalr'

export function GlobalCallOverlay() {
  const { sendMessage } = useSignalR()
  const { 
    activeCallId, localStream, remotePeers, 
    isMuted, setIsMuted, isCameraOn, setIsCameraOn, 
    isMinimized, setIsMinimized, endCall,
    signalR 
  } = useCall()

  
  const { user } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  
  const isOnCallPage = pathname?.startsWith('/call/')
  
  if (!activeCallId || (isOnCallPage && !isMinimized)) return null

  const partner = remotePeers[0]
  const displayStream = partner ? partner.stream : localStream
  const isLocalDisplay = !partner
  const displayName = partner ? partner.userName : (user?.fullName || "Bạn")
  const displayAvatar = partner ? getAvatarUrl(partner.userId) : getAvatarUrl(user?.id)


  return (
    <div className={cn(
        "fixed bottom-6 right-6 w-[320px] h-[180px] z-[99999] rounded-2xl border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden bg-[#0a0a0a] text-white transition-all duration-500 animate-in zoom-in-95",
        !isMinimized && isOnCallPage && "hidden" // Let the page handle it
    )}>
       <VideoOverlay 
            stream={displayStream} 
            isLocal={isLocalDisplay} 
            isCameraOn={isCameraOn} 
            userAvatar={displayAvatar}
            userName={displayName}
       />

       
       <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <div className="flex gap-2">
              <Button variant="secondary" size="icon" onClick={() => setIsMuted(!isMuted)} className={cn("h-10 w-10 rounded-full bg-white/20 hover:bg-white/40 border-none", isMuted && "bg-red-500/80 hover:bg-red-600")}>
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button variant="secondary" size="icon" onClick={() => setIsCameraOn(!isCameraOn)} className={cn("h-10 w-10 rounded-full bg-white/20 hover:bg-white/40 border-none", !isCameraOn && "bg-red-500/80 hover:bg-red-600")}>
                    {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={() => {
                  if (conversationId) sendMessage(conversationId, `📞 Cuộc họp đã kết thúc`, 'Text');
                  endCall();
              }} className="h-10 w-10 rounded-full">
                  <PhoneOff className="h-4 w-4" />
              </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => { setIsMinimized(false); router.push(`/call/${activeCallId}`); }} className="rounded-full bg-primary hover:bg-primary/80 border-none text-[10px] font-black h-7">
             <Maximize2 className="h-3 w-3 mr-2" /> MỞ RỘNG
          </Button>
       </div>

       <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ring-1 ring-white/10">
            {displayName}
       </div>
    </div>
  )
}

function VideoOverlay({ stream, isLocal, isCameraOn, userAvatar, userName }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean, userAvatar: string, userName: string }) {
    const ref = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream
    }, [stream])

    return (
        <div className="w-full h-full bg-black flex items-center justify-center">
            <video ref={ref} autoPlay playsInline muted={isLocal} className={cn("max-w-full max-h-full object-contain", isLocal && "scale-x-[-1]", !isCameraOn && "opacity-0")} />
            {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#121212]">
                   <Avatar className="h-20 w-20 ring-2 ring-primary/20 shadow-2xl">
                      <AvatarImage src={userAvatar} className="object-cover" />
                      <AvatarFallback className="bg-primary/10 text-primary text-2xl font-black uppercase">
                        {userName?.substring(0, 1)}
                      </AvatarFallback>
                   </Avatar>
                </div>
            )}
        </div>
    )
}

