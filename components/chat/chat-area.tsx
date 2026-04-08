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
  ChevronRight,
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
  PinOff,
  Plus,
  Phone,
  Video as VideoIcon,
  Activity as ActivityIcon,
  Calendar as CalendarIcon
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
  conversationId?: number
  senderId: number
  senderName?: string
  encryptedContent: string
  messageType: string
  createdAt: string
  readBy?: number[]
  stickerUrl?: string
  isPinned?: boolean
  attachments?: any[]
  parentMessageId?: number
}

interface ChatAreaProps {
  conversation: any
  onBack?: () => void
  onShowMembers?: () => void
  onToggleBoard?: () => void
  onToggleSearch?: () => void
  onToggleCalendar?: () => void
  onRefreshConversations?: () => void
  isMobile?: boolean
  className?: string
}

function SystemMessage({ msg, onScrollTo }: { msg: Message, onScrollTo: (id: number) => void }) {
  const isPinAction = msg.encryptedContent?.toLowerCase().includes('ghim');
  
  return (
    <div className="flex justify-center my-2">
      <div className="bg-muted/50 px-4 py-1.5 rounded-full text-[10px] text-muted-foreground flex items-center gap-2 border border-primary/5 shadow-sm opacity-80 italic font-medium">
        <Hash className="h-3 w-3 opacity-30" />
        <span>{msg.encryptedContent}</span>
        {isPinAction && msg.parentMessageId && (
          <button 
            onClick={() => onScrollTo(msg.parentMessageId!)}
            className="ml-1 text-primary font-black not-italic hover:underline cursor-pointer uppercase text-[9px]"
          >
            Xem
          </button>
        )}
      </div>
    </div>
  );
}

