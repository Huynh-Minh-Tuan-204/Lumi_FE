'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cn, getAvatarUrl, formatToVNTime, formatToVNDate } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi, attachmentsApi, meetingsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRouter } from 'next/navigation'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  ArrowLeft,
  Phone,
  Video,
  MoreVertical,
  Send,
  Paperclip,
  Smile,
  Image as ImageIcon,
  Users,
  Hash,
  Reply,
  Heart,
  ThumbsUp,
  Laugh,
  Angry,
  MessageSquare,
  Trash,
  LogOut,
  ChevronDown,
  Check,
  CheckCheck,
  Settings,
  ImagePlus as ImageasBgIcon,
  Activity,
  Plus,
} from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { Conversation } from '@/app/chat/page'

export interface Message {
  id: number
  senderId: number
  encryptedContent: string
  iv: string
  createdAt: string
  messageType: string
  senderName?: string
  avatarPath?: string
  attachments?: Array<{
    id: number
    fileName: string
    encryptedFilePath: string
    fileSize: number
    mimeType: string
  }>
  stickerUrl?: string
  isPinned?: boolean
  readBy?: number[]
}

interface ChatAreaProps {
  conversation: Conversation | null
  onBack?: () => void
  onShowMembers?: () => void
  onToggleBoard?: () => void
  onRefreshConversations?: () => void
  isMobile?: boolean
  className?: string
}

