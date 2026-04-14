'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { 
  cn, 
  getAvatarUrl,
  getAttachmentUrl,
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
  X,
  MessageSquare
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
import { SystemMessageGroup } from '@/components/chat/system-message-group'
import { decryptMessagePro } from '@/lib/crypto-utils'

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

// Internal component for async decryption
function DecryptedText({ 
    message, 
    user, 
    mySenderKey, 
    peerSenderKeys, 
    peerIdentityKeys, 
    identityKeys,
    initiateHandshake,
    onJoinMeeting
}: { 
    message: Message, 
    user: any, 
    mySenderKey: any, 
    peerSenderKeys: Map<number, any>, 
    peerIdentityKeys: Map<number, any>,
    identityKeys: any,
    initiateHandshake: (cid: number) => Promise<void>,
    onJoinMeeting: (meetingId: string) => void
}) {
    const [decrypted, setDecrypted] = useState<string>("⌛ [Đang giải mã...]");

    useEffect(() => {
        const decrypt = async () => {
             // System messages are not encrypted
            if (message.messageType !== 'PLAIN' && message.messageType !== 'Text' && message.messageType !== 'PLAIN_SECURE' && message.messageType) {
                if (message.messageType === 'System') {
                   setDecrypted(message.content);
                } else {
                   setDecrypted(message.encryptedContent || message.content);
                }
                return;
            }

            const senderId = message.senderId;
            const content = message.encryptedContent;
            const iv = message.iv;
            const sig = message.signature || (message as any).sig;

            if (!content || content === "[Attachment]") {
                setDecrypted("");
                return;
            }

            try {
                const isOwn = user && senderId === user.id;
                const senderKey = isOwn ? mySenderKey : peerSenderKeys.get(senderId);
                const senderIdPubKey = isOwn ? identityKeys?.publicKey : peerIdentityKeys.get(senderId);

                if (iv && sig) {
                    if (senderKey && senderIdPubKey) {
                         const result = await decryptMessagePro(content, iv, sig, senderKey, senderIdPubKey);
                         setDecrypted(result);
                    } else {
                         setDecrypted("⏳ [Mã hóa đầu cuối]");
                         if (message.conversationId) initiateHandshake(message.conversationId);
                    }
                } else {
                    // Fallback for legacy messages
                    setDecrypted(content);
                }
            } catch (e) {
                setDecrypted(content || "[Lỗi giải mã]");
            }
        };

        decrypt();
    }, [message.id, message.encryptedContent, mySenderKey, peerSenderKeys?.size, peerIdentityKeys?.size]);

    if (decrypted.includes('[MEETING_GUID:')) {
        return (
            <div className="bg-primary/10 rounded-xl p-4 border border-primary/20 flex flex-col gap-3">
               <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/20 flex items-center justify-center">
                     <VideoIcon className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                     <p className="font-black text-xs text-primary uppercase tracking-widest">Cuộc họp video</p>
                     <p className="text-[11px] font-bold opacity-70">{decrypted.split('\n')[0].replace('📹 ', '')}</p>
                  </div>
               </div>
               <Button 
                  size="sm" 
                  className="w-full rounded-lg h-8 font-black uppercase text-[10px] tracking-widest bg-primary hover:bg-primary/80"
                  onClick={() => {
                     const match = decrypted.match(/\[MEETING_GUID:([^\]]+)\]/);
                     if (match) onJoinMeeting(match[1]);
                  }}
               >
                  Tham gia ngay
               </Button>
            </div>
        );
    }

    return <p className="font-medium leading-relaxed">{decrypted}</p>;
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
  const { 
    isConnected, 
    sendMessage, 
    lastMessage, 
    markAsRead, 
    sendTyping, 
    typingUsers, 
    togglePinMessage, 
    lastDeletedMessage, 
    pinnedMessages, 
    activeMeeting, 
    initiateE2EEHandshake,
    hideMessageForMe,
    sendReminder
  } = useSignalR()

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

  const scrollToMessage = useCallback((msgId: any) => {
    const id = typeof msgId === 'string' ? msgId : msgId.toString();
    
    // Thêm delay nhỏ để chắc chắn React đã render xong nếu mới vừa nhận tin nhắn
    setTimeout(() => {
      const el = document.getElementById(`message-${id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-primary/20')
        setTimeout(() => el.classList.remove('bg-primary/20'), 2000)
      } else {
        console.warn(`Target message-${id} not found in DOM`);
        toast.error('Không tìm thấy tin nhắn hoặc tin nhắn ở quá xa lịch sử');
      }
    }, 100);
  }, [])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).scrollToMsg = scrollToMessage
    }
  }, [scrollToMessage])

  // Sync Pinned State from SignalR
  useEffect(() => {
    if (pinnedMessages && conversation && pinnedMessages.conversationId === conversation.id) {
      setMessages(prev => prev.map(m => 
        m.id === pinnedMessages.messageId ? { ...m, isPinned: pinnedMessages.isPinned } : m
      ));
    }
  }, [pinnedMessages, conversation?.id]);

  // Sync Deleted State from SignalR
  useEffect(() => {
    if (lastDeletedMessage && conversation && lastDeletedMessage.conversationId === conversation.id) {
      setMessages(prev => prev.filter(m => m.id !== lastDeletedMessage.messageId));
    }
  }, [lastDeletedMessage, conversation?.id]);

  useEffect(() => {
    if (conversation?.id && typeof initiateE2EEHandshake === 'function') {
       initiateE2EEHandshake(conversation.id).catch(e => console.error("E2EE error", e));
    }
  }, [conversation?.id, initiateE2EEHandshake]);


  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!conversation || !token || !user) return
    
    // Nếu có cuộc họp đang diễn ra trong nhóm, dùng lại mã đó
    if (activeMeeting && activeMeeting.conversationId === conversation.id) {
       setShowLobby({ meetingId: activeMeeting.meetingId, type, title: activeMeeting.title })
       return
    }

    try {
      const title = `${type === 'voice' ? 'Cuộc gọi thoại' : 'Cuộc gọi video'} - ${conversation.name}`
      const resp = await meetingsApi.startMeeting(token, conversation.id, title, [], type)
      if (resp && (resp.meetingGuid || resp.id)) {
        const mGuid = resp.meetingGuid || resp.id;
        // Gửi tin nhắn thông báo vào nhóm để lưu lịch sử và cho phép người khác tham gia
        sendMessage(conversation.id, `📹 Đã bắt đầu cuộc họp: ${title}\n[MEETING_GUID:${mGuid}]`, 'Text');
        setShowLobby({ meetingId: mGuid, type, title })
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
      const mappedHistory = updatedMessages.map((m: any) => ({
        ...m,
        id: m.id || m.Id,
        conversationId: m.conversationId || conversation.id,
        isPinned: m.isPinned || m.IsPinned,
        encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message || "",
      }))
      setMessages(mappedHistory)
    } catch (error) { toast.error('Thất bại.') }
  }

  useEffect(() => {
    const loadMessages = async () => {
      if (!conversation || !token) return
      try {
        const response: any = await conversationsApi.getMessages(token, conversation.id)
        const data = Array.isArray(response) ? response : (response.items || [])
        const mapped = data.map((m: any) => {
          return {
            ...m,
            id: m.id || m.Id,
            conversationId: m.conversationId || conversation.id,
            senderId: m.senderId || m.SenderId,
            encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message || "",
            createdAt: m.createdAt || m.CreatedAt || new Date().toISOString(),
            isPinned: m.isPinned || m.IsPinned,
            attachments: m.attachments || m.Attachments || [],
            parentMessageId: m.parentMessageId || m.ParentMessageId
          }
        })
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
          
          // Ensure attachments is always an array
          let attachments = lastMessage.attachments || [];
          if (typeof attachments === 'string') {
            try { attachments = JSON.parse(attachments); } catch(e) { attachments = []; }
          }

          return [...prev, {
            id: lastMessage.id,
            conversationId: lastMessage.conversationId,
            senderId: lastMessage.senderId,
            senderName: lastMessage.senderName || lastMessage.sender,
            encryptedContent: lastMessage.content || lastMessage.message || "",
            messageType: lastMessage.messageType || 'Text',
            createdAt: lastMessage.createdAt || lastMessage.time?.toISOString() || new Date().toISOString(),
            attachments: attachments,
            isPinned: lastMessage.isPinned,
            parentMessageId: lastMessage.parentMessageId
          }];
       });
       markAsRead(conversation.id);
    }
  }, [lastMessage, conversation?.id])

  // Hiển thị thông báo khi phát hiện cuộc họp đang diễn ra (dành cho người mới online lại)
  useEffect(() => {
    if (activeMeeting && conversation && activeMeeting.conversationId === conversation.id) {
       const key = `meet-notified-${activeMeeting.meetingId}`;
       if (!sessionStorage.getItem(key)) {
          toast.info(`🚀 ĐANG CÓ CUỘC HỌP: ${activeMeeting.title}`, {
            description: "Mọi người đang đợi bạn, tham gia ngay!",
            duration: 5000
          });
          sessionStorage.setItem(key, 'true');
       }
    }
  }, [activeMeeting, conversation?.id]);


  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation) return
    try {
      await sendMessage(conversation.id, newMessage, '', replyingTo?.id)
      setNewMessage('')
      setReplyingTo(null)
    } catch (e) { toast.error('Gửi thất bại') }
  }

  // Chia nhóm tin nhắn (Text/Attachment vs System)
  const messageGroups = useMemo(() => {
    const groups: any[] = [];
    let currentSystemGroup: Message[] = [];

    messages.forEach(m => {
      if ((m.messageType === 'System' || m.messageType === 'Announcement') && (m.encryptedContent.includes('ghim') || m.encryptedContent.includes('bỏ ghim'))) {
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

  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-background relative overflow-hidden">
        {/* Decorative Background Elements */}
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-primary/5 rounded-full blur-[100px] animate-pulse [animation-delay:2s]" />
        
        <div className="relative z-10 flex flex-col items-center max-w-md text-center">
           <div className="w-24 h-24 mb-8 relative">
              <div className="absolute inset-0 bg-primary/20 rounded-3xl rotate-6 blur-xl" />
              <div className="absolute inset-0 bg-primary/20 rounded-3xl -rotate-6" />
              <div className="relative h-full w-full bg-primary rounded-3xl flex items-center justify-center shadow-2xl shadow-primary/40 border border-white/20">
                 <MessageSquare className="h-10 w-10 text-white fill-white/10" />
              </div>
           </div>

           <h2 className="text-3xl font-black tracking-tight mb-4 text-foreground">
             Chào mừng đến với <span className="text-primary italic">Lumi Chat</span>
           </h2>
           <p className="text-sm text-muted-foreground leading-relaxed font-medium mb-10 opacity-70">
             Lumi Chat là không gian làm việc số tập trung, nơi bạn có thể trao đổi, họp video và quản lý dự án một cách chuyên nghiệp. 
             <br /><br />
             Hãy chọn một hội thoại bên trái để bắt đầu thảo luận hoặc tạo cuộc họp mới để kết nối với đồng nghiệp.
           </p>

           <div className="flex flex-wrap justify-center gap-4">
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-muted/30 border border-white/5 shadow-sm">
                 <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Toàn bộ đã sẵn sàng</span>
              </div>
              <div className="flex items-center gap-3 px-4 py-2 rounded-2xl bg-muted/30 border border-white/5 shadow-sm">
                 <div className="h-2 w-2 rounded-full bg-blue-500" />
                 <span className="text-[10px] font-black uppercase tracking-widest opacity-60">Vui lòng chọn hội thoại</span>
              </div>
           </div>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
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
               {conversation.type === 'GlobalMeeting' ? `ID: ${conversation.id}` : conversation.type === 'Group' ? 'Hội nhóm' : 'Liên lạc'}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1">
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
                 <DropdownMenuItem
                    className="text-destructive p-2.5 rounded-xl text-xs font-black uppercase tracking-widest gap-3 focus:bg-destructive/10 focus:text-destructive cursor-pointer"
                    onClick={async () => {
                      if (!conversation || !user) return
                      if (!confirm(`Bạn có chắc muốn rời khỏi "${conversation.name}"?`)) return
                      try {
                        await conversationsApi.leaveConversation(token!, conversation.id)
                        toast.success(`Đã rời khỏi "${conversation.name}"`)
                        if (onRefreshConversations) onRefreshConversations()
                        if (onBack) onBack()
                      } catch {
                        toast.error('Không thể rời khỏi hội thoại này')
                      }
                    }}
                  >
                    <LogOut className="h-4 w-4" /> Rời khỏi hội thoại
                 </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </header>

      {/* Pinned Messages - Zalo Style with Toggle and Fast Unpin */}
      {latestPin && (
         <div className="z-20 bg-background/95 backdrop-blur-md border-b flex items-center transition-all duration-300 border-l-4 border-l-primary h-12 shadow-sm relative animate-in slide-in-from-top-1 px-4 gap-3 shrink-0 group">
             <div className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer" onClick={() => scrollToMessage(latestPin.id)}>
                <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
                <div className="flex-1 min-w-0 pr-10">
               <p className="text-[9px] font-black uppercase text-primary/60 mb-0.5 tracking-widest flex items-center gap-2">
                  <div className="h-1 w-1 rounded-full bg-primary" /> TIN NHẮN ĐÃ GHIM
               </p>
               <div className="text-xs font-bold truncate opacity-90">
                  <span className="text-primary">{latestPin.senderName}:</span>{" "}
                  <DecryptedText 
                      message={latestPin}
                      user={user}
                      mySenderKey={(useSignalR() as any).mySenderKey}
                      peerSenderKeys={(useSignalR() as any).peerSenderKeys}
                      peerIdentityKeys={(useSignalR() as any).peerIdentityKeys}
                      identityKeys={(useSignalR() as any).identityKeys}
                      initiateHandshake={initiateE2EEHandshake}
                      onJoinMeeting={(mid) => setShowLobby({ meetingId: mid, type: 'video', title: 'Tham gia cuộc họp' })}
                  />
               </div>
            </div>
             </div>
             
             <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                 <Tooltip>
                    <TooltipTrigger asChild>
                       <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10" onClick={(e) => { e.stopPropagation(); togglePinMessage(latestPin.id); }}>
                          <PinOff className="h-3.5 w-3.5" />
                       </Button>
                    </TooltipTrigger>
                    <TooltipContent>Bỏ ghim nhanh</TooltipContent>
                 </Tooltip>

                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}>
                   <ChevronDown className={cn("h-4 w-4 transition-transform", isPinnedListExpanded && "rotate-180")} />
                </Button>
             </div>

             {isPinnedListExpanded && pinnedList.length > 1 && (
               <div className="absolute top-12 left-0 right-0 bg-background border-b shadow-xl p-2 z-10 animate-in slide-in-from-top-2">
                  <div className="max-h-48 overflow-y-auto space-y-1 pr-1">
                     {pinnedList.slice(0, -1).reverse().map(p => (
                       <div key={p.id} className="flex items-center justify-between p-2 rounded-xl hover:bg-muted/50 group/item cursor-pointer" onClick={() => { scrollToMessage(p.id); setIsPinnedListExpanded(false); }}>
                          <div className="text-xs truncate flex-1 pr-4">
                             <span className="font-bold">{p.senderName}:</span>{" "}
                             <DecryptedText 
                               message={p}
                               user={user}
                               mySenderKey={(useSignalR() as any).mySenderKey}
                               peerSenderKeys={(useSignalR() as any).peerSenderKeys}
                               peerIdentityKeys={(useSignalR() as any).peerIdentityKeys}
                               identityKeys={(useSignalR() as any).identityKeys}
                               initiateHandshake={initiateE2EEHandshake}
                               onJoinMeeting={(mid) => setShowLobby({ meetingId: mid, type: 'video', title: 'Tham gia cuộc họp' })}
                             />
                          </div>
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

      {/* Active Meeting Banner - Teams Style */}
      {activeMeeting && activeMeeting.conversationId === conversation.id && (
        <div className="z-20 bg-primary/20 backdrop-blur-xl px-4 py-2 flex items-center justify-between border-b animate-in slide-in-from-top-1 border-primary/20 shadow-[0_4px_12px_rgba(0,0,0,0.1)]">
           <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/30 flex items-center justify-center animate-pulse">
                <VideoIcon className="h-4 w-4 text-primary" />
              </div>
              <div className="min-w-0">
                 <p className="text-[9px] font-black uppercase tracking-[0.2em] text-primary/80">Cuộc họp đang diễn ra</p>
                 <p className="text-[10px] font-bold truncate opacity-90">{activeMeeting.title}</p>
              </div>
           </div>
           <div className="flex items-center gap-2">
               <div className="flex -space-x-1.5 mr-2">
                  {[1,2].map(i => (
                    <div key={i} className="h-5 w-5 rounded-full border border-background bg-muted text-[8px] flex items-center justify-center font-bold">U</div>
                  ))}
               </div>
               <Button 
                size="sm" 
                className="rounded-lg px-4 h-7 font-black uppercase text-[9px] tracking-widest bg-primary hover:bg-primary/80 shadow-lg shadow-primary/10 transition-all hover:scale-105"
                onClick={() => setShowLobby({ meetingId: activeMeeting.meetingGuid, type: (activeMeeting.callType as any) || 'video', title: activeMeeting.title })}
               >
                  Tham gia
               </Button>
           </div>
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
                const isOwn = m.senderId === user?.id;
                return (
                  <div key={m.id} id={`message-${m.id}`} className={cn("flex gap-3 animate-in slide-in-from-bottom-2", isOwn ? "flex-row-reverse" : "flex-row")}>
                      <div className={cn("max-w-[75%] space-y-1", isOwn ? "items-end" : "items-start")}>
                         {! isOwn && <p className="text-[10px] font-black uppercase opacity-40 ml-1">{m.senderName}</p>}
                         <div className={cn("px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words border relative group/msg", isOwn ? "bg-primary text-primary-foreground border-transparent" : "bg-card")}>
                            {m.attachments && m.attachments.length > 0 && (
                              <div className="mb-2 space-y-2">
                                 {m.attachments.map((a: any, i: number) => {
                                   const isImage = a.mimeType?.startsWith('image/');
                                   const url = getAttachmentUrl(a.id, token!);
                                   
                                   if (isImage) {
                                     return (
                                       <div key={i} className="relative group/img cursor-pointer max-w-sm rounded-xl overflow-hidden border shadow-sm">
                                          <img 
                                            src={url} 
                                            alt={a.fileName} 
                                            className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500"
                                            onClick={() => window.open(url, '_blank')}
                                          />
                                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                                             <Button variant="secondary" size="sm" className="rounded-full gap-2" onClick={() => window.open(url, '_blank')}>
                                                <ImageIcon className="h-3.5 w-3.5" /> Xem ảnh
                                             </Button>
                                          </div>
                                       </div>
                                     );
                                   }

                                   return (
                                     <a key={i} href={url} target="_blank" className="flex items-center gap-3 p-3 bg-black/5 hover:bg-black/10 rounded-xl border border-black/5 transition-all group/file">
                                        <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center shadow-sm">
                                           <FileText className="h-5 w-5 text-primary" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                           <p className="text-xs font-bold truncate">{a.fileName}</p>
                                           <p className="text-[10px] opacity-40 uppercase font-black">{(a.fileSize / 1024).toFixed(1)} KB • Tải về</p>
                                        </div>
                                        <Download className="h-4 w-4 opacity-0 group-hover/file:opacity-60 transition-opacity" />
                                     </a>
                                   );
                                 })}
                              </div>
                            )}

                             {m.encryptedContent?.trim() !== "[Attachment]" && m.encryptedContent?.trim() !== "" && (
                                <div className="space-y-3">
                                   <DecryptedText 
                                      message={m}
                                      user={user}
                                      mySenderKey={(useSignalR() as any).mySenderKey}
                                      peerSenderKeys={(useSignalR() as any).peerSenderKeys}
                                      peerIdentityKeys={(useSignalR() as any).peerIdentityKeys}
                                      identityKeys={(useSignalR() as any).identityKeys}
                                      initiateHandshake={initiateE2EEHandshake}
                                      onJoinMeeting={(mid) => setShowLobby({ meetingId: mid, type: 'video', title: 'Tham gia cuộc họp' })}
                                   />
                                </div>
                              )}
                            
                            {/* Nút Pin nhanh và Menu hành động */}
                             <div className={cn(
                                "absolute bottom-0 opacity-0 group-hover/msg:opacity-100 transition-opacity flex items-center gap-1",
                                isOwn ? "-left-20" : "-right-20"
                             )}>
                                <button 
                                  onClick={() => togglePinMessage(m.id)}
                                  className={cn(
                                    "p-1.5 rounded-full bg-background border shadow-sm hover:scale-110 transition-all",
                                    m.isPinned ? "text-primary border-primary/20" : "text-muted-foreground"
                                  )}
                                >
                                   {m.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
                                </button>

                                <DropdownMenu>
                                   <DropdownMenuTrigger asChild>
                                      <button className="p-1.5 rounded-full bg-background border shadow-sm hover:scale-110 transition-all text-muted-foreground">
                                         <MoreVertical className="h-3 w-3" />
                                      </button>
                                   </DropdownMenuTrigger>
                                   <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48 p-1 rounded-xl shadow-2xl">
                                      <DropdownMenuItem onClick={() => setReplyingTo(m)} className="p-2 gap-2 text-xs font-bold uppercase tracking-wider">
                                         <Reply className="h-3.5 w-3.5" /> Trả lời
                                      </DropdownMenuItem>
                                      <DropdownMenuItem 
                                        onClick={async () => {
                                           if (confirm('Chia sẻ tin nhắn này?')) {
                                              toast.success('Đã sao chép nội dung để chia sẻ');
                                              navigator.clipboard.writeText(m.encryptedContent);
                                           }
                                        }} 
                                        className="p-2 gap-2 text-xs font-bold uppercase tracking-wider"
                                      >
                                         <Send className="h-3.5 w-3.5" /> Chia sẻ
                                      </DropdownMenuItem>
                                      <DropdownMenuSeparator />
                                      <DropdownMenuItem 
                                        onClick={async () => {
                                           setMessages(prev => prev.filter(msg => msg.id !== m.id));
                                           try { await hideMessageForMe(m.id); } catch(e) {}
                                        }}
                                        className="p-2 gap-2 text-xs font-bold uppercase tracking-wider"
                                      >
                                         <X className="h-3.5 w-3.5" /> Xóa phía tôi
                                      </DropdownMenuItem>
                                      {isOwn && (
                                        <DropdownMenuItem 
                                          onClick={async () => {
                                             if (confirm('Thu hồi tin nhắn này với mọi người?')) {
                                                try {
                                                   await conversationsApi.deleteMessage(token!, m.id);
                                                   toast.success('Đã thu hồi tin nhắn');
                                                } catch (e) { toast.error('Lỗi khi thu hồi'); }
                                             }
                                          }}
                                          className="p-2 gap-2 text-xs font-bold uppercase tracking-wider text-destructive"
                                        >
                                           <Trash2 className="h-3.5 w-3.5" /> Thu hồi
                                        </DropdownMenuItem>
                                      )}
                                   </DropdownMenuContent>
                                </DropdownMenu>
                             </div>
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
      <div className="bg-card border-t pt-2 pb-5 px-5 space-y-3 shadow-[0_-8px_30px_rgba(0,0,0,0.1)] shrink-0 z-40 relative">
        {replyingTo && (
          <div className="absolute -top-[52px] left-0 right-0 bg-background/95 backdrop-blur-md border-t border-primary/20 p-2 px-6 flex items-center justify-between animate-in slide-in-from-bottom-2 shadow-2xl">
             <div className="flex items-center gap-3 border-l-2 border-primary pl-3 min-w-0">
                <Reply className="h-3 w-3 text-primary opacity-50" />
                <div className="min-w-0">
                   <p className="text-[9px] font-black uppercase text-primary tracking-tighter">Đang trả lời {replyingTo.senderName}</p>
                   <p className="text-xs truncate opacity-70 italic">{replyingTo.encryptedContent}</p>
                </div>
             </div>
             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-destructive/10 hover:text-destructive" onClick={() => setReplyingTo(null)}>
                <X className="h-3.5 w-3.5" />
             </Button>
          </div>
        )}

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
    </TooltipProvider>
  )
}
