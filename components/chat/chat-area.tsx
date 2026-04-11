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
  Calendar as CalendarIcon,
  X
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
import { CallLobby } from '@/components/chat/call-lobby'

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

// Gom nhóm tin nhắn hệ thống (Pin/Unpin) kiểu Zalo
function SystemMessageGroup({ messages, onScrollTo }: { messages: Message[], onScrollTo: (id: number) => void }) {
  const [isExpanded, setIsExpanded] = useState(false);
  if (messages.length === 0) return null;

  const latest = messages[messages.length - 1];
  const previous = messages.slice(0, -1);

  return (
    <div className="flex flex-col items-center my-4 space-y-2">
      {isExpanded && previous.map(m => (
        <div key={m.id} className="bg-muted/30 px-4 py-1.5 rounded-full text-[10px] text-muted-foreground border border-black/5 opacity-60 animate-in fade-in slide-in-from-top-1">
           <Pin className="inline h-3 w-3 mr-2 opacity-50" />
           {m.encryptedContent}
           {m.parentMessageId && (
             <button onClick={() => onScrollTo(m.parentMessageId!)} className="ml-2 text-primary hover:underline font-black uppercase text-[9px]">Xem</button>
           )}
        </div>
      ))}
      
      {messages.length > 1 && (
        <button 
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-[10px] font-black uppercase tracking-widest text-primary/60 hover:text-primary transition-colors bg-muted/20 px-3 py-1 rounded-full border border-primary/5"
        >
          {isExpanded ? 'Thu gọn cập nhật' : `Xem thêm ${messages.length - 1} cập nhật trước`}
        </button>
      )}

      <div className="bg-muted/40 px-5 py-2 rounded-full text-[11px] text-muted-foreground flex items-center gap-3 border border-primary/10 shadow-sm font-medium animate-in zoom-in-95 duration-300">
        <Pin className={cn("h-3.5 w-3.5", latest.encryptedContent.includes('bỏ ghim') ? "text-destructive" : "text-primary")} />
        <span>{latest.encryptedContent}</span>
        {latest.parentMessageId && (
          <button 
            onClick={() => onScrollTo(latest.parentMessageId!)}
            className="ml-1 text-primary font-black hover:underline uppercase text-[10px] bg-primary/5 px-2 py-0.5 rounded"
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
  const { isConnected, sendMessage, lastMessage, markAsRead, sendTyping, typingUsers, togglePinMessage, lastDeletedMessage, pinnedMessages, activeMeeting } = useSignalR()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isPinnedListExpanded, setIsPinnedListExpanded] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showLobby, setShowLobby] = useState<{ meetingId: any, type: 'voice' | 'video', title: string } | null>(null)
  
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
      const title = `${type === 'voice' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} - ${conversation.name}`
      const resp = await meetingsApi.startMeeting(token, conversation.id, title, [], type)
      if (resp && (resp.id || resp.meetingId)) {
        setShowLobby({ meetingId: resp.id || resp.meetingId, type, title })
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
      const updatedMessages = await conversationsApi.getMessages(token, conversation.id)
      setMessages(updatedMessages.map((m: any) => ({
        ...m,
        id: m.id || m.Id,
        conversationId: m.conversationId || conversation.id,
        isPinned: m.isPinned || m.IsPinned,
        encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message || "",
      })))
    } catch (error) { toast.error('Thất bại.') }
  }

  useEffect(() => {
    const loadMessages = async () => {
      if (!conversation || !token) return
      try {
        const response: any = await conversationsApi.getMessages(token, conversation.id)
        const data = Array.isArray(response) ? response : (response.items || [])
        const mapped = data.map((m: any) => ({
          ...m,
          id: m.id || m.Id,
          conversationId: m.conversationId || conversation.id,
          senderId: m.senderId || m.SenderId,
          encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message || "",
          createdAt: m.createdAt || m.CreatedAt || new Date().toISOString(),
          isPinned: m.isPinned || m.IsPinned,
          attachments: m.attachments || m.Attachments || [],
          parentMessageId: m.parentMessageId || m.ParentMessageId
        }))
        setMessages(mapped.sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
        markAsRead(conversation.id)
      } catch (e) { console.error(e) }
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
            attachments: lastMessage.attachments || [],
            isPinned: lastMessage.isPinned,
            parentMessageId: lastMessage.parentMessageId
          }];
       });
       markAsRead(conversation.id);
    }
  }, [lastMessage, conversation?.id])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation) return
    try {
      await sendMessage(conversation.id, newMessage, '')
      setNewMessage('')
      setReplyingTo(null)
    } catch (e) { toast.error('Gửi thất bại') }
  }

  // Chia nhóm tin nhắn (Text/Attachment vs System)
  const messageGroups = useMemo(() => {
    const groups: any[] = [];
    let currentSystemGroup: Message[] = [];

    messages.forEach(m => {
      if (m.messageType === 'System' && (m.encryptedContent.includes('ghim') || m.encryptedContent.includes('bỏ ghim'))) {
        currentSystemGroup.push(m);
      } else {
        if (currentSystemGroup.length > 0) {
          groups.push({ type: 'system-group', messages: [...currentSystemGroup] });
          currentSystemGroup = [];
        }
        groups.push({ type: 'message', data: m });
      }
    });

    if (currentSystemGroup.length > 0) {
      groups.push({ type: 'system-group', messages: [...currentSystemGroup] });
    }

    return groups;
  }, [messages]);

  if (!conversation) return null

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
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5">
               <div className="h-1.5 w-1.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" />
               {conversation.type === 'Group' ? 'Hội nhóm' : 'Liên lạc'}
            </p>
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
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-primary" onClick={() => onToggleSearch?.()}>
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
              <DropdownMenuContent align="end" className="w-56 p-1 rounded-2xl shadow-2xl">
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

      {/* Pinned Messages - Zalo Style with Toggle and Fast Unpin */}
      {latestPin && (
         <div className="z-20 bg-background/95 backdrop-blur-md border-b flex items-center transition-all duration-300 border-l-4 border-l-primary h-12 shadow-sm relative animate-in slide-in-from-top-1 px-4 gap-3 shrink-0 group">
             <div className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer" onClick={() => scrollToMessage(latestPin.id)}>
                <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
                <div className="min-w-0">
                   <p className="text-[9px] font-black uppercase text-primary tracking-tighter opacity-70">
                      Tin nhắn đã ghim {pinnedList.length > 1 && `(+${pinnedList.length - 1})`}
                   </p>
                   <p className="text-xs truncate opacity-90 font-bold">
                       {latestPin.senderName}: {latestPin.encryptedContent}
                   </p>
                </div>
             </div>
             
             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <TooltipProvider>
                   <Tooltip>
                      <TooltipTrigger asChild>
                         <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); togglePinMessage(latestPin.id); }}>
                            <PinOff className="h-3.5 w-3.5" />
                         </Button>
                      </TooltipTrigger>
                      <TooltipContent>Bỏ ghim nhanh</TooltipContent>
                   </Tooltip>
                </TooltipProvider>

                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}>
                   <ChevronDown className={cn("h-4 w-4 transition-transform", isPinnedListExpanded && "rotate-180")} />
                </Button>
             </div>

             {isPinnedListExpanded && pinnedList.length > 1 && (
               <div className="absolute top-12 left-0 right-0 bg-background border-b shadow-xl p-2 z-10 animate-in slide-in-from-top-2">
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                     {pinnedList.slice(0, -1).reverse().map(p => (
                       <div key={p.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 group/item cursor-pointer" onClick={() => { scrollToMessage(p.id); setIsPinnedListExpanded(false); }}>
                          <p className="text-xs truncate flex-1 pr-4">
                             <span className="font-bold">{p.senderName}:</span> {p.encryptedContent}
                          </p>
                          <Button variant="ghost" size="icon" className="h-7 w-7 opacity-0 group-hover/item:opacity-100 text-destructive" onClick={(e) => { e.stopPropagation(); togglePinMessage(p.id); }}>
                             <X className="h-3 w-3" />
                          </Button>
                       </div>
                     ))}
                  </div>
               </div>
             )}
         </div>
      )}

      {/* Active Meeting Banner */}
      {activeMeeting && activeMeeting.conversationId === conversation.id && (
        <div className="z-20 bg-primary/10 border-b px-4 py-2.5 flex items-center justify-between animate-in slide-in-from-top-1">
           <div className="flex items-center gap-3">
              <VideoIcon className="h-5 w-5 text-primary animate-pulse" />
              <div className="min-w-0">
                 <p className="text-[10px] font-black uppercase tracking-widest text-primary">Cuộc họp đang diễn ra</p>
                 <p className="text-xs font-bold truncate opacity-80">{activeMeeting.title}</p>
              </div>
           </div>
           <Button 
            size="sm" 
            className="rounded-full px-5 h-8 font-black uppercase text-[10px] tracking-widest shadow-lg shadow-primary/20"
            onClick={() => setShowLobby({ meetingId: activeMeeting.meetingId, type: (activeMeeting.callType as any) || 'video', title: activeMeeting.title })}
           >
              Tham gia ngay
           </Button>
        </div>
      )}

      {/* Main Chat Area */}
      <div className="flex-1 overflow-hidden relative bg-muted/5">
        <ScrollArea className="h-full">
           <div className="p-4 flex flex-col justify-end min-h-full space-y-4 pb-10">
              {messageGroups.map((group, idx) => {
                if (group.type === 'system-group') {
                  return <SystemMessageGroup key={`sys-${idx}`} messages={group.messages} onScrollTo={scrollToMessage} />;
                }
                const m = group.data;
                return (
                  <div key={m.id} id={`message-${m.id}`} className={cn("flex gap-3 animate-in slide-in-from-bottom-2", m.senderId === user?.id ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn("max-w-[75%] space-y-1", m.senderId === user?.id ? "items-end" : "items-start")}>
                         {! (m.senderId === user?.id) && <p className="text-[10px] font-black uppercase opacity-40 ml-1">{m.senderName}</p>}
                         <div className={cn("px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words border relative group/msg", m.senderId === user?.id ? "bg-primary text-primary-foreground border-transparent" : "bg-card")}>
                            {m.attachments && m.attachments.length > 0 && (
                              <div className="mb-2 space-y-1">
                                 {m.attachments.map((a: any, i: number) => (
                                   <a key={i} href={getAvatarUrl(a.filePath)} target="_blank" className="flex items-center gap-2 p-2 bg-black/5 rounded-lg border border-black/5 hover:bg-black/10 transition-colors">
                                      <FileText className="h-4 w-4" />
                                      <span className="text-xs font-bold truncate">{a.fileName}</span>
                                   </a>
                                 ))}
                              </div>
                            )}
                            <p className="font-medium leading-relaxed">{m.encryptedContent}</p>
                            
                            {/* Nút Pin nhanh bên cạnh tin nhắn */}
                            <button 
                              onClick={() => togglePinMessage(m.id)}
                              className={cn(
                                "absolute top-0 opacity-0 group-hover/msg:opacity-100 transition-opacity p-1.5 rounded-full bg-background border shadow-sm hover:scale-110",
                                isOwn ? "-left-10" : "-right-10",
                                m.isPinned ? "text-primary border-primary/20" : "text-muted-foreground"
                              )}
                            >
                               {m.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                            </button>
                         </div>
                         <span className="text-[9px] opacity-20 font-black px-1 uppercase tracking-widest">{formatMessageTime(m.createdAt)}</span>
                      </div>
                  </div>
                )
              })}
              <div ref={messagesEndRef} />
           </div>
        </ScrollArea>
      </div>

      {/* Input Section */}
      <div className="bg-card border-t pt-3 pb-5 px-5 space-y-4 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] shrink-0 z-40">
        <div className="flex items-center gap-2 opacity-60">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl hover:bg-primary/10 hover:text-primary transition-all" onClick={() => fileInputRef.current?.click()}><Paperclip className="h-5 w-5" /></Button>
        </div>

        <div className="flex items-end gap-3 bg-muted/30 p-2 rounded-2xl border border-primary/5 focus-within:border-primary/20 focus-within:bg-background transition-all">
            <textarea
              value={newMessage}
              onChange={(e) => {
                setNewMessage(e.target.value)
                if(conversation) sendTyping(conversation.id)
              }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2.5 px-3 resize-none max-h-40 min-h-[45px] scrollbar-none outline-none font-medium leading-relaxed"
              rows={1}
            />
            <div className="flex items-center gap-2 pb-1.5 pr-1.5">
               <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl text-muted-foreground hover:text-primary"><Smile className="h-5 w-5" /></Button>
               {!newMessage.trim() ? (
                   <Button variant="ghost" size="icon" className="h-10 w-10 text-primary/30 hover:text-primary"><ThumbsUp className="h-6 w-6" /></Button>
               ) : (
                   <Button onClick={handleSendMessage} size="icon" className="h-10 w-10 bg-primary text-primary-foreground rounded-xl shadow-lg shadow-primary/30"><Send className="h-5 w-5" /></Button>
               )}
            </div>
        </div>
      </div>

      {showLobby && (
        <CallLobby 
          meetingId={showLobby.meetingId}
          type={showLobby.type}
          title={showLobby.title}
          conversationId={conversation.id}
          onJoin={(mic, cam) => {
            router.push(`/call/${showLobby.meetingId}?type=${showLobby.type}&mic=${mic}&cam=${cam}`)
            setShowLobby(null)
          }}
          onCancel={() => setShowLobby(null)}
        />
      )}

      <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
      <input type="file" accept="image/*" ref={imageInputRef} className="hidden" onChange={handleFileUpload} />
    </div>
  )
}
