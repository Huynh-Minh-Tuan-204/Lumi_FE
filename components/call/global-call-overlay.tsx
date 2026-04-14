'use client'

import React, { useRef, useEffect } from 'react'
import { useCall } from '@/hooks/use-call'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { 
  Mic, MicOff, Video, VideoOff, PhoneOff, Maximize2, 
  ChevronUp, ChevronDown 
} from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { useRouter, usePathname } from 'next/navigation'

export function GlobalCallOverlay() {
  const { 
    activeCallId, localStream, remotePeers, 
    isMuted, setIsMuted, isCameraOn, setIsCameraOn, 
    isMinimized, setIsMinimized, endCall 
  } = useCall()
  
  const pathname = usePathname()
  const router = useRouter()
  
  // Only show overlay if we have an active call AND we are NOT on the full call page
  // OR if we are on the call page but strictly minimized (though usually call page is full)
  const isOnCallPage = pathname?.startsWith('/call/')
  
  if (!activeCallId || (isOnCallPage && !isMinimized)) return null

  const partner = remotePeers[0]
  const displayStream = partner ? partner.stream : localStream
  const isLocalDisplay = !partner
  const displayName = partner ? partner.userName : "Bạn (Đang đợi...)"

  return (
    <div className={cn(
        "fixed bottom-6 right-6 w-[320px] h-[180px] z-[99999] rounded-2xl border border-white/10 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.8)] overflow-hidden bg-[#0a0a0a] text-white transition-all duration-500 animate-in zoom-in-95",
        !isMinimized && isOnCallPage && "hidden" // Let the page handle it
    )}>
       <VideoOverlay stream={displayStream} isLocal={isLocalDisplay} isCameraOn={isCameraOn} />
       
       <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <div className="flex gap-2">
              <Button variant="secondary" size="icon" onClick={() => setIsMuted(!isMuted)} className={cn("h-10 w-10 rounded-full bg-white/20 hover:bg-white/40 border-none", isMuted && "bg-red-500/80 hover:bg-red-600")}>
                  {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
              </Button>
              <Button variant="secondary" size="icon" onClick={() => setIsCameraOn(!isCameraOn)} className={cn("h-10 w-10 rounded-full bg-white/20 hover:bg-white/40 border-none", !isCameraOn && "bg-red-500/80 hover:bg-red-600")}>
                    {isCameraOn ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
              </Button>
              <Button variant="destructive" size="icon" onClick={endCall} className="h-10 w-10 rounded-full">
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

function VideoOverlay({ stream, isLocal, isCameraOn }: { stream: MediaStream | null, isLocal: boolean, isCameraOn: boolean }) {
    const ref = useRef<HTMLVideoElement>(null)
    useEffect(() => {
        if (ref.current && stream) ref.current.srcObject = stream
    }, [stream])

    return (
        <div className="w-full h-full bg-black flex items-center justify-center">
            <video ref={ref} autoPlay playsInline muted={isLocal} className={cn("max-w-full max-h-full object-contain", isLocal && "scale-x-[-1]", !isCameraOn && "opacity-0")} />
            {!isCameraOn && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#121212]">
                   <div className="w-12 h-12 rounded-full bg-primary flex items-center justify-center font-bold text-xl">L</div>
                </div>
            )}
        </div>
    )
}