export function ChatArea({ 
  conversation, 
  onBack, 
  onShowMembers, 
  onToggleBoard, 
  onToggleSearch, 
  onToggleCalendar,
  onRefreshConversations, 
  isMobile = false, 
  className 
}: ChatAreaProps) {
  const { token, user } = useAuth()
  const { isConnected, sendMessage, lastMessage, markAsRead, sendTyping, typingUsers, togglePinMessage, lastDeletedMessage, pinnedMessages } = useSignalR()
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

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).scrollToMsg = scrollToMessage
    }
  }, [scrollToMessage])

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
      // Immediate update
      const updatedMessages = await conversationsApi.getMessages(token, conversation.id)
      setMessages(updatedMessages.map((m: any) => ({ ...m, conversationId: m.conversationId || conversation.id })))
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
        const response: any = await conversationsApi.getMessages(token, conversation.id)
        console.log("Messages loaded for conversation:", conversation.id, response)
        
        // Handle both direct array or paginated response with .items
        const data = Array.isArray(response) ? response : (response.items || [])
        
        const mappedMessages = data.map((m: any) => ({
          ...m,
          id: m.id || m.Id,
          conversationId: m.conversationId || m.ConversationId || conversation.id,
          senderId: m.senderId || m.SenderId,
          encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message || "",
          createdAt: m.createdAt || m.CreatedAt,
          attachments: m.attachments || m.Attachments || [],
          parentMessageId: m.parentMessageId || m.ParentMessageId
        }))
        
        // Sort by createdAt ascending
        const sortedMessages = mappedMessages.sort((a: any, b: any) => 
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        )
        
        setMessages(sortedMessages)
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
            encryptedContent: lastMessage.message || "",
            messageType: lastMessage.messageType || 'Text',
            createdAt: lastMessage.time.toISOString(),
            stickerUrl: lastMessage.stickerUrl,
            isPinned: lastMessage.isPinned,
            attachments: lastMessage.attachments || [],
            parentMessageId: lastMessage.parentMessageId
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
    if (pinnedMessages && conversation && pinnedMessages.conversationId === conversation.id) {
       setMessages(prev => prev.map(m => 
          m.id === pinnedMessages.messageId ? { ...m, isPinned: pinnedMessages.isPinned } : m
       ));
    }
  }, [pinnedMessages, conversation?.id]);

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
                  <VideoIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gọi video</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={onToggleSearch}>
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
                 <DropdownMenuItem onClick={onToggleSearch} className="p-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-3">
                    <Search className="h-4 w-4 text-primary" /> Tìm kiếm tin nhắn
                 </DropdownMenuItem>
                 <DropdownMenuItem onClick={onToggleCalendar} className="p-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-3">
                    <CalendarIcon className="h-4 w-4 text-primary" /> Tạo lịch hẹn
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


      {/* 2. PINNED MESSAGE BAR (Zalo Style - Optimized) */}
      {pinnedList.length > 0 && (
         <div className="z-20 bg-background/95 backdrop-blur-md border-b flex items-center transition-all duration-300 border-l-4 border-l-primary h-12 shadow-sm relative animate-in slide-in-from-top-1 px-4 gap-3 shrink-0">
             <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10 shrink-0">
                <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
             </div>
             
             <div className="flex-1 min-w-0 cursor-pointer" onClick={() => latestPin && scrollToMessage(latestPin.id)}>
                <div className="flex items-center gap-1.5">
                   <p className="text-[9px] font-black uppercase text-primary tracking-tight">Tin ghim</p>
                   {pinnedList.length > 1 && (
                      <span className="text-[9px] font-black opacity-40">({pinnedList.length})</span>
                   )}
                </div>
                {latestPin && (
                  <p className="text-xs truncate opacity-80 font-bold">
                      {latestPin.senderName}: {(() => {
                        const content = latestPin.encryptedContent;
                        const isPlaceholder = content === "." || content === "[Attachment]";
                        if (content && !isPlaceholder) return content;
                        
                        if (latestPin.attachments && latestPin.attachments.length > 0) {
                          const att = latestPin.attachments[0];
                          const mime = att.mimeType || att.contentType || "";
                          const name = att.fileName || "Tệp đính kèm";
                          if (mime.startsWith('image/')) return "[Hình ảnh]";
                          if (mime.startsWith('video/')) return "[Video]";
                          return `[File: ${name}]`;
                        }
                        return "Tin nhắn không có nội dung";
                      })()}
                  </p>
                )}
             </div>

             <div className="flex items-center gap-1">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full" onClick={onToggleBoard}>
                   <ChevronDown className="h-4 w-4" />
                </Button>

                <DropdownMenu>
                   <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary hover:bg-primary/5 rounded-full">
                         <MoreVertical className="h-4 w-4" />
                      </Button>
                   </DropdownMenuTrigger>
                   <DropdownMenuContent align="end" className="w-48 p-1 rounded-xl shadow-xl">
                      <DropdownMenuItem onClick={onToggleBoard} className="text-xs font-bold gap-2 p-2 rounded-lg">
                         <ActivityIcon className="h-3.5 w-3.5" /> Mở Bảng tin nhóm
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => latestPin && togglePinMessage(latestPin.id)} className="text-xs font-bold gap-2 p-2 rounded-lg text-destructive">
                         <PinOff className="h-3.5 w-3.5" /> Bỏ ghim tin nhắn này
                      </DropdownMenuItem>
                   </DropdownMenuContent>
                </DropdownMenu>
             </div>
         </div>
      )}

      <div className="flex-1 relative overflow-hidden bg-[#0a101f]">
        {/* Chat Background Layer (Deep visual depth) */}
        <div className="absolute inset-0 opacity-[0.06] pointer-events-none bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] z-0 bg-repeat" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a101f] via-[#0d1425]/50 to-[#0a101f] pointer-events-none z-0" />
        
        <ScrollArea className="h-full relative z-10">
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
                       {msgs.map((m, idx) => {
                          const isSystem = m.messageType === 'System' || m.messageType === 'Announcement';
                          const isPinAction = isSystem && (m.encryptedContent?.toLowerCase().includes('ghim') || m.encryptedContent?.toLowerCase().includes('pin'));
                          
                          if (isSystem) {
                            if (isPinAction) {
                              const nextMsgs = msgs.slice(idx + 1);
                              const hasNextPinAction = nextMsgs.length > 0 && 
                                                      (nextMsgs[0].messageType === 'System' || nextMsgs[0].messageType === 'Announcement') && 
                                                      (nextMsgs[0].encryptedContent?.toLowerCase().includes('ghim') || nextMsgs[0].encryptedContent?.toLowerCase().includes('pin'));
                              
                              if (hasNextPinAction) {
                                const isFirstInBlock = idx === 0 || 
                                                       !(msgs[idx-1].messageType === 'System' || msgs[idx-1].messageType === 'Announcement') || 
                                                       !(msgs[idx-1].encryptedContent?.toLowerCase().includes('ghim') || msgs[idx-1].encryptedContent?.toLowerCase().includes('pin'));
                                
                                if (isFirstInBlock) {
                                  return (
                                    <div key={m.id} className="flex flex-col items-center">
                                      <button 
                                        onClick={(e) => {
                                          const parent = e.currentTarget.parentElement;
                                          const hiddenItems = parent?.querySelectorAll('.hidden-pin-action');
                                          hiddenItems?.forEach(item => item.classList.remove('hidden'));
                                          e.currentTarget.style.display = 'none';
                                        }}
                                        className="mb-2 bg-muted/30 hover:bg-muted/50 px-4 py-1 rounded-full text-[9px] text-primary font-black uppercase tracking-widest border border-primary/10 transition-all cursor-pointer"
                                      >
                                        Xem cập nhật trước
                                      </button>
                                      <div className="hidden hidden-pin-action w-full">
                                         <SystemMessage msg={m} onScrollTo={scrollToMessage} />
                                      </div>
                                    </div>
                                  );
                                }
                                return (
                                  <div key={m.id} className="hidden hidden-pin-action w-full">
                                     <SystemMessage msg={m} onScrollTo={scrollToMessage} />
                                  </div>
                                );
                              }
                            }
                            return <SystemMessage key={m.id} msg={m} onScrollTo={scrollToMessage} />;
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
                                           <div className="flex flex-col gap-2">
                                             {/* Hiển thị Text Content: Chỉ hiện nếu nội dung không phải là placeholder */}
                                             {(() => {
                                               const text = m.encryptedContent;
                                               const isPlaceholder = text === "." || text === "[Attachment]";
                                               if (text && !isPlaceholder) {
                                                 return <p className="font-medium leading-relaxed whitespace-pre-wrap select-text">{text}</p>;
                                               }
                                               return null;
                                             })()}

                                             {/* Hiển thị Attachments: Luôn hiển thị nếu có file, không được đè lên text */}
                                             {m.attachments && m.attachments.length > 0 && (
                                               <div className="flex flex-col gap-2 mt-1">
                                                 {m.attachments.map((att: any, idx: number) => {
                                                   const fileUrl = getAvatarUrl(att.filePath || att.encryptedFilePath || att.FilePath);
                                                   const isImg = att.contentType?.startsWith('image/') || att.mimeType?.startsWith('image/') || att.fileName?.match(/\.(jpg|jpeg|png|gif)$/i);
                                                   
                                                   if (isImg) {
                                                     return (
                                                       <div key={idx} className="rounded-xl overflow-hidden border-2 border-background/20">
                                                         <img src={fileUrl} className="max-w-full h-auto max-h-[300px] object-cover" alt={att.fileName} />
                                                         <a href={fileUrl} download target="_blank" className="p-2 block bg-black/20 text-[10px] text-center hover:bg-black/40 transition-colors uppercase font-black">Tải ảnh</a>
                                                       </div>
                                                     );
                                                   }
                                                   return (
                                                     <a key={idx} href={fileUrl} download target="_blank" className="flex items-center gap-2 p-2 bg-white/10 rounded-lg border border-white/10 hover:bg-white/20 transition-all">
                                                       <FileText className="h-4 w-4 text-primary" />
                                                       <div className="flex-1 min-w-0">
                                                         <p className="text-[10px] truncate font-bold uppercase">{att.fileName}</p>
                                                         <p className="text-[8px] opacity-50">{(att.fileSize / 1024).toFixed(1)} KB</p>
                                                       </div>
                                                       <Download className="h-3 w-3" />
                                                     </a>
                                                   );
                                                 })}
                                               </div>
                                             )}
                                           </div>

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
                                      <span className="text-[9px] font-black uppercase tracking-widest">{formatMessageTime(m.createdAt || new Date().toISOString())}</span>
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
