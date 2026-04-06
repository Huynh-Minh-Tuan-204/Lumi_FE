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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
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

  const handleGroupAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'background') => {
    const file = event.target.files?.[0]
    if (!file || !conversation || !token) return
    try {
      toast.info(`Đang cập nhật...`)
      if (type === 'avatar') await conversationsApi.uploadGroupAvatar(token, conversation.id, file)
      else await conversationsApi.uploadGroupBackground(token, conversation.id, file)
      toast.success('Đã cập nhật!')
      if (onRefreshConversations) onRefreshConversations();
    } catch (error) {
        toast.error('Cập nhật thất bại.')
    }
  }

  // Vietnamese Date Formatter
  const getVNFullDate = (date: Date) => {
    const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
    return `${days[date.getDay()] || 'Ngày lạ'}, ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
  }

  // Reset states when conversation changes
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

  // Real-time message updates
  useEffect(() => {
    if (lastMessage && conversation && lastMessage.conversationId === conversation.id) {
       setMessages(prev => {
          if (prev.some(m => m.id === lastMessage.id)) return prev;
          const newList = [...prev, {
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
          return newList;
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
    scrollToBottom()
  }, [messages])

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

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

  // Component to handle grouped system notifications (Pin/Unpin)
  const SystemNotificationGroup = ({ notifications }: { notifications: Message[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    useEffect(() => {
      setIsExpanded(false);
    }, [conversation?.id]);

    if (notifications.length === 0) return null;

    const latest = notifications[notifications.length - 1];
    const older = notifications.slice(0, -1);

    return (
      <div className="flex flex-col items-center gap-2 animate-in fade-in duration-500">
        {older.length > 0 && !isExpanded && (
          <button 
            onClick={() => setIsExpanded(true)}
            className="text-[9px] font-bold text-muted-foreground/50 hover:text-primary transition-colors uppercase tracking-[0.2em] bg-muted/20 px-3 py-1 rounded-full mb-1"
          >
            + Xem {older.length} cập nhật trước
          </button>
        )}
        
        {isExpanded && older.map(n => (
          <div key={n.id} className="bg-muted/30 px-4 py-1 rounded-full text-[10px] text-muted-foreground/60 flex items-center gap-2 border border-primary/5 animate-in slide-in-from-top-1">
            <Hash className="h-3 w-3 opacity-20" />
            <span>{n.encryptedContent}</span>
          </div>
        ))}

        <div className="bg-muted px-4 py-1.5 rounded-full text-[10px] text-muted-foreground flex items-center gap-2 border border-primary/5 shadow-sm">
           <Pin className="h-3 w-3 text-orange-500 opacity-60" />
           <span className="font-medium">{latest.encryptedContent}</span>
           <button 
              className="text-primary font-black ml-1 hover:underline uppercase tracking-tighter"
              onClick={() => {
                // Find the target message if it's a pin notification
                // This is a simplified logic
                if (latestPin) scrollToMessage(latestPin.id)
              }}
           >
              [Xem]
           </button>
        </div>
      </div>
    );
  };

  const groupedMessages = messages.reduce<Record<string, Message[]>>((acc, msg) => {
    const d = new Date(msg.createdAt)
    const dateKey = isNaN(d.getTime()) ? 'Ngày không xác định' : d.toDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(msg)
    return acc
  }, {})

  if (!conversation) return null

  return (
    <div className={cn('flex flex-col bg-background h-full overflow-hidden relative', className)}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md z-20 border-b shadow-sm shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarImage src={getAvatarUrl(conversation.avatarPath)} />
            <AvatarFallback className="bg-primary/5 text-primary">{conversation.name?.[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">{conversation.name}</h2>
            <div className="flex items-center gap-2">
               <div className="h-2 w-2 rounded-full bg-green-500" />
               <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-60">
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
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-9 w-9 text-muted-foreground hover:text-primary"
                  onClick={() => (window as any).toggleSearch?.()}
                >
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
              <DropdownMenuContent align="end" className="w-56 overflow-hidden">
                 <DropdownMenuItem onClick={onToggleBoard}>
                    <ActivityIcon className="mr-2 h-4 w-4" /> Bảng tin nhóm
                 </DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem className="text-destructive">
                    <LogOut className="mr-2 h-4 w-4" /> Rời khỏi hội thoại
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
        </div>
      </header>

      {/* Pinned Bar */}
      {pinnedList.length > 0 && (
         <div className="z-20 bg-background/90 border-b px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}>
             <Hash className="h-4 w-4 text-primary" />
             <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase text-primary tracking-tighter opacity-70">Tin nhắn đã ghim ({pinnedList.length})</p>
                <p className="text-xs truncate opacity-90">
                    {latestPin.senderName}: {latestPin.stickerUrl ? '[Nhãn dán]' : latestPin.encryptedContent}
                </p>
             </div>
             <ChevronDown className={cn("h-4 w-4 transition-transform", isPinnedListExpanded && "rotate-180")} />
         </div>
      )}

      {/* Chat Messages */}
      <div className="flex-1 relative overflow-hidden bg-muted/5">
        <ScrollArea className="h-full">
           <div className="p-4 flex flex-col justify-end min-h-full space-y-8">
              {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
                 <div key={dateKey} className="space-y-6">
                    <div className="flex items-center gap-4 opacity-30">
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">
                          {dateKey === 'Ngày không xác định' ? dateKey : (dateKey === new Date().toDateString() ? 'Hôm nay' : getVNFullDate(new Date(dateKey)))}
                        </span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-4">
                       {(() => {
                        const items: React.ReactNode[] = [];
                        let i = 0;
                        while (i < msgs.length) {
                          const m = msgs[i];
                          const isSystem = m.messageType === 'System' || m.messageType === 'Announcement';
                          const content = (m.encryptedContent || "").toLowerCase();
                          const isPinNotification = isSystem && (content.includes('ghim') || content.includes('bỏ ghim'));

                          if (isPinNotification) {
                            const group: Message[] = [];
                            let j = i;
                            while (j < msgs.length) {
                              const curr = msgs[j];
                              const currSystem = curr.messageType === 'System' || curr.messageType === 'Announcement';
                              const currContent = (curr.encryptedContent || "").toLowerCase();
                              if (currSystem && (currContent.includes('ghim') || currContent.includes('bỏ ghim'))) {
                                group.push(curr);
                                j++;
                              } else {
                                break;
                              }
                            }
                            items.push(<SystemNotificationGroup key={`group-${m.id}`} notifications={group} />);
                            i = j;
                            continue;
                          }

                          if (isSystem) {
                            items.push(
                              <div key={m.id} className="flex justify-center">
                                 <div className="bg-muted px-4 py-1.5 rounded-full text-[10px] text-muted-foreground flex items-center gap-2 border border-primary/5">
                                    <Hash className="h-3 w-3 opacity-30" />
                                    <span>{m.encryptedContent}</span>
                                 </div>
                              </div>
                            );
                            i++;
                            continue;
                          }

                          const isOwn = m.senderId === user?.id;
                          const isPinned = m.isPinned;

                          items.push(
                            <div key={m.id} id={`message-${m.id}`} className={cn("flex gap-3 group animate-in slide-in-from-bottom-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn("max-w-[70%] space-y-1", isOwn ? "items-end" : "items-start")}>
                                   {!isOwn && <p className="text-[10px] font-black opacity-60 ml-1">{m.senderName}</p>}
                                   
                                   <DropdownMenu>
                                     <DropdownMenuTrigger asChild>
                                       <div className={cn(
                                           "px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words relative cursor-pointer",
                                           isOwn ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background border rounded-tl-none"
                                       )}>
                                           {(() => {
                                              if (m.stickerUrl) {
                                                return <img src={m.stickerUrl} className="w-32 h-32 object-contain" />
                                              }
                                              
                                              if (m.attachments && m.attachments.length > 0) {
                                                return (
                                                  <div className="space-y-2">
                                                    {m.attachments.map((att: any, idx: number) => {
                                                      const isImg = att.contentType?.startsWith('image/') || att.fileName?.match(/\.(jpg|jpeg|png|gif)$/i);
                                                      if (isImg) {
                                                        return <img key={idx} src={getAvatarUrl(att.filePath)} className="max-w-full rounded-lg h-48 object-cover cursor-zoom-in" />
                                                      }
                                                      return (
                                                        <a key={idx} href={getAvatarUrl(att.filePath)} target="_blank" download className="flex items-center gap-3 p-3 bg-muted/20 border border-primary/5 rounded-xl hover:bg-muted/30 transition-colors">
                                                           <div className="h-10 w-10 flex items-center justify-center bg-primary/10 rounded-lg shrink-0">
                                                              <FileText className="h-5 w-5 text-primary" />
                                                           </div>
                                                           <div className="min-w-0 flex-1">
                                                              <p className="text-xs font-black truncate">{att.fileName}</p>
                                                              <p className="text-[9px] opacity-40 uppercase font-bold">{(att.fileSize / 1024).toFixed(1)} KB</p>
                                                           </div>
                                                           <Download className="h-4 w-4 opacity-20" />
                                                        </a>
                                                      )
                                                    })}
                                                    {m.encryptedContent && <p className="mt-2">{m.encryptedContent}</p>}
                                                  </div>
                                                )
                                              }

                                              return <p>{m.encryptedContent}</p>
                                           })()}

                                           {isPinned && <Pin className="h-3 w-3 absolute -top-1.5 -right-1.5 text-orange-500 fill-orange-500" />}
                                       </div>
                                     </DropdownMenuTrigger>
                                     <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48">
                                        <DropdownMenuItem onClick={() => setReplyingTo(m)}>
                                           <Reply className="h-4 w-4 mr-2" /> Trả lời
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => togglePinMessage(m.id)}>
                                           {isPinned ? <><PinOff className="h-4 w-4 mr-2" /> Bỏ ghim</> : <><Pin className="h-4 w-4 mr-2" /> Ghim tin nhắn</>}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem className="text-destructive">
                                           <Trash2 className="h-4 w-4 mr-2" /> Xóa tin nhắn
                                        </DropdownMenuItem>
                                     </DropdownMenuContent>
                                   </DropdownMenu>

                                   <div className="flex items-center gap-2 px-1 opacity-40">
                                      <span className="text-[9px] font-bold">{formatMessageTime(m.createdAt)}</span>
                                      {isOwn && (m.readBy?.length ? <CheckCheck className="h-3 w-3 text-primary" /> : <Check className="h-3 w-3" />)}
                                   </div>
                                </div>
                            </div>
                          );
                          i++;
                        }
                        return items;
                      })()}
                    </div>
                 </div>
              ))}
              <div ref={messagesEndRef} />
           </div>
        </ScrollArea>
      </div>

      {replyingTo && (
        <div className="px-4 py-2 bg-muted/50 border-t flex items-center justify-between">
           <div className="flex items-center gap-2 overflow-hidden">
              <Reply className="h-3.5 w-3.5 text-primary" />
              <div className="truncate shrink">
                 <p className="text-[10px] font-bold text-primary">Đang trả lời {replyingTo.senderName}</p>
                 <p className="text-xs truncate opacity-70">{replyingTo.encryptedContent}</p>
              </div>
           </div>
           <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReplyingTo(null)}><Plus className="h-4 w-4 rotate-45" /></Button>
        </div>
      )}

      {/* Input Section */}
      <div className="bg-card border-t pt-2 pb-4 px-4 space-y-2 z-30 shadow-2xl shrink-0">
        <div className="flex items-center gap-1 opacity-70">
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
        </div>

        <div className="flex items-end gap-3 px-1">
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
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-1 resize-none max-h-32 min-h-[40px] scrollbar-none outline-none"
              rows={1}
            />
            <div className="flex items-center gap-1 mb-1">
               <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary"><Smile className="h-5 w-5" /></Button>
               {!newMessage.trim() ? (
                   <Button variant="ghost" size="icon" className="h-9 w-9 text-primary/40 hover:text-primary hover:bg-primary/5 transition-all">
                     <ThumbsUp className="h-5 w-5" />
                   </Button>
               ) : (
                   <Button 
                    onClick={handleSendMessage} 
                    size="icon" 
                    className="h-9 w-9 bg-primary text-primary-foreground rounded-xl shadow-lg hover:scale-105 transition-transform"
                   >
                     <Send className="h-4 w-4" />
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

function Phone(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  )
}

function Video(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m22 8-6 4 6 4V8Z" />
      <rect width="14" height="12" x="2" y="6" rx="2" ry="2" />
    </svg>
  )
}
