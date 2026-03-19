'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'
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
}

import { attachmentsApi, meetingsApi } from '@/lib/api'

interface ChatAreaProps {
  conversation: Conversation | null
  onBack?: () => void
  onShowMembers?: () => void
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
  isMobile = false,
  className,
}: ChatAreaProps) {
  const router = useRouter()
  const { token, user } = useAuth()
  const { sendMessage, messages: realtimeMessages, isConnected } = useSignalR()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [pendingQueue, setPendingQueue] = useState<{ content: string, replyTo?: number }[]>([])
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !conversation || !token) return

    try {
      toast.info('Uploading file...')
      await attachmentsApi.upload(token, file, conversation.id)
      toast.success('File uploaded successfully!')
      // Optionally trigger a refresh or let SignalR handle the new message event
    } catch (error) {
      console.error('File upload failed:', error)
      toast.error('Failed to upload file.')
    }
  }

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!conversation || !token || !user) return
    try {
      const resp = await meetingsApi.startMeeting(token, conversation.id, `${type.toUpperCase()} Call - ${conversation.name}`, [], type)
      toast.success(`Started ${type} call.`)
      // Navigate to call page with the meetingId
      if (resp && resp.id) {
        router.push(`/call/${resp.id}?type=${type}`)
      } else if (resp && resp.meetingId) {
        router.push(`/call/${resp.meetingId}?type=${type}`)
      }
    } catch (error) {
      console.error(`Failed to start ${type} call:`, error)
      toast.error(`Failed to start ${type} call.`)
    }
  }

  // Load messages when conversation changes
  useEffect(() => {
    const loadMessages = async () => {
      if (!token || !conversation) return
      setIsLoading(true)
      try {
        const data = await conversationsApi.getMessages(token, conversation.id)
        // Map data to ensure camelCase properties are set if backend sends PascalCase
        const mappedMessages: Message[] = data.map((d: any) => ({
          id: d.id ?? d.Id,
          senderId: d.senderId ?? d.SenderId,
          encryptedContent: d.encryptedContent ?? d.EncryptedContent,
          iv: d.iv ?? d.Iv,
          createdAt: d.createdAt ?? d.CreatedAt,
          messageType: d.messageType ?? d.MessageType,
          senderName: d.senderName ?? d.SenderName,
          avatarPath: d.avatarPath ?? d.AvatarPath,
          attachments: d.attachments ?? d.Attachments,
        }))
        setMessages(mappedMessages)
      } catch (error) {
        console.error('Failed to load messages:', error)
      } finally {
        setIsLoading(false)
      }
    }
    loadMessages()
  }, [token, conversation])

  // Handle realtime messages
  useEffect(() => {
    if (!conversation) return
    const conversationMessages = realtimeMessages.filter(
      (m) => m.conversationId === conversation.id
    )
    if (conversationMessages.length > 0) {
      // Append new realtime messages
      const existingIds = new Set(messages.map((m) => m.id))
      const newMsgs = conversationMessages
        .filter((m) => !existingIds.has(m.id))
        .map((m) => ({
          id: m.id,
          senderId: 0,
          encryptedContent: m.message,
          iv: m.iv ?? '',
          createdAt: (m.time instanceof Date ? m.time : new Date(m.time)).toISOString(),
          messageType: m.messageType || (m.isSystem ? 'Announcement' : 'Text'),
          senderName: m.sender,
          avatarPath: undefined,
          attachments: m.attachments || [],
        }))
      setMessages(prev => {
        const existingIds = new Set(prev.map(m => m.id))
        const filtered = newMsgs.filter(m => !existingIds.has(m.id))
        return [...prev, ...filtered]
      })
    }
  }, [realtimeMessages, conversation])

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
            encryptedContent: d.encryptedContent ?? d.EncryptedContent,
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

  const formatMessageTime = (dateString: string) => {
    const date = new Date(dateString)
    return isNaN(date.getTime()) ? '...' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  const formatMessageDate = (dateString: string) => {
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return 'Unknown Date'
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return 'Today'
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday'
    }
    return date.toLocaleDateString([], {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    })
  }

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
        <h2 className="text-xl font-medium">Select a conversation</h2>
        <p className="text-sm mt-1">Choose a chat from the sidebar to start messaging</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col bg-background overflow-hidden min-h-0', className)}>
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b bg-card">
        <div className="flex items-center gap-3">
          {isMobile && onBack && (
            <Button variant="ghost" size="icon" onClick={onBack} className="mr-1">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          )}
          <Avatar className="h-10 w-10">
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
              {conversation.type === 'Group' ? 'Group chat' : 'Direct message'}
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
              <TooltipContent>Voice call</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => handleStartCall('video')}>
                  <Video className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Video call</TooltipContent>
            </Tooltip>

            {conversation.type === 'Group' && onShowMembers && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" onClick={onShowMembers}>
                    <Users className="h-5 w-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>View members</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={() => toast('Tính năng tùy chọn nhóm đang được phát triển')}>
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>More options</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 min-h-0 relative">
        <ScrollArea className="h-full w-full">
          <div className="p-4">
            {isLoading ? (
              <div className="flex items-center justify-center h-full">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
                <MessageSquare className="h-12 w-12 mb-3 opacity-20" />
                <p className="text-sm">No messages yet</p>
                <p className="text-xs mt-1">Start the conversation!</p>
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
                        const isOwn = msg.senderId === user?.id
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
                            className={cn(
                              'flex gap-3 group',
                              isOwn && 'flex-row-reverse'
                            )}
                          >
                            {!isOwn && (
                              <Avatar className="h-8 w-8 mt-1">
                                {msg.avatarPath && <AvatarImage src={msg.avatarPath} />}
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
                                      const fileName = at.fileName || at.FileName || 'File'
                                      const mimeType = at.mimeType || at.MimeType || ''
                                      const filePath = at.encryptedFilePath || at.EncryptedFilePath || ''
                                      const id = at.id || at.Id || `at-${idx}`

                                      const isImage = mimeType.startsWith('image/')
                                      const baseUrl = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/api$/, '').replace(/\/$/, '')
                                      const url = filePath.startsWith('http') 
                                        ? filePath 
                                        : `${baseUrl}/${filePath.replace(/^\//, '')}`
                                      
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
                                        <div key={id} className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10 hover:bg-white/10 transition-colors">
                                          <Paperclip className="h-4 w-4 shrink-0 text-blue-400" />
                                          <a 
                                            href={url} 
                                            target="_blank" 
                                            rel="noopener noreferrer"
                                            className="text-sm font-medium hover:underline underline-offset-2 truncate max-w-[200px] text-white"
                                          >
                                            {fileName}
                                          </a>
                                        </div>
                                      )
                                    })
                                  ) : null}
                                  {msg.encryptedContent && msg.encryptedContent !== '[Attachment]' && (
                                    <p className="text-sm whitespace-pre-wrap break-words">
                                      {msg.encryptedContent}
                                    </p>
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
                                {/* Action buttons on hover */}
                                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6"
                                    onClick={() => setReplyingTo(msg)}
                                  >
                                    <Reply className="h-3 w-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
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
              Replying to {replyingTo.senderName || 'message'}
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
              <TooltipContent>Attach file</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0" onClick={() => imageInputRef.current?.click()}>
                  <ImageIcon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Send image</TooltipContent>
            </Tooltip>
          </TooltipProvider>

          <Input
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={handleKeyPress}
            className={cn("flex-1", !isConnected && "border-yellow-500/50 bg-yellow-500/5 focus-visible:ring-yellow-500/20")}
          />

          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0">
                <Smile className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 shadow-xl border-sidebar-border" align="end">
              <div className="grid grid-cols-6 gap-1">
                {['😊', '😂', '❤️', '👍', '🔥', '🎉', '😢', '😮', '😡', '🤔', '👏', '🙏'].map(
                  (emoji) => (
                    <Button
                      key={emoji}
                      variant="ghost"
                      size="sm"
                      className="text-lg h-8 w-8 p-0 hover:bg-muted"
                      onClick={() => setNewMessage((prev) => prev + emoji)}
                    >
                      {emoji}
                    </Button>
                  )
                )}
              </div>
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
            Connection lost. Messages will be sent when reconnected.
          </p>
        )}
      </div>
    </div>
  )
}