export function ChatArea({
  conversation,
  onBack,
  onShowMembers,
  onToggleBoard,
  onRefreshConversations,
  isMobile = false,
  className,
}: ChatAreaProps) {
  const router = useRouter()
  const { token, user } = useAuth()
  const { 
    sendMessage, 
    lastMessage, 
    isConnected, 
    isReconnecting,
    lastReadUpdate,
    lastUserUpdate, 
    sendTyping, 
    typingUsers, 
    sendSticker,
    togglePinMessage,
    sendReminder,
    pinnedMessages
  } = useSignalR()
  
  const [isPinnedListExpanded, setIsPinnedListExpanded] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [pendingQueue, setPendingQueue] = useState<{ content: string, replyTo?: number }[]>([])
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  
  const scrollRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const groupAvatarInputRef = useRef<HTMLInputElement>(null)
  const groupBackgroundInputRef = useRef<HTMLInputElement>(null)

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

  // Reset states when conversation changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!token || !conversation) { setMessages([]); return; }
      setIsLoading(true)
      try {
        const data = await conversationsApi.getMessages(token, conversation.id)
        const mappedMessages: Message[] = data.map((d: any) => ({
          id: d.id ?? d.Id,
          senderId: d.senderId ?? d.SenderId,
          encryptedContent: d.content ?? d.message ?? d.encryptedContent ?? d.EncryptedContent ?? "",
          iv: d.iv ?? d.Iv,
          messageType: d.messageType ?? d.MessageType,
          senderName: d.senderName ?? d.SenderName ?? d.sender,
          avatarPath: d.avatarPath ?? d.AvatarPath,
          attachments: d.attachments ?? d.Attachments,
          readBy: d.readBy ?? d.ReadBy ?? [],
          stickerUrl: d.stickerUrl ?? d.StickerUrl,
          isPinned: d.isPinned ?? d.IsPinned,
          createdAt: d.createdAt ?? d.CreatedAt ?? d.time ?? new Date().toISOString(),
        }))
        setMessages(mappedMessages)
      } catch (error) { console.error(error) } finally { setIsLoading(false) }
    }
    loadMessages()
    setReplyingTo(null)
    setIsPinnedListExpanded(false)
  }, [token, conversation?.id])

  // Component to handle grouped system notifications (Pin/Unpin)
  const SystemNotificationGroup = ({ notifications }: { notifications: Message[] }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    // Reset isExpanded when conversation changes (id is captured via closure if used properly, 
    // but here we can just rely on the parent component re-rendering or use a key)
    useEffect(() => {
      setIsExpanded(false);
    }, [conversation?.id]);

    if (notifications.length === 0) return null;

    const latest = notifications[notifications.length - 1];
    const older = notifications.slice(0, -1);

    return (
      <div className="space-y-2 my-2 animate-in fade-in duration-300">
        {older.length > 0 && !isExpanded && (
          <div className="flex justify-center">
            <Button 
              variant="ghost" 
              size="sm" 
              className="bg-muted/30 hover:bg-muted/50 py-1 px-4 rounded-full text-[10px] font-black text-primary/60 flex items-center gap-2 h-auto uppercase tracking-tighter"
              onClick={() => setIsExpanded(true)}
            >
              Xem cập nhật trước
            </Button>
          </div>
        )}

        {isExpanded && older.length > 0 && (
          <div className="space-y-2 animate-in slide-in-from-top-1">
            <div className="flex justify-center mb-1">
              <button 
                className="text-[9px] font-black text-primary/30 hover:text-primary transition-colors uppercase tracking-[0.2em]" 
                onClick={() => setIsExpanded(false)}
              >
                Thu gọn
              </button>
            </div>
            {older.map(m => (
              <div key={m.id} className="flex justify-center">
                <div className="bg-muted/20 px-4 py-1.5 rounded-full text-[10px] text-muted-foreground flex items-center gap-2 border border-black/5 dark:border-white/5 opacity-60">
                   <Hash className="h-2.5 w-2.5 opacity-40" />
                   <span>{m.encryptedContent}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* The Latest Notification - ALWAYS VISIBLE */}
        <div className="flex justify-center">
           <div className="bg-muted/50 px-4 py-1.5 rounded-full text-[10px] font-medium text-foreground flex items-center gap-2 border border-primary/10 shadow-sm">
              <Hash className="h-3 w-3 text-primary animate-pulse" />
              <span>{latest.encryptedContent}</span>
              {latest.encryptedContent.toLowerCase().includes('ghim') && !latest.encryptedContent.toLowerCase().includes('bỏ ghim') && (
                <button 
                  className="text-primary font-black ml-1 hover:underline uppercase tracking-tighter"
                  onClick={() => { if(latestPin) scrollToMessage(latestPin.id) }}
                >
                    [Xem]
                </button>
              )}
           </div>
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (!lastMessage || !conversation || lastMessage.conversationId !== conversation.id) return
    setMessages(prev => {
      if (prev.some(m => m.id === lastMessage.id)) return prev
      return [...prev, {
        id: lastMessage.id,
        senderId: lastMessage.senderId || 0,
        encryptedContent: lastMessage.message,
        iv: lastMessage.iv ?? '',
        createdAt: new Date(lastMessage.time).toISOString(),
        messageType: lastMessage.messageType || (lastMessage.isSystem ? 'Announcement' : 'Text'),
        senderName: lastMessage.sender,
        avatarPath: lastMessage.avatarPath,
        attachments: lastMessage.attachments || [],
        stickerUrl: lastMessage.stickerUrl,
        isPinned: lastMessage.isPinned,
        readBy: [],
      }]
    })
  }, [lastMessage, conversation])

  useEffect(() => {
    if (!pinnedMessages || !conversation || pinnedMessages.conversationId !== conversation.id) return
    setMessages(prev => prev.map(m => m.id === pinnedMessages.messageId ? { ...m, isPinned: pinnedMessages.isPinned } : m))
  }, [pinnedMessages, conversation])

  useEffect(() => {
    if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation || isSending) return
    setIsSending(true)
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12))
      const ivBase64 = btoa(String.fromCharCode(...iv))
      await sendMessage(conversation.id, newMessage, ivBase64, replyingTo?.id)
      setNewMessage('')
      setReplyingTo(null)
    } catch (error) { toast.error('Lỗi khi gửi tin nhắn') } finally { setIsSending(false) }
  }

  const formatMessageTime = (dateString: string) => formatToVNTime(dateString)
  const formatMessageDate = (dateString: string) => formatToVNDate(dateString)

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
          <Avatar className="h-10 w-10">
            <AvatarImage src={getAvatarUrl(conversation.avatarPath)} />
            <AvatarFallback className="bg-primary/5 text-primary">{conversation.name?.[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-bold text-sm truncate">{conversation.name}</h2>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-widest opacity-60">
                {conversation.type === 'Group' ? 'Hội nhóm' : 'Trò chuyện cá nhân'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onShowMembers?.()}><Users className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon"><MoreVertical className="h-5 w-5" /></Button>
        </div>
      </header>

      {/* Pinned Bar */}
      {pinnedList.length > 0 && (
         <div className="z-20 bg-background/90 border-b px-4 py-2 flex items-center gap-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}>
             <Hash className="h-4 w-4 text-primary" />
             <div className="flex-1 min-w-0">
                <p className="text-[10px] font-black uppercase text-primary tracking-tighter opacity-70">Ghim gần đây</p>
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
                        <span className="text-[10px] font-bold uppercase tracking-[0.2em]">{dateKey === new Date().toDateString() ? 'Hôm nay' : dateKey}</span>
                        <div className="flex-1 h-px bg-border" />
                    </div>

                    <div className="space-y-4">
                       {(() => {
                        const items: React.ReactNode[] = [];
                        let i = 0;
                        while (i < msgs.length) {
                          const m = msgs[i];
                          const isSystem = m.messageType === 'System' || m.messageType === 'Announcement';
                          const content = m.encryptedContent.toLowerCase();
                          const isPinNotification = isSystem && (content.includes('ghim') || content.includes('bỏ ghim'));

                          if (isPinNotification) {
                            const group: Message[] = [];
                            let j = i;
                            while (j < msgs.length) {
                              const curr = msgs[j];
                              const currSystem = curr.messageType === 'System' || curr.messageType === 'Announcement';
                              const currContent = curr.encryptedContent.toLowerCase();
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
                          items.push(
                            <div key={m.id} id={`message-${m.id}`} className={cn("flex gap-3 group animate-in slide-in-from-bottom-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                                <div className={cn("max-w-[70%] space-y-1", isOwn ? "items-end" : "items-start")}>
                                   {!isOwn && <p className="text-[10px] font-black opacity-60 ml-1">{m.senderName}</p>}
                                   <div className={cn(
                                       "px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words relative",
                                       isOwn ? "bg-primary text-primary-foreground rounded-tr-none" : "bg-background border rounded-tl-none"
                                   )}>
                                       {m.stickerUrl ? <img src={m.stickerUrl} className="w-32 h-32 object-contain" /> : <p>{m.encryptedContent}</p>}
                                   </div>
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

      {/* Reply Preview placeholder */}
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
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary"><Smile className="h-4 w-4" /></Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
           <div className="w-px h-4 bg-border mx-1" />
           <Button variant="ghost" size="icon" className="h-8 w-8 hover:text-primary"><Activity className="h-4 w-4" /></Button>
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
                 handleSendMessage()
               }
             }}
             placeholder="Nhập tin nhắn..."
             className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-1 resize-none max-h-32 min-h-[40px] scrollbar-none outline-none"
             rows={1}
           />
           <div className="flex items-center gap-1 mb-1">
              {isMobile ? (
                  <Button onClick={handleSendMessage} size="icon" className="h-9 w-9"><Send className="h-4 w-4" /></Button>
              ) : (
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-yellow-500 hover:bg-yellow-500/10">
                    <ThumbsUp className="h-5 w-5 fill-current" />
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
