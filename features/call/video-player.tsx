'use client'

import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { MicOff } from 'lucide-react'

interface VideoPlayerProps {
  stream: MediaStream | null
  isLocal: boolean
  isCameraOn: boolean
  userAvatar?: string
  userName: string
  isMuted?: boolean
  isSmall?: boolean
}

export function VideoPlayer({ stream, isLocal, isCameraOn, userAvatar, userName, isMuted, isSmall = false }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  
  useEffect(() => { 
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream])

  return (
    <div className={cn(
        "relative bg-[#121212] flex items-center justify-center overflow-hidden rounded-2xl border border-white/5 shadow-2xl transition-all duration-500",
        isSmall ? "w-40 h-28 md:w-56 md:h-36 border-primary/20 ring-1 ring-primary/10" : "w-full h-full"
    )}>
      <video
        ref={videoRef} 
        autoPlay 
        playsInline 
        muted={isLocal}
        className={cn("max-w-full max-h-full object-contain transition-all duration-700", isLocal && "scale-x-[-1]", !isCameraOn && "opacity-0 invisible")}
      />
      {!isCameraOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#1e1e1e] to-[#0f0f0f]">
          <Avatar className={cn(isSmall ? "h-12 w-12" : "h-24 w-24", "ring-4 ring-primary/20 shadow-2xl")}>
            <AvatarImage src={userAvatar} className="object-cover" />
            <AvatarFallback className="bg-primary/10 text-primary font-black">{userName?.[0] || "?"}</AvatarFallback>
          </Avatar>
        </div>
      )}
      <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/60 backdrop-blur-md px-2 py-1 rounded-lg text-[8px] md:text-[9px] font-black uppercase tracking-widest border border-white/10 z-20">
        {isMuted && <MicOff className="h-2.5 w-2.5 text-red-500" />}
        <span className="truncate max-w-[60px] md:max-w-[100px]">{userName} {isLocal && "(Bạn)"}</span>
      </div>
    </div>
  )
}

