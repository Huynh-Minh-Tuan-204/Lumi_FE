'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
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
import { meetingsApi } from '@/lib/api'
import { CallSignalR } from '@/lib/call-signalr'

interface CallLobbyProps {
  meetingId: string | number
  type: 'voice' | 'video'
  title: string
  conversationId: number
  onJoin: (mic: boolean, cam: boolean) => void
  onCancel: () => void
}

export function CallLobby({ meetingId, type, title, conversationId, onJoin, onCancel }: CallLobbyProps) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const { user, token } = useAuth()
  const [isMicOn, setIsMicOn] = useState(true)
  const [isCamOn, setIsCamOn] = useState(type === 'video')
  const [stream, setStream] = useState<MediaStream | null>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  
  const [isHost, setIsHost] = useState(false)
  const [isAuthorized, setIsAuthorized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isWaiting, setIsWaiting] = useState(false)
  const [requestStatus, setRequestStatus] = useState<'idle' | 'pending' | 'accepted' | 'declined'>('idle')
  const signalRRef = useRef<CallSignalR | null>(null)

  const stopPreview = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop()
      })
      setStream(null)
    }
  }, [stream])

  // 1. Verify access & Connect SignalR
  useEffect(() => {
    const init = async () => {
      if (!token) return
      try {
        // Fetch meeting details to check host status
        try {
          const mInfo: any = await meetingsApi.getMeeting(token, meetingId.toString())
          if (mInfo && mInfo.isHost) {
            setIsHost(true)
          }
        } catch (e) { console.error("Error fetching meeting info", e) }

        const signalR = new CallSignalR({
            onJoinRequestAccepted: (mId) => {
                if (String(mId) === String(meetingId)) {
                    setRequestStatus('accepted');
                    toast.success("Yêu cầu tham gia đã được chấp nhận!");
                    stopPreview();
                    onJoin(isMicOn, isCamOn);
                }
            },
            onJoinRequestDeclined: (mId, reason) => {
                if (String(mId) === String(meetingId)) {
                    setRequestStatus('declined');
                    setIsWaiting(false);
                    toast.error(reason || "Yêu cầu bị từ chối.");
                }
            }
        });
        await signalR.connect(token);
        signalRRef.current = signalR;
        setIsAuthorized(true)
      } catch (err) {
        toast.error("Không thể kết nối dịch vụ cuộc gọi.")
        onCancel()
      } finally {
        setIsLoading(false)
      }
    }
    init()
    return () => {
        signalRRef.current?.disconnect();
    }
  }, [token, meetingId, onJoin, onCancel, isMicOn, isCamOn, stopPreview])

  // 2. Local Preview
  useEffect(() => {
    if (!isAuthorized || isWaiting) return

    async function startPreview() {
      try {
        if (!isCamOn && !isMicOn) {
            if (stream) {
              stream.getTracks().forEach(t => t.stop())
              setStream(null)
            }
            return
        }

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
        console.error("Lỗi thiết bị:", err)
        toast.warning("Không thể truy cập Camera/Mic.")
      }
    }

    startPreview()
  }, [isCamOn, isMicOn, isAuthorized, isWaiting])

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-[10000] bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
           <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
           <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Đang chuẩn bị...</p>
        </div>
      </div>
    )
  }

  const handleJoin = async () => {
     // User is host OR joining from an established conversation (already a member)
     const canJoinDirectly = isHost || (conversationId && conversationId > 0);

     if (canJoinDirectly) {
        try {
          if (token) await meetingsApi.joinMeeting(token, meetingId.toString());
        } catch(e) {}
        stopPreview();
        onJoin(isMicOn, isCamOn);
        return;
     }

     setIsWaiting(true);
     setRequestStatus('pending');
     try {
        await signalRRef.current?.requestJoin(String(meetingId));
        toast.info("Đã gửi yêu cầu tham gia.");
     } catch (e) {
        toast.error("Gửi yêu cầu thất bại.");
        setIsWaiting(false);
     }
  }

  const handleCancel = () => {
     stopPreview()
     onCancel()
  }

  if (!mounted) return null

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-background flex items-center justify-center p-0 md:p-10 animate-in fade-in duration-300">
      <div className="w-full h-full md:h-auto md:max-w-5xl bg-card border shadow-2xl md:rounded-[40px] overflow-hidden flex flex-col md:flex-row relative">
        
        {/* Left: Preview */}
        <div className="flex-1 bg-[#050505] relative flex items-center justify-center min-h-[350px]">
          {isWaiting ? (
            <div className="flex flex-col items-center gap-6 animate-in zoom-in duration-500">
               <div className="relative">
                  <Avatar className="h-32 w-32 border-4 border-primary/20 p-1">
                     <AvatarImage src={getAvatarUrl(user?.avatarPath)} className="rounded-full" />
                     <AvatarFallback className="text-4xl font-black">{user?.fullName?.[0]}</AvatarFallback>
                  </Avatar>
                  <div className="absolute inset-0 border-4 border-primary rounded-full animate-ping opacity-20" />
               </div>
               <div className="text-center space-y-2 px-6">
                  <h3 className="text-xl font-black uppercase tracking-widest text-white">
                    {isHost ? "Sẵn sàng tham gia" : "Đang chờ phê duyệt..."}
                  </h3>
                  <p className="text-xs font-bold text-white/40 uppercase tracking-tighter">
                    {isHost ? "Bạn là người tổ chức cuộc họp này." : "Bạn đang ở phòng đợi. Người tổ chức sẽ cho phép bạn tham gia sau khi cuộc họp bắt đầu."}
                  </p>
               </div>
            </div>
          ) : isCamOn ? (
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

          {!isWaiting && (
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
          )}
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
                    <Users className="h-3 w-3" /> Lumi Meeting | Bảo mật
                 </p>
              </div>

              {isWaiting ? (
                <div className="p-6 bg-primary/5 rounded-[2rem] border border-primary/10 space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-primary">Thông báo</p>
                    <p className="text-[11px] font-medium leading-relaxed opacity-60 italic">
                        "Vui lòng đợi trong giây lát. Hệ thống đang bảo mật cuộc gọi của bạn."
                    </p>
                </div>
              ) : (
                <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-40">Thiết bị</p>
                    <Button variant="outline" className="w-full justify-start gap-3 rounded-xl py-6 font-bold text-xs bg-background/50">
                        <Settings className="h-4 w-4 opacity-40" />
                        Cài đặt âm thanh/hình ảnh
                    </Button>
                </div>
              )}
           </div>

           <div className="space-y-3 pt-8">
              {!isWaiting ? (
                <Button 
                    className="w-full bg-primary text-primary-foreground py-7 rounded-2xl font-black uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] transition-all"
                    onClick={handleJoin}
                >
                    <PhoneCall className="mr-3 h-5 w-5" /> Tham gia
                </Button>
              ) : (
                <Button 
                    variant="ghost"
                    className="w-full py-7 rounded-2xl font-black uppercase tracking-widest text-xs opacity-40 italic cursor-wait"
                    disabled
                >
                    Đang xin phê duyệt...
                </Button>
              )}
           </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
