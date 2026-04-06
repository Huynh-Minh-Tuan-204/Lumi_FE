'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { 
  cn, 
  getAvatarUrl, 
  formatMessageTime,
  formatToVNTime,
  formatToVNDate
} from '@/lib/utils'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Check, 
  CheckCheck, 
  MoreVertical, 
  Send, 
  Smile, 
  Paperclip, 
  Image as ImageIcon, 
  Users, 
  LogOut, 
  ChevronDown, 
  Hash, 
  Reply, 
  ThumbsUp, 
  Search, 
  Activity, 
  FileText, 
  Download, 
  Trash2, 
  Pin, 
  PinOff 
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi, meetingsApi, attachmentsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface Message {
  id: number
  conversationId: number
  senderId: number
  senderName: string
  encryptedContent: string
  messageType: string
  createdAt: string
  readBy?: number[]
  stickerUrl?: string
  isPinned?: boolean
  attachments?: any[]
}

interface ChatAreaProps {
  conversation: any
  onBack?: () => void
  onShowMembers?: () => void
  onToggleBoard?: () => void
  onRefreshConversations?: () => void
  isMobile?: boolean
  className?: string
}

export function ChatArea({ conversation, onBack, onShowMembers, onToggleBoard, onRefreshConversations, isMobile = false, className }: ChatAreaProps) {
  const { token, user } = useAuth()
  const { isConnected, sendMessage, lastMessage, markAsRead, sendTyping, typingUsers, togglePinMessage, lastDeletedMessage } = useSignalR()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isPinnedListExpanded, setIsPinnedListExpanded] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const pinnedList = useMemo(() => messages.filter(m => m.isPinned), [messages])
  const latestPin = pinnedList[pinnedList.length - 1]

  const scrollToMessage = useCallback((msgId: number) => {
    const el = document.getElementById(`message-${msgId}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('bg-primary/20')
      setTimeout(() => el.classList.remove('bg-primary/20'), 2000)
    }
  }, [])

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!conversation || !token || !user) return
    try {
      const resp = await meetingsApi.startMeeting(token, conversation.id, `${type === 'voice' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} - ${conversation.name}`, [], type)
      toast.success(`Đã khởi tạo cuộc gọi ${type === 'voice' ? 'thoại' : 'video'}.`)
      if (resp && (resp.id || resp.meetingId)) {
        router.push(`/call/${resp.id || resp.meetingId}?type=${type}`)
      }
    } catch (error) {
      toast.error(`Không thể bắt đầu cuộc gọi.`)
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !conversation || !token) return
    try {
      toast.info('Đang tải tệp lên...')
      await attachmentsApi.upload(token, file, conversation.id)
      toast.success('Thành công!')
    } catch (error) {
      toast.error('Thất bại.')
    }
  }

  const getVNFullDate = (date: Date) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return `${days[date.getDay()]}, ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
  }

  useEffect(() => {
    const loadMessages = async () => {
      if (!conversation || !token) return
      try {
        const data = await conversationsApi.getMessages(token, conversation.id)
        setMessages(data)
        markAsRead(conversation.id)
      } catch (error) {
        console.error('Failed to load messages:', error)
      }
    }
    loadMessages()
    setReplyingTo(null)
    setIsPinnedListExpanded(false)
  }, [conversation?.id, token])

  useEffect(() => {
    if (lastMessage && conversation && lastMessage.conversationId === conversation.id) {
       setMessages(prev => {
          if (prev.some(m => m.id === lastMessage.id)) return prev;
          return [...prev, {
            id: lastMessage.id,
            conversationId: lastMessage.conversationId,
            senderId: lastMessage.senderId,
            senderName: lastMessage.sender,
            encryptedContent: lastMessage.message,
            messageType: lastMessage.messageType || 'Text',
            createdAt: lastMessage.time.toISOString(),
            stickerUrl: lastMessage.stickerUrl,
            isPinned: lastMessage.isPinned,
            attachments: lastMessage.attachments || []
          }];
       });
       markAsRead(conversation.id);
    }
  }, [lastMessage, conversation?.id])

  useEffect(() => {
    if (lastDeletedMessage && conversation && lastDeletedMessage.conversationId === conversation.id) {
       setMessages(prev => prev.filter(m => m.id !== lastDeletedMessage.messageId));
    }
  }, [lastDeletedMessage, conversation?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation) return
    try {
      await sendMessage(conversation.id, newMessage, '')
      setNewMessage('')
      setReplyingTo(null)
    } catch (error) {
      toast.error('Gửi tin nhắn thất bại')
    }
  }

  const groupedMessages = messages.reduce<Record<string, Message[]>>((acc, msg) => {
    const d = new Date(msg.createdAt)
    const dateKey = isNaN(d.getTime()) ? 'Ngày không xác định' : d.toDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(msg)
    return acc
  }, {})

  if (!conversation) return (
    <div className="flex-1 flex items-center justify-center bg-background p-8">
       <div className="flex flex-col items-center gap-6 opacity-30 text-center animate-pulse">
           <div className="h-32 w-32 rounded-full border-4 border-primary border-t-transparent animate-spin-slow" />
           <div>
              <h2 className="text-2xl font-black uppercase tracking-widest">Lumi Messaging</h2>
              <p className="text-xs font-bold mt-2 uppercase tracking-[0.5em]">Tài liệu - Minh Tuấn</p>
           </div>
       </div>
    </div>
  )

  return (
    <div className={cn('flex flex-col bg-background h-full overflow-hidden relative', className)}>
      <header className="flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md z-30 border-b shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-11 w-11 border-2 border-primary/10">
            <AvatarImage src={getAvatarUrl(conversation.avatarPath)} className="object-cover" />
            <AvatarFallback className="bg-primary/5 text-primary text-xs font-black">{conversation.name?.[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-black text-sm truncate uppercase tracking-tight">{conversation.name}</h2>
            <div className="flex items-center gap-1.5">
               <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
               <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                  {conversation.type === 'Group' ? 'Hội nhóm' : 'Liên lạc'}
               </p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          <TooltipProvider>
            {conversation.type !== 'Group' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={() => handleStartCall('voice')}>
                    <Phone className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Gọi thoại</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={() => handleStartCall('video')}>
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gọi video</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={() => (window as any).toggleSearch?.()}>
                  <Search className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Tìm kiếm tin nhắn</TooltipContent>
            </Tooltip>

            {conversation.type === 'Group' && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={() => onShowMembers?.()}>
                    <Users className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Thành viên nhóm</TooltipContent>
              </Tooltip>
            )}
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 overflow-hidden p-1 rounded-2xl shadow-2xl">
                 <DropdownMenuItem onClick={onToggleBoard} className="p-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-3">
                    <ActivityIcon className="h-4 w-4 text-primary" /> Bảng tin nhóm
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem className="text-destructive p-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-3">
                    <LogOut className="h-4 w-4" /> Rời khỏi hội thoại
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </header>

      {pinnedList.length > 0 && (
         <div className="z-20 bg-background/90 border-b px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/50 transition-all border-l-4 border-l-primary animate-in slide-in-from-top-1 shadow-sm" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}>
             <Pin className="h-3 w-3 text-primary fill-primary" />
             <div className="flex-1 min-w-0">
                <p className="text-[9px] font-black uppercase text-primary tracking-tighter opacity-70">Tin nhắn đã ghim ({pinnedList.length})</p>
                <p className="text-xs truncate opacity-90 font-bold">
                    {latestPin.senderName}: {latestPin.stickerUrl ? '[Nhãn dán]' : latestPin.encryptedContent}
                </p>
             </div>
             <ChevronDown className={cn("h-4 w-4 transition-transform opacity-30", isPinnedListExpanded && "rotate-180")} />
         </div>
      )}

      <div className="flex-1 relative overflow-hidden bg-muted/5">
        <ScrollArea className="h-full">
           <div className="p-4 flex flex-col justify-end min-h-full space-y-8 pb-10">
              {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
                 <div key={dateKey} className="space-y-6">
                    <div className="flex items-center gap-4 opacity-30">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em] bg-background px-3 py-1 rounded-full border">
                          {dateKey === 'Ngày không xác định' ? dateKey : (dateKey === new Date().toDateString() ? 'Hôm nay' : getVNFullDate(new Date(dateKey)))}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-4">
                       {msgs.map((m) => {
                          const isSystem = m.messageType === 'System' || m.messageType === 'Announcement';
                          if (isSystem) {
                             return (
                                <div key={m.id} className="flex justify-center">
                                   <div className="bg-muted px-4 py-1.5 rounded-full text-[10px] text-muted-foreground flex items-center gap-2 border border-primary/5 shadow-sm opacity-60 italic font-medium">
                                      <Hash className="h-3 w-3 opacity-30" />
                                      <span>{m.encryptedContent}</span>
                                   </div>
                                </div>
                             )
                          }

                          const isOwn = m.senderId === user?.id;
                          const isPinned = m.isPinned;

                          return (
                            <div key={m.id} id={`message-${m.id}`} className={cn("flex gap-3 animate-in slide-in-from-bottom-2 duration-500", isOwn ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn("max-w-[75%] space-y-1", isOwn ? "items-end" : "items-start")}>
                                   {!isOwn && <p className="text-[10px] font-black tracking-tight uppercase opacity-40 ml-1">{m.senderName}</p>}
                                   
                                   <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                       <div className={cn(
                                           "px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words relative cursor-pointer group",
                                           isOwn ? "bg-primary text-primary-foreground rounded-tr-none shadow-primary/20" : "bg-card border rounded-tl-none shadow-black/5"
                                       )}>
                                           {(() => {
                                              if (m.stickerUrl) {
                                                return <img src={m.stickerUrl} className="w-32 h-32 object-contain" />
                                              }
                                              
                                              if (m.attachments && m.attachments.length > 0) {
                                                return (
                                                  <div className="space-y-2 py-1">
                                                    {m.attachments.map((att: any, idx: number) => {
                                                      const isImg = att.contentType?.startsWith('image/') || att.fileName?.match(/\.(jpg|jpeg|png|gif)$/i);
                                                      if (isImg) {
                                                        return <img key={idx} src={getAvatarUrl(att.filePath)} className="max-w-full rounded-xl h-auto max-h-64 object-cover shadow-2xl border-4 border-background" />
                                                      }
                                                      return (
                                                        <a key={idx} href={getAvatarUrl(att.filePath)} target="_blank" download className={cn("flex items-center gap-3 p-3 border rounded-xl hover:scale-[1.02] transition-transform", isOwn ? "bg-white/10 border-white/20" : "bg-muted/30 border-primary/5")}>
                                                           <div className="h-10 w-10 flex items-center justify-center bg-primary/20 rounded-lg shrink-0">
                                                              <FileText className="h-5 w-5 text-primary" />
                                                           </div>
                                                           <div className="min-w-0 flex-1">
                                                              <p className="text-xs font-black truncate uppercase tracking-tight">{att.fileName}</p>
                                                              <p className="text-[9px] opacity-40 uppercase font-bold">{(att.fileSize / 1024).toFixed(1)} KB</p>
                                                           </div>
                                                           <Download className="h-4 w-4 opacity-30" />
                                                        </a>
                                                      )
                                                    })}
                                                    {m.encryptedContent && <p className="mt-2 font-medium leading-relaxed">{m.encryptedContent}</p>}
                                                  </div>
                                                )
                                              }

                                              return <p className="font-medium leading-relaxed">{m.encryptedContent}</p>
                                           })()}

                                           {isPinned && <Pin className="h-3 w-3 absolute -top-1.5 -right-1.5 text-orange-500 fill-orange-500 drop-shadow-md" />}
                                       </div>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-56 p-1 rounded-2xl shadow-2xl">
                                        <DropdownMenuItem onClick={() => setReplyingTo(m)} className="p-2.5 rounded-xl text-xs font-bold gap-3">
                                           <Reply className="h-4 w-4 text-primary" /> Trả lời
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => togglePinMessage(m.id)} className="p-2.5 rounded-xl text-xs font-bold gap-3">
                                           {isPinned ? <><PinOff className="h-4 w-4 text-orange-500" /> Bỏ ghim</> : <><Pin className="h-4 w-4 text-primary" /> Ghim tin nhắn</>}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive p-2.5 rounded-xl text-xs font-bold gap-3">
                                           <Trash2 className="h-4 w-4" /> Xóa tin nhắn (Gỡ bỏ)
                                        </DropdownMenuItem>
                                     </DropdownMenuContent>
                                   </DropdownMenu>

                                   <div className="flex items-center gap-2 px-1 opacity-20">
                                      <span className="text-[9px] font-black uppercase tracking-widest">{formatMessageTime(m.createdAt)}</span>
                                      {isOwn && (m.readBy?.length ? <CheckCheck className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3" />)}
                                   </div>
                                </div>
                            </div>
                          )
                       })}
                    </div>
                 </div>
              ))}
              <div ref={messagesEndRef} />
           </div>
        </ScrollArea>
      </div>

      {replyingTo && (
        <div className="px-4 py-2 bg-muted/80 backdrop-blur-md border-t flex items-center justify-between animate-in slide-in-from-bottom-2">
           <div className="flex items-center gap-3 overflow-hidden">
              <Reply className="h-4 w-4 text-primary" />
              <div className="truncate shrink border-l-2 border-primary pl-3">
                 <p className="text-[10px] font-black text-primary uppercase tracking-widest">Đang trả lời {replyingTo.senderName}</p>
                 <p className="text-xs truncate opacity-70 italic">{replyingTo.encryptedContent}</p>
              </div>
           </div>
           <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={() => setReplyingTo(null)}><Plus className="h-4 w-4 rotate-45" /></Button>
        </div>
      )}

      {/* Zalo Inspired Input Section */}
      <div className="bg-card border-t pt-3 pb-5 px-5 space-y-4 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] shrink-0 z-40">
        <div className="flex items-center gap-2 opacity-60">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-5 w-5" /></Button>
        </div>

        <div className="flex items-end gap-4 bg-muted/30 p-2 rounded-2xl border border-primary/5 focus-within:border-primary/20 focus-within:bg-background transition-all shadow-inner">
            <textarea
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value)
                if(conversation) sendTyping(conversation.id)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (newMessage.trim()) handleSendMessage()
                }
              }}
              placeholder="Nhập tin nhắn để thảo luận..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2.5 px-3 resize-none max-h-40 min-h-[45px] scrollbar-none outline-none font-medium leading-relaxed"
              rows={1}
            />
            <div className="flex items-center gap-2 pb-1.5 pr-1.5">
               <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/10">
                  <Smile className="h-5 w-5" />
               </Button>
               {!newMessage.trim() ? (
                   <Button variant="ghost" size="icon" className="h-10 w-10 text-primary/30 hover:text-primary hover:bg-primary/5 transition-all rounded-xl">
                     <ThumbsUp className="h-6 w-6" />
                   </Button>
               ) : (
                   <Button 
                    onClick={handleSendMessage} 
                    size="icon" 
                    className="h-10 w-10 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30 hover:scale-110 active:scale-95 transition-all"
                   >
                     <Send className="h-5 w-5" />
                   </Button>
               )}
            </div>
        </div>
      </div>

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
      <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleFileUpload} />
    </div>
  )
}

function ActivityIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
  )
}

function Phone(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
  )
}

function Video(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m22 8-6 4 6 4V8Z"/><rect width="14" height="12" x="2" y="6" rx="2" ry="2"/></svg>
  )
}
