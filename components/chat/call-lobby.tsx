'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  Settings, 
  PhoneCall, 
  X,
  ShieldCheck,
  Users
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn, getAvatarUrl } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'

interface CallLobbyProps {
  meetingId: string | number
  type: 'voice' | 'video'
  title: string
  conversationId: number
  onJoin: (mic: boolean, cam: boolean) => void
  onCancel: () => void
}

export function CallLobby({ meetingId, type, title, conversationId, onJoin, onCancel }: CallLobbyProps) {
  const { user, token } = useAuth()
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(type === 'video')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  const stopPreview = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop()
        console.log(`LUMI: Stopped track ${track.kind}`)
      })
      setStream(null)
    }
  }, [stream])

  // 1. Verify access
  useEffect(() => {
    const verifyAccess = async () => {
      if (!token) return
      try {
        setIsAuthorized(true)
      } catch (err) {
        toast.error("Bạn không có quyền tham gia.")
        onCancel()
      } finally {
        setIsLoading(false)
      }
    }
    verifyAccess()
  }, [token, meetingId])

  // 2. Local Preview
  useEffect(() => {
    if (!isAuthorized) return

    async function startPreview() {
      // Stop old stream before starting new one
      if (stream) {
        stream.getTracks().forEach(t => t.stop())
      }

      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: isCamOn ? { width: 1280, height: 720 } : false,
          audio: isMicOn
        })
        setStream(localStream)
        if (videoRef.current) {
          videoRef.current.srcObject = localStream
          videoRef.current.onloadedmetadata = () => {
             videoRef.current?.play().catch(e => console.error("Play error:", e))
          }
        }
      } catch (err) {
        console.error("Lỗi khởi tạo thiết bị:", err)
        toast.warning("Không thể truy cập Camera/Mic.")
      }
    }

    startPreview()

    return () => {
      // Important: don't call stopPreview here directly as it depends on latest stream
      // Just do internal cleanup
    }
  }, [isCamOn, isMicOn, isAuthorized])

  // Cleanup on unmount
  useEffect(() => {
     return () => {
        if (stream) stream.getTracks().forEach(t => t.stop())
     }
  }, [stream])

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[10000] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
           <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Đang chuẩn bị phòng họp...</p>
        </div>
      </div>
    )
  }

  const handleJoin = () => {
     stopPreview()
     onJoin(isMicOn, isCamOn)
  }

  const handleCancel = () => {
     stopPreview()
     onCancel()
  }

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="w-full h-full md:h-auto md:max-w-5xl bg-card border shadow-2xl md:rounded-[40px] overflow-hidden flex flex-col md:flex-row relative">
        
        {/* Left: Preview */}
        <div className="flex-1 bg-[#050505] relative flex items-center justify-center min-h-[350px]">
          {isCamOn ? (
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover scale-x-[-1]"
            />
          ) : (
            <div className="flex flex-col items-center gap-4">
               <Avatar className="h-24 w-24 border-4 border-primary/20">
                  <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                  <AvatarFallback className="text-3xl font-black">{user?.fullName?.[0]}</AvatarFallback>
               </Avatar>
               <p className="text-sm font-bold opacity-40 uppercase tracking-widest text-white">Camera đang tắt</p>
            </div>
          )}

          {/* Controls Overlay */}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4">
             <Button 
                variant={isMicOn ? "secondary" : "destructive"} 
                size="icon" 
                className="h-12 w-12 rounded-full shadow-xl"
                onClick={() => setIsMicOn(!isMicOn)}
             >
                {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
             </Button>
             <Button 
                variant={isCamOn ? "secondary" : "destructive"} 
                size="icon" 
                className="h-12 w-12 rounded-full shadow-xl"
                onClick={() => setIsCamOn(!isCamOn)}
             >
                {isCamOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
             </Button>
          </div>
        </div>

        {/* Right: Info & Join */}
        <div className="w-full md:w-[350px] p-8 flex flex-col justify-between border-l bg-muted/10">
           <div className="space-y-6">
              <div className="flex justify-between items-start">
                 <div className="p-2 bg-primary/10 rounded-xl text-primary">
                    <ShieldCheck className="h-6 w-6" />
                 </div>
                 <Button variant="ghost" size="icon" onClick={handleCancel} className="rounded-full">
                    <X className="h-5 w-5" />
                 </Button>
              </div>

              <div>
                 <h2 className="text-xl font-black uppercase tracking-tight leading-tight">{title}</h2>
                 <p className="text-xs font-bold text-muted-foreground mt-2 flex items-center gap-2">
                    <Users className="h-3 w-3" /> Cuộc gọi nhóm bảo mật
                 </p>
              </div>

              <div className="space-y-4">
                 <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Tùy chọn thiết bị</p>
                 <Button variant="outline" className="w-full justify-start gap-3 rounded-xl py-6 font-bold text-xs bg-background/50">
                    <Settings className="h-4 w-4 opacity-40" />
                    Thiết lập Camera & Mic
                 </Button>
              </div>
           </div>

           <div className="space-y-3 pt-8">
              <Button 
                className="w-full bg-primary text-primary-foreground py-7 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                onClick={handleJoin}
              >
                <PhoneCall className="mr-3 h-5 w-5" /> Tham gia ngay
              </Button>
              <p className="text-[9px] text-center font-bold opacity-30 px-4 uppercase leading-relaxed">
                 Bằng cách nhấn tham gia, bạn đồng ý với các tiêu chuẩn bảo mật của Lumi
              </p>
           </div>
        </div>
      </div>
    </div>
  )
}
