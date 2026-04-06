'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { cn, getAvatarUrl, formatToVNTime, formatToVNDate } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi } from '@/lib/api'
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
} from 'lucide-react'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { toast } from 'sonner'
import type { Conversation } from '@/app/chat/page'

interface Message {
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

import { attachmentsApi, meetingsApi } from '@/lib/api'

interface ChatAreaProps {
  conversation: Conversation | null
  onBack?: () => void
  onShowMembers?: () => void
  onRefreshConversations?: () => void
  isMobile?: boolean
  className?: string
}

const EMOJI_REACTIONS = ['thumbsUp', 'heart', 'laugh', 'angry'] as const
const EMOJI_ICONS = {
  thumbsUp: ThumbsUp,
  heart: Heart,
  laugh: Laugh,
  angry: Angry,
}
const COMMON_EMOJIS = ['smile', 'laugh', 'heart', 'thumbsUp', 'fire', 'party']

export function ChatArea({
  conversation,
  onBack,
  onShowMembers,
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
      toast.success('Tải tệp lên thành công!')
      // Optionally trigger a refresh or let SignalR handle the new message event
    } catch (error) {
      console.error('File upload failed:', error)
      toast.error('Tải tệp lên thất bại.')
    }
  }

  const handleGroupAssetUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'background') => {
    const file = event.target.files?.[0]
    if (!file || !conversation || !token) return

    try {
      toast.info(`Đang tải ${type} nhóm lên...`)
      if (type === 'avatar') {
        await conversationsApi.uploadGroupAvatar(token, conversation.id, file)
      } else {
        await conversationsApi.uploadGroupBackground(token, conversation.id, file)
      }
      toast.success(`Đã cập nhật ${type} nhóm!`)
      if (onRefreshConversations) onRefreshConversations();
      // SignalR should trigger a ReceiveGroupUpdate which updates the page state for others
    } catch (error) {
      console.error(`Group ${type} upload failed:`, error)
      toast.error(`Tải ${type} nhóm thất bại.`)
    }
  }

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!conversation || !token || !user) return
    try {
      const resp = await meetingsApi.startMeeting(token, conversation.id, `${type === 'voice' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} - ${conversation.name}`, [], type)
      toast.success(`Đã bắt đầu cuộc gọi ${type === 'voice' ? 'thoại' : 'video'}.`)
      // Navigate to call page with the meetingId
      if (resp && resp.id) {
        router.push(`/call/${resp.id}?type=${type}`)
      } else if (resp && resp.meetingId) {
        router.push(`/call/${resp.meetingId}?type=${type}`)
      }
    } catch (error) {
      console.error(`Failed to start ${type} call:`, error)
      toast.error(`Không thể bắt đầu cuộc gọi ${type === 'voice' ? 'thoại' : 'video'}.`)
    }
  }

  // Load messages when conversation changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!token || !conversation) {
        setMessages([])
        return
      }
      setIsLoading(true)
      try {
        const data = await conversationsApi.getMessages(token, conversation.id)
        // Map data to ensure camelCase properties are set if backend sends camelCase or PascalCase
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
          createdAt: d.createdAt ?? d.CreatedAt ?? d.time,
        }))
        setMessages(mappedMessages)
      } catch (error) {
        console.error('Failed to load messages:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadMessages()
  }, [token, conversation?.id])

  // Handle realtime messages
  useEffect(() => {
    if (!lastMessage || !conversation || lastMessage.conversationId !== conversation.id) return
    
    setMessages(prev => {
      if (prev.some(m => m.id === lastMessage.id)) return prev
      
      const newMsg: Message = {
        id: lastMessage.id,
        senderId: lastMessage.senderId || 0,
        encryptedContent: lastMessage.message,
        iv: lastMessage.iv ?? '',
        createdAt: (lastMessage.time instanceof Date ? lastMessage.time : new Date(lastMessage.time)).toISOString(),
        messageType: lastMessage.messageType || (lastMessage.isSystem ? 'Announcement' : 'Text'),
        senderName: lastMessage.sender,
        avatarPath: lastMessage.avatarPath,
        attachments: lastMessage.attachments || [],
        stickerUrl: lastMessage.stickerUrl,
        isPinned: lastMessage.isPinned,
        readBy: [],
      }
      return [...prev, newMsg]
    })
  }, [lastMessage, conversation])

  // Handle pinned status updates
  useEffect(() => {
    if (!pinnedMessages || !conversation || pinnedMessages.conversationId !== conversation.id) return
    
    setMessages(prev => prev.map(m => {
      if (m.id === pinnedMessages.messageId) {
        return { ...m, isPinned: pinnedMessages.isPinned }
      }
      return m
    }))
  }, [pinnedMessages, conversation])

  // Handle read updates
  useEffect(() => {
    if (!lastReadUpdate || !conversation || lastReadUpdate.conversationId !== conversation.id) return
    
    setMessages(prev => prev.map(m => {
      // If user read the conversation, all messages seen by them
      if (m.senderId !== lastReadUpdate.userId && !m.readBy?.includes(lastReadUpdate.userId)) {
        return { ...m, readBy: [...(m.readBy || []), lastReadUpdate.userId] }
      }
      return m
    }))
  }, [lastReadUpdate, conversation])

  // Scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // Auto flush offline queue when connected
  useEffect(() => {
    let active = true
    if (isConnected && pendingQueue.length > 0 && conversation) {
      const flush = async () => {
        if (!active) return
        setIsSending(true)
        try {
          // Send all sequentially
          for (const msg of pendingQueue) {
            const iv = crypto.getRandomValues(new Uint8Array(12))
            const ivBase64 = btoa(String.fromCharCode(...iv))
            await sendMessage(conversation.id, msg.content, ivBase64, msg.replyTo)
          }
          // Clear queue and reload UI from server to get real IDs
          setPendingQueue([])
          const data = await conversationsApi.getMessages(token!, conversation.id)
          const mappedMessages: Message[] = data.map((d: any) => ({
            id: d.id ?? d.Id,
            senderId: d.senderId ?? d.SenderId,
            encryptedContent: d.content ?? d.encryptedContent ?? d.EncryptedContent ?? "",
            iv: d.iv ?? d.Iv,
            createdAt: d.createdAt ?? d.CreatedAt,
            messageType: d.messageType ?? d.MessageType,
            senderName: d.senderName ?? d.SenderName,
            avatarPath: d.avatarPath ?? d.AvatarPath,
            attachments: d.attachments ?? d.Attachments,
          }))
          setMessages(mappedMessages)
        } catch (e) {
          console.error("Failed to flush queue", e)
        } finally {
          if (active) setIsSending(false)
        }
      }
      flush()
    }
    return () => {
      active = false
    }
  }, [isConnected, conversation, pendingQueue])

  // Sync other users' avatars when they update
  useEffect(() => {
    if (lastUserUpdate && messages.length > 0) {
      setMessages(prev => prev.map(m => {
        if (m.senderId === lastUserUpdate.userId) {
          return { ...m, avatarPath: lastUserUpdate.avatarPath }
        }
        return m
      }))
    }
  }, [lastUserUpdate])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation || isSending) return
    setIsSending(true)
    try {
      if (!isConnected) {
        // Optimistic offline send
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const ivBase64 = btoa(String.fromCharCode(...iv))
        const offlineMsg: Message = {
          id: Date.now(),
          senderId: user?.id || 0,
          encryptedContent: newMessage,
          iv: ivBase64,
          createdAt: new Date().toISOString(),
          messageType: 'Text',
          senderName: user?.fullName || 'You (Offline)'
        }
        setMessages(prev => [...prev, offlineMsg])
        setPendingQueue(prev => [...prev, { content: newMessage, replyTo: replyingTo?.id }])
        setNewMessage('')
        setReplyingTo(null)
      } else {
        const iv = crypto.getRandomValues(new Uint8Array(12))
        const ivBase64 = btoa(String.fromCharCode(...iv))
        await sendMessage(conversation.id, newMessage, ivBase64, replyingTo?.id)
        setNewMessage('')
        setReplyingTo(null)
      }
    } catch (error) {
      console.error('Failed to send message:', error)
    } finally {
      setIsSending(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatMessageTime = (dateString: string) => formatToVNTime(dateString)
  const formatMessageDate = (dateString: string) => formatToVNDate(dateString)

  // Group messages by date
  const groupedMessages = messages.reduce<Record<string, Message[]>>((acc, msg) => {
    const d = new Date(msg.createdAt)
    const dateKey = isNaN(d.getTime()) ? 'Unknown' : d.toDateString()
    if (!acc[dateKey]) acc[dateKey] = []
    acc[dateKey].push(msg)
    return acc
  }, {})

  if (!conversation) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center bg-background text-muted-foreground',
          className
        )}
      >
        <MessageSquare className="h-16 w-16 mb-4 opacity-20" />
        <h2 className="text-xl font-medium">Chọn một cuộc trò chuyện</h2>
        <p className="text-sm mt-1">Chọn một cuộc trò chuyện từ thanh bên để bắt đầu nhắn tin</p>
      </div>
    )
  }

  return (
    <div 
      className={cn('flex flex-col bg-background overflow-hidden min-h-0 relative', className)}
    >
      {/* Background Image if available */}
      {conversation.backgroundPath && (
        <div 
          className="absolute inset-0 z-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `url(${getAvatarUrl(conversation.backgroundPath)})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat'
          }}
        />
      )}
      
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-background/20 backdrop-blur-md z-10 sticky top-0 border-none shadow-none">
        <div className="flex items-center gap-3">
          {isMobile && onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10">
            <AvatarImage src={getAvatarUrl(conversation.avatarPath) || (conversation.type === 'Group' ? '/icon.png' : '')} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {conversation.type === 'Group' ? (
                <Hash className="h-5 w-5" />
              ) : (
                getInitials(conversation.name)
              )}
            </AvatarFallback>
          </Avatar>
          <div>
            <h2 className="font-semibold">{conversation.name}</h2>
            <p className="text-xs text-muted-foreground">
              {conversation.type === 'Group' ? 'Trò chuyện nhóm' : 'Tin nhắn trực tiếp'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => handleStartCall('voice')}>
                  <Phone className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cuộc gọi thoại</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => handleStartCall('video')}>
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Cuộc gọi video</TooltipContent>
            </Tooltip>

            {conversation.type === 'Group' && onShowMembers && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onShowMembers}>
                    <Users className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Xem thành viên</TooltipContent>
              </Tooltip>
            )}

            {conversation.type === 'Group' && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <MoreVertical className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[9999] w-56">
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Cài đặt nhóm
                  </div>
                  <DropdownMenuItem onClick={() => {
                    const name = prompt("Nhập tên nhóm mới:", conversation.name);
                    if (name && token) {
                      conversationsApi.renameConversation(token, conversation.id, name)
                        .then(() => {
                          toast.success("Đã đổi tên nhóm!");
                          window.location.reload();
                        })
                        .catch(() => toast.error("Đổi tên nhóm thất bại"));
                    }
                  }}>
                    <Settings className="mr-2 h-4 w-4" />
                    Đổi tên nhóm
                  </DropdownMenuItem>
                  
                  <DropdownMenuSeparator />
                  
                  <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Ảnh & Giao diện
                  </div>
                  <DropdownMenuItem onClick={() => groupAvatarInputRef.current?.click()}>
                    <ImageIcon className="mr-2 h-4 w-4" />
                    Đổi ảnh đại diện nhóm
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => groupBackgroundInputRef.current?.click()}>
                    <ImageasBgIcon className="mr-2 h-4 w-4" />
                    Đổi nền cuộc trò chuyện
                  </DropdownMenuItem>

                  <DropdownMenuSeparator />
                  {(user?.role === 'Admin' || conversation.createdBy === user?.id) && (
                    <DropdownMenuItem className="text-destructive" onClick={async () => {
                      if (confirm('Bạn có chắc chắn muốn giải tán nhóm này không?')) {
                        try {
                          await conversationsApi.disband(token!, conversation.id)
                          toast.success('Nhóm đã giải tán')
                          window.location.reload()
                        } catch (e) { toast.error('Giải tán nhóm thất bại') }
                      }
                    }}>
                      <Trash className="mr-2 h-4 w-4" />
                      Giải tán nhóm
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem className="text-destructive" onClick={async () => {
                    if (confirm('Bạn có chắc chắn muốn rời khỏi nhóm này không?')) {
                      try {
                        await conversationsApi.leave(token!, conversation.id, user!.id)
                        toast.success('Đã rời nhóm')
                        window.location.reload()
                      } catch (e) { toast.error('Rời nhóm thất bại') }
                    }
                  }}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Rời khỏi nhóm
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </TooltipProvider>
        </div>

        {/* Hidden inputs for Group Assets */}
        <input 
          type="file" 
          ref={groupAvatarInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => handleGroupAssetUpload(e, 'avatar')} 
        />
        <input 
          type="file" 
          ref={groupBackgroundInputRef} 
          className="hidden" 
          accept="image/*" 
          onChange={(e) => handleGroupAssetUpload(e, 'background')} 
        />
      </header>

      {/* Reconnecting Banner */}
      {isReconnecting && (
        <div className="bg-yellow-500/10 border-b border-yellow-500/20 py-1.5 px-4 flex items-center justify-center gap-2 text-[10px] font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-widest animate-pulse">
          <div className="h-2.5 w-2.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
          Mất kết nối. Đang kết nối lại...
        </div>
      )}

      {/* Pinned Message Bar */}
      {pinnedList.length > 0 && (
        <div 
          className="bg-card/90 dark:bg-card/80 border-b border-primary/10 z-20 group relative backdrop-blur-md shadow-sm"
        >
          {/* Main Pin Bar */}
          <div className="flex items-center gap-3 py-2 px-4">
            <div 
              onClick={() => scrollToMessage(latestPin.id)}
              className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
            >
              <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Hash className="h-3.5 w-3.5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-primary uppercase tracking-wider mb-0.5 opacity-80">Tin nhắn ghim</p>
                <p className="text-xs text-foreground truncate font-medium">
                  {latestPin.senderName ? `${latestPin.senderName}: ` : ''}
                  {latestPin.stickerUrl ? '[Nhãn dán]' : latestPin.encryptedContent}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-1 shrink-0">
              {pinnedList.length > 1 && (
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className={cn(
                    "h-7 px-2 text-[10px] font-bold transition-all",
                    isPinnedListExpanded ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
                  )}
                  onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}
                >
                  +{pinnedList.length - 1} ghim
                  <ChevronDown className={cn("ml-1 h-3 w-3 transition-transform", isPinnedListExpanded && "rotate-180")} />
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground/40 hover:text-foreground">
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="z-[9999]">
                  <DropdownMenuItem onClick={() => scrollToMessage(latestPin.id)}>
                    <Reply className="mr-2 h-4 w-4" /> Đi đến tin nhắn
                  </DropdownMenuItem>
                  <DropdownMenuItem 
                    className="text-destructive"
                    onClick={() => {
                      if (confirm('Bạn có muốn bỏ ghim tin nhắn này không?')) {
                        togglePinMessage(latestPin.id);
                      }
                    }}
                  >
                    <Trash className="mr-2 h-4 w-4" /> Bỏ ghim tin này
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          {/* Expanded List Panel */}
          {isPinnedListExpanded && (
            <div className="border-t border-primary/5 bg-muted/30 max-h-60 overflow-y-auto animate-in slide-in-from-top-2 duration-200">
              <div className="px-4 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex justify-between items-center">
                Danh sách ghim ({pinnedList.length})
                <button onClick={() => setIsPinnedListExpanded(false)} className="hover:text-primary transition-colors uppercase">Thu gọn</button>
              </div>
              <div className="divide-y divide-primary/5">
                {[...pinnedList].reverse().map((p) => (
                  <div 
                    key={p.id} 
                    className="px-4 py-3 hover:bg-primary/5 transition-colors flex items-center justify-between group/item"
                  >
                    <div 
                      className="flex-1 cursor-pointer min-w-0 pr-4"
                      onClick={() => {
                        scrollToMessage(p.id);
                        setIsPinnedListExpanded(false);
                      }}
                    >
                      <div className="flex items-center gap-2 mb-0.5">
                        <MessageSquare className="h-3 w-3 text-primary opacity-40" />
                        <span className="text-[10px] font-bold text-foreground/70 uppercase truncate">{p.senderName || 'Người dùng'}</span>
                      </div>
                      <p className="text-xs text-muted-foreground truncate leading-relaxed">
                        {p.stickerUrl ? '[Nhãn dán]' : p.encryptedContent}
                      </p>
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-8 w-8 opacity-0 group-hover/item:opacity-100 transition-opacity text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Bạn có muốn bỏ ghim tin nhắn này không?')) {
                          togglePinMessage(p.id);
                        }
                      }}
                    >
                      <Trash className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <div 
                className="p-2 text-center border-t border-primary/5 hover:bg-primary/5 cursor-pointer transition-colors"
                onClick={() => toast.info('Tính năng bảng tin nhóm đang được phát triển')}
              >
                <span className="text-[10px] font-medium text-primary">Xem tất cả ở bảng tin nhóm ›</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 min-h-0 relative z-10">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">Chưa có tin nhắn nào</p>
                <p className="text-xs mt-1">Hãy bắt đầu cuộc trò chuyện!</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Object.entries(groupedMessages).map(([dateKey, msgs]) => (
                  <div key={dateKey}>
                    {/* Date separator */}
                    <div className="flex items-center gap-4 my-4">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted-foreground px-2">
                        {formatMessageDate(msgs[0].createdAt)}
                      </span>
                      <div className="flex-1 h-px bg-border" />
                    </div>

                    {/* Messages */}
                    <div className="space-y-3">
                      {msgs.map((msg) => {
                        const isOwn = msg.senderId === user?.id || (msg.senderId === 0 && msg.senderName === user?.fullName) || (!msg.senderId && msg.senderName === user?.fullName)
                        const isSystem = msg.messageType === 'Announcement'

                        if (isSystem) {
                          return (
                            <div
                              key={msg.id}
                              className="flex justify-center"
                            >
                              <div className="bg-muted px-4 py-2 rounded-full text-sm text-muted-foreground">
                                {msg.encryptedContent}
                              </div>
                            </div>
                          )
                        }

                        return (
                          <div
                            key={msg.id}
                            id={`message-${msg.id}`}
                            className={cn(
                              'flex gap-3 group',
                              isOwn && 'flex-row-reverse'
                            )}
                          >
                            {!isOwn && (
                              <Avatar className="h-8 w-8 mt-1">
                                {msg.avatarPath && <AvatarImage src={getAvatarUrl(msg.avatarPath)} />}
                                <AvatarFallback className="text-xs bg-secondary">
                                  {msg.senderName ? getInitials(msg.senderName) : 'U'}
                                </AvatarFallback>
                              </Avatar>
                            )}
                            <div
                              className={cn(
                                'max-w-[70%] space-y-1',
                                isOwn && 'items-end flex flex-col'
                              )}
                            >
                              {!isOwn && msg.senderName && (
                                <span className="text-xs text-muted-foreground ml-1">
                                  {msg.senderName}
                                </span>
                              )}
                              <div
                                className={cn(
                                  'px-4 py-2.5 rounded-2xl relative shadow-sm',
                                  isOwn
                                    ? 'bg-primary text-primary-foreground rounded-br-md'
                                    : 'bg-muted rounded-bl-md'
                                )}
                              >
                                <div className="space-y-2">
                                  {msg.attachments && msg.attachments.length > 0 ? (
                                    msg.attachments.map((at, idx) => {
                                      const fileName = at.fileName || 'File'
                                      const mimeType = at.mimeType || ''
                                      const id = at.id || `at-${idx}`

                                      const isImage = mimeType.startsWith('image/')
                                      // Fix properly: Use direct static file URL instead from wwwroot/uploads
                                      const baseServerUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api').replace(/\/api\/?$/, '')
                                      const urlFilePath = (at.encryptedFilePath || '').replace(/\\/g, '/').replace(/^\//, '')
                                      const url = urlFilePath ? `${baseServerUrl}/${urlFilePath}` : '#'
                                      
                                      if (isImage) {
                                        return (
                                          <div key={id} className="rounded-lg overflow-hidden border border-white/10">
                                            <img 
                                              src={url} 
                                              alt={fileName} 
                                              className="max-w-full max-h-60 object-contain cursor-pointer transition-transform hover:scale-[1.02]" 
                                              onClick={() => window.open(url, '_blank')}
                                            />
                                          </div>
                                        )
                                      }
                                      return (
                                        <div key={id} className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/10 dark:hover:bg-white/10 transition-colors">
                                          <Paperclip className="h-4 w-4 shrink-0 text-primary" />
                                          <a 
                                            href={url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium hover:underline underline-offset-2 truncate max-w-50 text-foreground"
                                          >
                                            {fileName}
                                          </a>
                                        </div>
                                      )
                                    })
                                  ) : null}
                                  {msg.stickerUrl ? (
                                    <img 
                                      src={msg.stickerUrl} 
                                      alt="sticker" 
                                      className="w-32 h-32 object-contain" 
                                      loading="lazy"
                                      decoding="async"
                                    />
                                  ) : msg.messageType === 'Reminder' ? (
                                    <div className="bg-primary/5 p-3 rounded-xl border-l-4 border-primary space-y-2">
                                      <p className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-2">
                                        <Phone className="h-3 w-3" />
                                        Nhắc nhở
                                      </p>
                                      <p className="text-sm italic">{msg.encryptedContent}</p>
                                    </div>
                                  ) : msg.encryptedContent && msg.encryptedContent !== '[Attachment]' && (
                                    <p className="text-sm whitespace-pre-wrap wrap-break-word">
                                      {msg.encryptedContent}
                                    </p>
                                  )}
                                  {msg.isPinned && (
                                    <div className="flex items-center gap-1 mt-1 opacity-60">
                                      <Hash className="h-3 w-3 text-primary" />
                                      <span className="text-[10px] font-medium">Đã ghim</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div
                                className={cn(
                                  'flex items-center gap-2 px-1',
                                  isOwn && 'justify-end'
                                )}
                              >
                                <span className="text-[10px] text-muted-foreground">
                                  {formatMessageTime(msg.createdAt)}
                                </span>
                                {isOwn && (
                                  <div className="flex ml-0.5">
                                    {msg.readBy && msg.readBy.length > 0 ? (
                                      <CheckCheck className="h-2.5 w-2.5 text-primary" />
                                    ) : isConnected ? (
                                      <CheckCheck className="h-2.5 w-2.5 text-muted-foreground/30" />
                                    ) : (
                                      <Check className="h-2.5 w-2.5 text-muted-foreground/30" />
                                    )}
                                  </div>
                                )}
                                 {/* Action buttons on hover */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button variant="ghost" size="icon" className="h-6 w-6">
                                        <MoreVertical className="h-3 w-3" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align={isOwn ? 'end' : 'start'} className="z-[9999]">
                                      <DropdownMenuItem onClick={() => setReplyingTo(msg)}>
                                        <Reply className="mr-2 h-4 w-4" />
                                        Trả lời
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={async () => {
                                        if (msg.isPinned) {
                                          if (confirm('Bạn có muốn bỏ ghim tin nhắn này không?')) {
                                            togglePinMessage(msg.id).catch(() => toast.error('Lỗi khi bỏ ghim'));
                                          }
                                        } else {
                                          togglePinMessage(msg.id).catch(() => toast.error('Lỗi khi ghim'));
                                        }
                                      }}>
                                        <Hash className="mr-2 h-4 w-4" />
                                        {msg.isPinned ? 'Bỏ Ghim' : 'Ghim tin nhắn'}
                                      </DropdownMenuItem>
                                      <DropdownMenuItem onClick={() => {
                                        sendReminder(conversation.id, `Nhắc: ${msg.encryptedContent.substring(0, 30)}...`, new Date(Date.now() + 3600000).toISOString())
                                        toast.success('Đã đặt nhắc nhở sau 1 giờ')
                                      }}>
                                        <Phone className="mr-2 h-4 w-4" />
                                        Nhắc tôi (1 giờ)
                                      </DropdownMenuItem>
                                      {isOwn && (
                                        <>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem className="text-destructive">
                                            <Trash className="mr-2 h-4 w-4" />
                                            Xoá tin nhắn
                                          </DropdownMenuItem>
                                        </>
                                      )}
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                
                {/* Typing indicators */}
                {typingUsers.filter(t => t.conversationId === conversation?.id && t.userId !== user?.id).length > 0 && (
                  <div className="flex items-center gap-2 mt-2 px-2 animate-pulse">
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.3s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce [animation-delay:-0.15s]" />
                      <span className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" />
                    </div>
                    <span className="text-[10px] text-muted-foreground font-medium italic">
                      {typingUsers.filter(t => t.conversationId === conversation?.id && t.userId !== user?.id).map(t => t.userName).join(', ')} đang nhắn...
                    </span>
                  </div>
                )}

                <div ref={scrollRef} />
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* Reply preview */}
      {replyingTo && (
        <div className="px-4 py-2 bg-muted/50 border-t flex items-center gap-3">
          <Reply className="h-4 w-4 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">
              Đang trả lời {replyingTo.senderName || 'tin nhắn'}
            </p>
            <p className="text-sm truncate text-muted-foreground/80">{replyingTo.encryptedContent}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setReplyingTo(null)}
            className="h-8 w-8 text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4 rotate-45" />
          </Button>
        </div>
      )}

      {/* Input area */}
      <div className="p-4 border-t bg-card relative z-10">
        <div className="flex items-center gap-2">
          <input
            type="file"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          <input
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            ref={imageInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => fileInputRef.current?.click()}>
                  <Paperclip className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Đính kèm tệp</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Gửi hình ảnh</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Input
            placeholder="Nhập tin nhắn..."
            value={newMessage}
            onChange={(e) => {
              setNewMessage(e.target.value)
              if (conversation) sendTyping(conversation.id)
            }}
            onKeyDown={handleKeyPress}
            className={cn("flex-1", !isConnected && "border-yellow-500/50 bg-yellow-500/5 focus-visible:ring-yellow-500/20")}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0 shadow-xl border-sidebar-border" align="end">
              <Tabs defaultValue="emojis">
                <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-auto p-0 px-2">
                  <TabsTrigger value="emojis" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary py-2 text-xs">Emojis</TabsTrigger>
                  <TabsTrigger value="stickers" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary py-2 text-xs">Stickers</TabsTrigger>
                </TabsList>
                <TabsContent value="emojis" className="p-2 mt-0">
                  <div className="grid grid-cols-8 gap-1">
                    {['😊', '😂', '❤️', '👍', '🔥', '🎉', '😢', '😮', '😡', '🤔', '👏', '🙏', '💯', '✨', '🙌', '✅'].map(
                      (emoji) => (
                        <Button
                          key={emoji}
                          variant="ghost"
                          size="sm"
                          className="text-lg h-9 w-9 p-0 hover:bg-muted"
                          onClick={() => setNewMessage((prev) => prev + emoji)}
                        >
                          {emoji}
                        </Button>
                      )
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="stickers" className="p-2 mt-0">
                  <div className="grid grid-cols-4 gap-2 max-h-48 overflow-y-auto pr-1">
                    {[
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f600/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f60d/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f602/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f618/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f947/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f389/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f525/512.webp',
                      'https://fonts.gstatic.com/s/e/notoemoji/latest/1f44d/512.webp',
                    ].map((url, idx) => (
                      <div 
                        key={idx} 
                        className="aspect-square flex items-center justify-center p-2 rounded-lg hover:bg-muted cursor-pointer transition-transform active:scale-95 border"
                        onClick={() => {
                          if (conversation) sendSticker(conversation.id, url)
                          toast.success('Đã gửi nhãn dán!')
                        }}
                      >
                        <img src={url} alt="sticker" className="w-full h-full object-contain" loading="lazy" />
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </PopoverContent>
          </Popover>

          <Button
            onClick={handleSendMessage}
            disabled={!newMessage.trim() || isSending}
            size="icon"
            className="shrink-0 shadow-lg shadow-primary/20"
          >
            <Send className="h-5 w-5" />
          </Button>
        </div>
        {!isConnected && (
          <p className="text-[10px] text-yellow-500 mt-2 text-center animate-pulse font-medium">
            Mất kết nối. Tin nhắn sẽ được gửi khi có kết nối lại.
          </p>
        )}
      </div>
    </div>
  )
}
