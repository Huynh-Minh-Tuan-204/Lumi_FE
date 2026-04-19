'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/lib/auth-context'
import { adminApi, announcementsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { toast } from 'sonner'
import { cn, getAvatarUrl } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { 
  Bell, 
  Send, 
  Megaphone, 
  Clock, 
  CheckCircle, 
  Users,
  Globe,
  User as UserIcon,
  Search
} from 'lucide-react'

interface Announcement {
  id: number
  title: string
  sender: string
  senderId?: number
  message: string
  iv?: string
  signature?: string
  isSystem: boolean
  time: string
  targetIds?: string[] | null
}

import { decryptMessagePro } from '@/lib/crypto-utils'

function DecryptedAnnouncement({ announcement, mySenderKey, peerSenderKeys, peerIdentityKeys, identityKeys }: any) {
  const [decrypted, setDecrypted] = useState<string>("⌛ [Đang giải mã...]");

  useEffect(() => {
    const decrypt = async () => {
      const { message, iv, signature, senderId } = announcement;
      
      // Legacy or System messages (not encrypted)
      if (!iv || !signature) {
        setDecrypted(message);
        return;
      }

      try {
        const isOwn = senderId === undefined || senderId === null; // Simple check or use Auth
        const senderKey = isOwn ? mySenderKey : peerSenderKeys?.get(senderId);
        const senderPubKey = isOwn ? identityKeys?.publicKey : peerIdentityKeys?.get(senderId);

        if (iv && signature && senderKey && senderPubKey) {
           const result = await decryptMessagePro(message, iv, signature, senderKey, senderPubKey);
           setDecrypted(result);
        } else {
           setDecrypted("⏳ [Mã hóa đầu cuối]");
        }
      } catch (e) { setDecrypted(message || "[Lỗi giải mã]"); }
    };
    decrypt();
  }, [announcement.id, announcement.message, mySenderKey]);

  return <p className="text-sm text-foreground/80 font-medium leading-relaxed">{decrypted}</p>;
}

function AvatarStack({ userIds, allUsers }: { userIds: string[] | null | undefined, allUsers: any[] }) {
  if (!userIds || userIds.length === 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center justify-center h-7 w-7 rounded-full bg-blue-500/10 border-2 border-background shadow-sm">
                <Globe className="h-3 w-3 text-blue-500" />
            </div>
          </TooltipTrigger>
          <TooltipContent>Gửi cho tất cả</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )
  }

  const maxDisplay = 3;
  const displayIds = userIds.slice(0, maxDisplay);
  const remaining = userIds.length - maxDisplay;

  return (
    <div className="flex -space-x-2 overflow-hidden items-center group">
       {displayIds.map((id, i) => {
          const u = allUsers.find(user => user.id.toString() === id.toString());
          return (
            <Avatar key={i} className="inline-block h-7 w-7 rounded-full ring-2 ring-background border-2 border-background transition-transform hover:scale-110">
               <AvatarImage src={getAvatarUrl(u?.avatarPath)} className="object-cover" />
               <AvatarFallback className="bg-muted text-[8px] font-bold">
                  {u?.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() || 'U'}
               </AvatarFallback>
            </Avatar>
          )
       })}
       {remaining > 0 && (
          <div className="flex items-center justify-center h-7 w-7 rounded-full bg-primary ring-2 ring-background border-2 border-background text-[9px] font-black text-white shrink-0">
             +{remaining}
          </div>
       )}
    </div>
  )
}

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export default function NotificationsPage() {
  const { token, user } = useAuth()
  const { isConnected, notifications: realtimeNotifications, mySenderKey, identityKeys, peerSenderKeys, peerIdentityKeys } = useSignalR()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [title, setTitle] = useState('')
  const [newAnnouncement, setNewAnnouncement] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadAnnouncements()
    loadUsers()
  }, [token])

  const loadUsers = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAllUsers(token)
      setAllUsers(data.filter((u: any) => u.isActive))
    } catch (e) {}
  }

  const loadAnnouncements = async () => {
    if (!token) return
    try {
      const data: any = await announcementsApi.getAnnouncements(token)
      const mapped = data.map((a: any) => ({
        id: a.Id || a.id,
        title: a.Title || a.title || 'Thông báo',
        sender: a.SenderName || a.senderName || 'Hệ thống',
        senderId: a.SenderId || a.senderId,
        message: a.Message || a.message,
        iv: a.IV || a.iv,
        signature: a.Signature || a.signature,
        isSystem: true,
        time: a.Timestamp || a.timestamp,
        targetIds: a.TargetIds || a.targetIds
      }))
      setAnnouncements(mapped)
    } catch (error) {
      console.error('Failed to load announcements:', error)
      toast.error('Không thể tải thông báo')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendAnnouncement = async () => {
    if (!title.trim() || !newAnnouncement.trim() || isSending || !token) return
    if (!mySenderKey || !identityKeys) {
        toast.error("Vui lòng đợi 1 giây để thiết lập mã hóa bảo mật...");
        return;
    }

    setIsSending(true)
    try {
      // 1. Mã hóa nội dung trước khi gửi (E2EE)
      const { encryptMessagePro } = await import('@/lib/crypto-utils');
      const encrypted = await encryptMessagePro(newAnnouncement, mySenderKey, identityKeys.privateKey);

      // 2. Gửi dữ liệu đã mã hóa lên server
      await adminApi.sendAnnouncement(token, {
        title,
        encryptedContent: encrypted.content, 
        iv: encrypted.iv, 
        signature: encrypted.sig,
        userIds: targetType === 'all' ? undefined : selectedUserIds
      });

      toast.success('Gửi thông báo thành công (Đã mã hóa đầu cuối)')
      setNewAnnouncement('')
      setTitle('')
      setSelectedUserIds([])
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to send announcement:', error)
      toast.error('Không thể gửi thông báo')
    } finally {
      setIsSending(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const minutes = Math.floor(diff / (1000 * 60))
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (minutes < 1) return `Vừa xong`
    if (minutes < 60) return `${minutes} phút trước`
    if (hours < 24) return `${hours} giờ trước`
    if (days < 7) return `${days} ngày trước`
    return date.toLocaleDateString('vi-VN', { month: '2-digit', day: '2-digit' })
  }

  const filteredHistory = useMemo(() => {
    const realtimeItems = realtimeNotifications.map(n => ({
        id: n.id,
        title: n.title || 'Thông báo mới',
        sender: n.sender || 'Hệ thống',
        message: n.message,
        isSystem: true,
        time: n.time.toISOString(),
        targetIds: null // Realtime notifications usually for user
    }));

    const all = [...realtimeItems, ...announcements];
    
    // Deduplicate
    const unique = Array.from(new Map(all.map(item => [`${item.id}_${item.message}`, item])).values());
    
    // Sort newest first
    const sorted = unique.sort((a,b) => new Date(b.time).getTime() - new Date(a.time).getTime());

    if (!searchQuery.trim()) return sorted;
    return sorted.filter(a => 
       a.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
       a.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
       a.sender.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [realtimeNotifications, announcements, searchQuery]);

  const isAdmin = user?.role === 'Admin' || user?.role === 'Manager'
  const canSendAnnouncements = isAdmin

  return (
    <div className="space-y-8 animate-in fade-in duration-500 p-2 lg:p-4">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black tracking-tight uppercase">Thông báo</h2>
          <p className="text-muted-foreground font-medium text-sm mt-1">
            Gửi thông báo toàn công ty và quản lý lịch sử phát tin
          </p>
        </div>
        
        <div className="relative w-full md:w-72">
           <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
           <input 
              type="text" 
              placeholder="Tìm kiếm thông báo..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-muted/20 border-2 border-primary/5 rounded-xl pl-10 pr-4 py-2 text-xs font-bold focus:border-primary outline-none transition-all placeholder:font-medium"
           />
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        {canSendAnnouncements && (
          <Card className="border-2 shadow-xl shadow-black/5 rounded-3xl overflow-hidden border-primary/5">
            <CardHeader className="bg-muted/5 pb-6">
              <CardTitle className="flex items-center gap-3 text-xl font-black uppercase">
                <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                   <Megaphone className="h-5 w-5 text-white" />
                </div>
                Phát thông báo
              </CardTitle>
              <CardDescription className="font-medium">
                Tạo tin nhắn hệ thống đến nhân viên được chọn hoặc toàn bộ tổ chức
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6 pt-6">
              <div className="space-y-5">
                <div className="flex bg-muted p-1 rounded-2xl">
                  <button 
                    onClick={() => setTargetType('all')}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all",
                      targetType === 'all' ? "bg-background shadow-lg text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Tất cả
                  </button>
                  <button 
                    onClick={() => setTargetType('specific')}
                    className={cn(
                      "flex-1 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all",
                      targetType === 'specific' ? "bg-background shadow-lg text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Đối tượng cụ thể
                  </button>
                </div>

                {targetType === 'specific' && (
                  <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground flex justify-between">
                       Người nhận <span>({selectedUserIds.length})</span>
                    </Label>
                    <ScrollArea className="h-44 border-2 border-primary/5 rounded-2xl p-2 bg-muted/10">
                      <div className="grid grid-cols-2 gap-2">
                        {allUsers.map((u) => (
                          <div 
                            key={u.id}
                            onClick={() => {
                              setSelectedUserIds(prev => 
                                prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                              )
                            }}
                            className={cn(
                              "flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border-2",
                              selectedUserIds.includes(u.id) 
                                ? "bg-primary/5 border-primary shadow-sm" 
                                : "bg-card border-transparent hover:border-primary/20"
                            )}
                          >
                            <Avatar className="h-8 w-8 shadow-sm">
                               <AvatarImage src={getAvatarUrl(u.avatarPath)} className="object-cover" />
                               <AvatarFallback className="text-[10px] font-black bg-muted">
                                {u.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                               </AvatarFallback>
                            </Avatar>
                            <span className="text-[11px] font-black uppercase truncate">{u.fullName}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <div className="space-y-3">
                  <Label htmlFor="title" className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Tiêu đề</Label>
                  <input
                    id="title"
                    type="text"
                    placeholder="VD: Cập nhật lịch làm việc"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full bg-background border-2 border-primary/10 rounded-2xl px-4 py-3 text-sm font-bold focus:border-primary outline-none transition-all placeholder:font-medium shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <Label htmlFor="announcement" className="text-[10px] font-black uppercase tracking-[0.3em] text-muted-foreground">Nội dung thông báo</Label>
                  <Textarea
                    id="announcement"
                    placeholder="Nhập nội dung chi tiết..."
                    value={newAnnouncement}
                    onChange={(e) => setNewAnnouncement(e.target.value)}
                    rows={4}
                    className="resize-none font-bold text-sm border-2 border-primary/10 rounded-2xl focus-visible:ring-0 focus:border-primary px-4 py-3 bg-background shadow-inner h-[100px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
                  {isConnected ? (
                    <>
                      <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                      <span>Kết nối trực tiếp</span>
                    </>
                  ) : (
                    <>
                      <div className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
                      <span>Mất kết nối</span>
                    </>
                  )}
                </div>
                <Button
                  onClick={handleSendAnnouncement}
                  disabled={!title.trim() || !newAnnouncement.trim() || isSending || !isConnected || (targetType === 'specific' && selectedUserIds.length === 0)}
                  className="bg-primary hover:bg-primary/90 text-white font-black h-12 px-8 rounded-2xl shadow-xl shadow-primary/30 transition-all hover:scale-105 active:scale-95 text-xs uppercase tracking-[0.1em]"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Đang xử lý...
                    </span>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-3" />
                      BẮT ĐẦU GỬI
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Announcement history */}
        <Card className={cn(
            "border-2 shadow-xl shadow-black/5 rounded-3xl overflow-hidden border-primary/5",
            !canSendAnnouncements ? 'lg:col-span-2' : ''
        )}>
          <CardHeader className="bg-muted/5 pb-6">
            <CardTitle className="flex items-center gap-3 text-xl font-black uppercase">
               <div className="h-10 w-10 rounded-2xl bg-blue-500 flex items-center justify-center shadow-lg shadow-blue-500/20 text-white">
                  <Bell className="h-5 w-5" />
               </div>
               Lịch sử thông báo
            </CardTitle>
            <CardDescription className="font-medium">
               Các tin nhắn đã được gửi đi trong hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary border-t-transparent" />
              </div>
            ) : filteredHistory.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <div className="h-24 w-24 bg-muted/40 rounded-full flex items-center justify-center mb-6">
                  <Bell className="h-12 w-12 opacity-20" />
                </div>
                <p className="text-sm font-black uppercase tracking-widest opacity-40">Chưa có thông báo nào</p>
              </div>
            ) : (
              <ScrollArea className="h-[500px] pr-4">
                <div className="space-y-4">
                  {filteredHistory.map((announcement, idx) => (
                    <div
                      key={idx}
                      className="group flex flex-col gap-4 p-5 rounded-3xl bg-muted/10 border-2 border-transparent hover:border-primary/10 hover:bg-muted/20 transition-all shadow-sm"
                    >
                      <div className="flex items-start justify-between">
                         <div className="flex items-center gap-4 min-w-0">
                            <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                               <Megaphone className="h-5 w-5 text-primary" />
                            </div>
                            <div className="min-w-0">
                               <p className="text-[12px] font-black uppercase text-primary tracking-tight truncate pr-2">{announcement.title}</p>
                               <div className="flex items-center gap-2 mt-0.5">
                                 <span className="text-[11px] font-bold opacity-60">bởi {announcement.sender}</span>
                                 {announcement.isSystem && (
                                   <Badge variant="outline" className="text-[8px] h-4 font-black uppercase bg-primary/5 text-primary border-primary/20">Hệ thống</Badge>
                                 )}
                               </div>
                            </div>
                         </div>
                         <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-1.5 opacity-40 text-[10px] font-black uppercase">
                               <Clock className="h-3 w-3" />
                               {formatTime(announcement.time)}
                            </div>
                            <AvatarStack userIds={announcement.targetIds} allUsers={allUsers} />
                         </div>
                      </div>
                      
                      <div className="bg-background/40 p-4 rounded-2xl border border-primary/5 shadow-inner">
                         <DecryptedAnnouncement 
                            announcement={announcement} 
                            mySenderKey={mySenderKey} 
                            peerSenderKeys={peerSenderKeys} 
                            peerIdentityKeys={peerIdentityKeys} 
                            identityKeys={identityKeys} 
                         />
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
