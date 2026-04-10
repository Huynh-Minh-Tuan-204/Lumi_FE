'use client'

import { useState, useEffect, useRef } from 'react'
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
  onJoin: () => void
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

  // 1. Verify access (ACL / JWT)
  useEffect(() => {
    const verifyAccess = async () => {
      if (!token) return
      try {
        // Here we'd normally call an API to get a signed join token
        // For now, we simulate a check against membership
        setIsAuthorized(true)
      } catch (err) {
        toast.error("Bạn không có quyền tham gia cuộc họp này.")
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
      try {
        const localStream = await navigator.mediaDevices.getUserMedia({
          video: isCamOn,
          audio: isMicOn
        })
        setStream(localStream)
        if (videoRef.current) {
          videoRef.current.srcObject = localStream
        }
      } catch (err) {
        console.error("Lỗi khởi tạo thiết bị:", err)
        toast.warning("Không thể truy cập Camera/Mic. Vui lòng kiểm tra quyền trình duyệt.")
      }
    }

    startPreview()

    return () => {
      stream?.getTracks().forEach(track => track.stop())
    }
  }, [isCamOn, isMicOn, isAuthorized])

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-xl flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 animate-pulse">
           <div className="h-12 w-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
           <p className="text-xs font-black uppercase tracking-widest opacity-50">Đang kiểm tra quyền truy cập...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-2xl flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-card border shadow-2xl rounded-3xl overflow-hidden flex flex-col md:flex-row">
        
        {/* Left: Preview */}
        <div className="flex-1 bg-black relative aspect-video md:aspect-auto flex items-center justify-center min-h-[300px]">
          {isCamOn && stream ? (
            <video 
              ref={videoRef} 
              autoPlay 
              muted 
              playsInline 
              className="w-full h-full object-cover mirror"
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
                 <Button variant="ghost" size="icon" onClick={onCancel} className="rounded-full">
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
                onClick={() => {
                   stream?.getTracks().forEach(track => track.stop())
                   onJoin()
                }}
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
