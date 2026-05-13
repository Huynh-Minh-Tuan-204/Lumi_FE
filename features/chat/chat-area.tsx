'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react' // Triggering re-build for Search import
import { 
  cn, 
  getAvatarUrl,
  getAttachmentUrl,
  formatMessageTime
} from '@/lib/utils'
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  MoreVertical, 
  Send, 
  Smile, 
  Paperclip, 
  Image as ImageIcon, 
  Users, 
  LogOut, 
  ChevronDown, 
  Reply, 
  FileText, 
  Download, 
  Pin, 
  PinOff,
  Search,
  PhoneCall,
  Maximize2,
  ImageOff,
  AlertCircle,
  MessageSquare,
  Video as VideoIcon,
  Activity as ActivityIcon,
  X,
  ShieldAlert
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
import { useCall } from '@/hooks/use-call'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { CallLobby } from '@/features/chat/call-lobby'
import { SystemMessageGroup } from '@/features/chat/system-message-group'
import { decryptMessagePro, decryptFilePro, encryptFilePro, saveOrLoadSenderKey, saveOrLoadPeerIdentityKey, saveOrLoadPeerSenderKey, generateSenderKey, IDENTITY_KEY_ALIAS, loadKey, decryptSessionKey } from '@/lib/crypto-utils'
import { DecryptedText } from '@/features/chat/decrypted-text'
import { AttachmentImage } from '@/features/chat/attachment-image'
import { MessageItem } from '@/features/chat/message-item'


interface Message {
  id: number
  conversationId?: number
  senderId: number
  senderName?: string
  encryptedContent: string
  messageType: string
  createdAt: string
  isPinned?: boolean
  attachments?: any[]
  parentMessageId?: number
  iv?: string
  signature?: string
}

interface ChatAreaProps {
  conversation: any;
  onBack: () => void;
  onShowMembers: () => void;
  onToggleBoard: () => void;
  onToggleSearch: () => void;
  onRefreshConversations: () => void;
  isMobile?: boolean;
  className?: string;
}

function DecryptedAttachment({ 
    attachment, 
    token, 
    user,
    mySenderKey,
    mySenderKeys,
    peerSenderKeys, 
    peerIdentityKeys, 
    identityKeys,
    senderId,
    keyVersion,
    conversationId,
    myRSAKeys
}: { 
    attachment: any, 
    token: string, 
    user: any,
    mySenderKey: any,
    mySenderKeys: Map<number, any>,
    peerSenderKeys: Map<string, any>, 
    peerIdentityKeys: Map<number, any>,
    identityKeys: any,
    myRSAKeys: any,
    senderId: number,
    conversationId?: number,
    keyVersion?: number
}) {
    const [url, setUrl] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    useEffect(() => {
        let objectUrl: string | null = null;
        let cancelled = false;

        const load = async () => {
            try {
                const blob = await attachmentsApi.downloadBlob(token, attachment.id);
                if (cancelled) return;

                let iv = attachment.iv || (attachment as any).IV;
                let sig = attachment.signature || (attachment as any).sig || attachment.Signature || (attachment as any).Signature;

                // [FIX] Handle legacy format where sig is appended to iv with |
                if (iv && typeof iv === 'string' && iv.includes('|') && !sig) {
                    const parts = iv.split('|');
                    iv = parts[0];
                    sig = parts[1];
                }

                const isLegacy = !iv || iv === 'legacy-unencrypted';

                if (!isLegacy && iv && sig) {
                    const senderIdNum = Number(senderId);
                    const conversationIdNum = Number(conversationId);
                    const isOwn = user && senderIdNum === Number(user.id);
                    
                    let currentSenderKey = isOwn 
                        ? mySenderKeys?.get(conversationIdNum) 
                        : peerSenderKeys.get(`${conversationIdNum}:${senderIdNum}`);
                    let senderIdPubKey = isOwn ? identityKeys?.publicKey : peerIdentityKeys.get(senderIdNum);

                    if (conversationIdNum) {
                        if (isOwn && !currentSenderKey) {
                            const stored = await saveOrLoadSenderKey(conversationIdNum);
                            if (stored) currentSenderKey = stored;
                        } else if (!isOwn && !currentSenderKey) {
                            const stored = await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum);
                            if (stored) currentSenderKey = stored;
                        }
                    }

                    if (!isOwn && !senderIdPubKey) {
                        const stored = await saveOrLoadPeerIdentityKey(senderIdNum);
                        if (stored) senderIdPubKey = stored;
                    }

                    // [PRE-KEY] Try to recover key from metadata if missing (for files)
                    const metadata = (attachment as any).metadata || (attachment as any).Metadata;
                    
                    if (!currentSenderKey && metadata && myRSAKeys?.privateKey) {
                        try {
                            const meta = JSON.parse(metadata);
                            const myId = user?.id;
                            if (myId && meta.keys && meta.keys[myId]) {
                                const encryptedKeyForMe = meta.keys[myId];
                                const decryptedKey = await decryptSessionKey(encryptedKeyForMe, myRSAKeys.privateKey);
                                currentSenderKey = decryptedKey;
                                // Save for later
                                peerSenderKeys.set(`${conversationIdNum}:${senderIdNum}`, decryptedKey);
                                await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum, decryptedKey);
                            }
                        } catch (e) { }
                    }

                    // [FALLBACK] If still no identity key for own message, load it
                    if (isOwn && !senderIdPubKey) {
                        const stored = await loadKey(IDENTITY_KEY_ALIAS);
                        if (stored) senderIdPubKey = stored.publicKey;
                    }

                    if (currentSenderKey && senderIdPubKey) {
                        try {
                           console.log(`[Attachment] Decrypting file ${attachment.id}...`);
                           const decryptedBlob = await decryptFilePro(blob, iv, sig, currentSenderKey, senderIdPubKey);
                           if (!cancelled) {
                               objectUrl = URL.createObjectURL(decryptedBlob);
                               setUrl(objectUrl);
                               console.log(`[Attachment] Successfully decrypted file ${attachment.id}`);
                           }
                        } catch (e) {
                           console.error(`[Attachment] Decryption failed for file ${attachment.id}`, e);
                           if (!cancelled) setError(true);
                        }
                    } else {
                        // Keys not ready — wait for keyVersion to trigger re-run
                        console.warn(`[Attachment] Keys not ready for file ${attachment.id}: senderKey=${!!currentSenderKey}, idKey=${!!senderIdPubKey}`);
                        
                        // [FORCE RECOVERY] Try loading from IndexedDB if Maps failed
                        if (isOwn && !senderIdPubKey) {
                            const stored = await loadKey(IDENTITY_KEY_ALIAS);
                            if (stored && (stored as any).publicKey) {
                                senderIdPubKey = (stored as any).publicKey;
                            }
                        }
                        if (isOwn && !currentSenderKey) {
                            const stored = await saveOrLoadSenderKey(conversationIdNum);
                            if (stored) currentSenderKey = stored;
                        }

                        // Re-check after recovery attempt
                        if (currentSenderKey && senderIdPubKey) {
                             console.log(`[Attachment] Recovered keys for file ${attachment.id}, retrying...`);
                             try {
                                const decryptedBlob = await decryptFilePro(blob, iv, sig, currentSenderKey, senderIdPubKey);
                                if (!cancelled) {
                                    objectUrl = URL.createObjectURL(decryptedBlob);
                                    setUrl(objectUrl);
                                }
                             } catch (e) { console.error('Decryption failed after recovery', e); }
                        }
                    }
                } else {
                    // Legacy or plain file
                    if (!cancelled) {
                        objectUrl = URL.createObjectURL(blob);
                        setUrl(objectUrl);
                    }
                }
            } catch (e: any) {
                if (!cancelled) {
                    console.error('Download failed', e);
                    const isFileGone = e?.message?.includes('404') || e?.status === 404;
                    if (isFileGone) {
                        console.warn('[Attachment] File không còn tồn tại trên server:', attachment.id);
                    } else {
                        setError(true);
                    }
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        load();

        // [Fix 4.1] Proper cleanup: objectUrl captured in closure, not stale state
        return () => {
            cancelled = true;
            if (objectUrl) URL.revokeObjectURL(objectUrl);
        };
    }, [attachment.id, mySenderKey, mySenderKeys, peerSenderKeys, keyVersion]);

    const isImg = attachment.mimeType?.startsWith('image/');
    if (loading) return (
        <div className="flex items-center gap-3 p-3 rounded-2xl border w-[280px] bg-muted animate-pulse">
            <div className="h-10 w-10 rounded-lg bg-background/50" />
            <div className="flex-1 space-y-2"><div className="h-3 w-3/4 bg-background/50 rounded" /><div className="h-2 w-1/2 bg-background/50 rounded" /></div>
        </div>
    );

    if (error || !url) return (
        <div className={cn(
            "flex flex-col items-center justify-center gap-3 p-6 rounded-2xl border w-[280px] min-h-[160px] text-center",
            senderId === user?.id ? "bg-primary/5 border-primary/10" : "bg-muted/30 border-muted-foreground/10"
        )}>
            <div className="relative">
                <ImageOff className="h-10 w-10 text-muted-foreground/30" />
                <AlertCircle className="h-4 w-4 text-muted-foreground/40 absolute -bottom-1 -right-1" />
            </div>
            <div className="space-y-1.5">
                <p className="text-sm font-bold text-muted-foreground/80">
                    {isImg ? "Ảnh không tồn tại" : "Tệp không tồn tại"}
                </p>
                <p className="text-[10px] leading-relaxed text-muted-foreground/60 max-w-[200px] mx-auto">
                    Nội dung không có trên máy này và không còn trên máy chủ để tải về.
                </p>
                <button 
                  className="text-[10px] font-bold text-primary hover:underline mt-2 flex items-center justify-center gap-1 mx-auto"
                  onClick={() => toast.info("Liên hệ người gửi để nhận lại tệp này.")}
                >
                    Tìm hiểu thêm
                </button>
            </div>
        </div>
    );

    if (isImg) return (
        <div className="relative group/img max-w-sm rounded-xl overflow-hidden shadow-md">
            <AttachmentImage 
              src={url} 
              alt={attachment.fileName} 
              className="block w-full h-auto max-h-[400px] object-cover hover:scale-105 transition-transform duration-500" 
              onClick={() => window.open(url, '_blank')}
            />
            <div className="absolute inset-0 rounded-xl bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity">
                <Button variant="secondary" size="sm" className="rounded-full gap-2" onClick={() => {
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = attachment.fileName;
                    link.click();
                }}><Download className="h-3.5 w-3.5" /> Tải về</Button>
            </div>
        </div>
    );

    return (
        <a href={url} download={attachment.fileName} className={cn("flex items-center gap-3 p-3 rounded-2xl border w-[280px] max-w-full shadow-sm hover:scale-[1.02] transition-transform", senderId === user?.id ? "bg-primary/10 border-primary/20" : "bg-card border-border")}>
            <div className="h-10 w-10 rounded-lg bg-background flex items-center justify-center"><FileText className="h-5 w-5 text-primary" /></div>
            <div className="flex-1 min-w-0"><p className="text-xs font-bold truncate">{attachment.fileName}</p><p className="text-[10px] opacity-40 uppercase font-black">{(attachment.fileSize / 1024).toFixed(1)} KB</p></div>
            <Download className="h-4 w-4 opacity-40" />
        </a>
    );
}

export function ChatArea({ 
  conversation, 
  onBack, 
  onShowMembers, 
  onToggleBoard, 
  onToggleSearch, 
  onRefreshConversations, 
  isMobile = false, 
  className 
 }: ChatAreaProps) {
  const { token, user } = useAuth()
  
  // Bước 1: Gọi hook 1 lần ở đầu component
  const signalRData = useSignalR()

  // Bước 2: Destructure các hàm và dữ liệu cần thiết
  const { 
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
    mySenderKey,
    mySenderKeys,
    peerSenderKeys, 
    peerIdentityKeys, 
    identityKeys, 
    myRSAKeys,
    keyVersion 
  } = signalRData

  const {
    activeCallId,
    localStream,
    remotePeers,
    isMinimized,
    setIsMinimized,
    endCall
  } = useCall()

  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [isPinnedListExpanded, setIsPinnedListExpanded] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [replyingTo, setReplyingTo] = useState<Message | null>(null)
  const [showLobby, setShowLobby] = useState<{ meetingId: any, type: 'voice' | 'video', title: string } | null>(null)
  
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  const pinnedList = useMemo(() => messages.filter(m => m.isPinned), [messages])
  const latestPin = pinnedList[pinnedList.length - 1]

  const scrollToMessage = useCallback((msgId: any) => {
    const id = msgId.toString();
    setTimeout(() => {
      const el = document.getElementById(`message-${id}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('bg-primary/20')
        setTimeout(() => el.classList.remove('bg-primary/20'), 2000)
      }
    }, 100);
  }, [])

  useEffect(() => {
    if (pinnedMessages && conversation && pinnedMessages.conversationId === conversation.id) {
      setMessages(p => p.map(m => m.id === pinnedMessages.messageId ? { ...m, isPinned: pinnedMessages.isPinned } : m));
    }
  }, [pinnedMessages, conversation?.id]);

  useEffect(() => {
    if (lastDeletedMessage && conversation && lastDeletedMessage.conversationId === conversation.id) {
      setMessages(p => p.filter(m => m.id !== lastDeletedMessage.messageId));
    }
  }, [lastDeletedMessage, conversation?.id]);

  useEffect(() => {
    if (conversation?.id) initiateE2EEHandshake(conversation.id).catch(() => {});
  }, [conversation?.id, initiateE2EEHandshake]);

  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!conversation || !token) return
    if (activeMeeting && activeMeeting.conversationId === conversation.id) {
       setShowLobby({ meetingId: activeMeeting.meetingId, type, title: activeMeeting.title })
       return
    }
    try {
      const title = `${type === 'voice' ? '🎙️ Cuộc gọi thoại' : '📹 Cuộc gọi video'} - ${conversation.name}`
      const resp = await meetingsApi.startMeeting(token, conversation.id, title, [], type)
      const mGuid = resp?.meetingGuid || resp?.id;
      if (mGuid) {
        // [Fix 7] Gửi tin nhắn với meeting URL đầy đủ để người khác click join
        const meetingUrl = `${window.location.origin}/call/${mGuid}?type=${type}`;
        sendMessage(conversation.id, `📹 ${title}\nNhấn để tham gia ngay!\n[MEETING_GUID:${mGuid}]\n🔗 ${meetingUrl}`, 'Text');
        setShowLobby({ meetingId: mGuid, type, title })
        // Copy link vào clipboard
        try {
          await navigator.clipboard.writeText(meetingUrl);
          toast.success('📋 Đã copy link phòng họp!', { duration: 3000 });
        } catch { /* clipboard không bắt buộc */ }
      }
    } catch { toast.error(`Không thể bắt đầu cuộc gọi.`) }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !conversation || !token) return
    setIsUploading(true)
    try {
      // [FIX] Get key for this specific conversation instead of relying on global mySenderKey state
      let activeSenderKey = mySenderKeys?.get(conversation.id);
      if (!activeSenderKey) {
          // Try loading from IndexedDB
          const stored = await saveOrLoadSenderKey(conversation.id);
          if (stored) {
              activeSenderKey = stored;
          } else {
              // [CRITICAL] Do NOT generate a new key if we are still syncing or if history exists
              console.warn(`[E2EE] SenderKey missing for upload in conv ${conversation.id}.`);
              toast.error("Đang đồng bộ khóa bảo mật. Vui lòng thử lại sau giây lát.");
              setIsUploading(false);
              return;
          }
      }

      if (!activeSenderKey || !identityKeys) {
          toast.error("Vui lòng đợi thiết lập mã hóa (Thiếu Identity hoặc Sender Key)...");
          return;
      }

      toast.info('Đang mã hóa và tải lên...')
      
      // 1. Client-side E2EE Encryption
      const { encryptedBlob, iv, sig } = await encryptFilePro(file, activeSenderKey, identityKeys.privateKey);

      // 2. Upload Encrypted Blob
      await attachmentsApi.upload(token, encryptedBlob, conversation.id, undefined, iv, sig, file.name)
      
      const news = await conversationsApi.getMessages(token, conversation.id)
      setMessages(news.map((m: any) => ({
        ...m, id: m.id || m.Id, conversationId: m.conversationId || conversation.id,
        isPinned: m.isPinned || m.IsPinned, 
        encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || "",
        iv: m.iv || m.Iv,
        sig: m.sig || m.Signature || m.Sig
      })))
      toast.success('Gửi tệp thành công!')
    } catch (err: any) { 
      console.error(err);
      const errorMsg = err?.message || err?.details || 'Lỗi không xác định';
      toast.error(`Gửi tệp thất bại: ${errorMsg}`);
    } finally {
      setIsUploading(false)
      if (event.target) event.target.value = ''
    }
  }

  useEffect(() => {
    const load = async () => {
      if (!conversation || !token) return
      try {
        const res: any = await conversationsApi.getMessages(token, conversation.id)
        const data = Array.isArray(res) ? res : (res.items || [])
        setMessages(data.map((m: any) => ({
          ...m, id: m.id || m.Id, senderId: m.senderId || m.SenderId,
          encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || "",
          iv: m.iv || m.Iv || m.IV,
          sig: m.sig || m.Signature || m.Sig || m.signature,
          conversationId: m.conversationId || m.ConversationId || conversation?.id,
          createdAt: m.createdAt || m.CreatedAt || new Date().toISOString(),
          isPinned: m.isPinned || m.IsPinned, attachments: m.attachments || m.Attachments || []
        })).sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()))
        markAsRead(conversation.id)
        // Auto-trigger handshake to re-exchange peer sender keys after PIN restore
        setTimeout(() => initiateE2EEHandshake(conversation.id), 1000)
      } catch {}
    }
    load(); setReplyingTo(null); setIsPinnedListExpanded(false);
  }, [conversation?.id, token]);

  useEffect(() => {
    if (lastMessage && conversation && lastMessage.conversationId === conversation.id) {
       setMessages(prev => {
          if (prev.some(m => m.id === lastMessage.id)) return prev;
          return [...prev, {
            id: lastMessage.id, conversationId: lastMessage.conversationId, senderId: lastMessage.senderId,
            senderName: lastMessage.senderName || lastMessage.sender, encryptedContent: lastMessage.content || lastMessage.message || "",
            messageType: lastMessage.messageType || 'Text', createdAt: lastMessage.createdAt || new Date().toISOString(),
            attachments: lastMessage.attachments || [], isPinned: lastMessage.isPinned, 
            iv: lastMessage.iv || lastMessage.Iv, 
            sig: lastMessage.sig || lastMessage.Signature || lastMessage.Sig
          }];
       });
       markAsRead(conversation.id);
    }
  }, [lastMessage, conversation?.id]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !conversation) return
    try {
      await sendMessage(conversation.id, newMessage, '', replyingTo?.id)
      setNewMessage(''); setReplyingTo(null);
    } catch { toast.error('Gửi thất bại') }
  }

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
    if (currentSystemGroup.length > 0) groups.push({ type: 'system-group', messages: [...currentSystemGroup] });
    return groups;
  }, [messages]);

  if (!conversation) {
    return (
      <div className="flex-1 h-full flex flex-col items-center justify-center p-8 bg-background relative overflow-hidden">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-[120px] animate-pulse" />
        <div className="relative z-10 flex flex-col items-center max-w-md text-center">
           <div className="w-20 h-20 mb-8 bg-primary rounded-3xl flex items-center justify-center shadow-2xl"><MessageSquare className="h-10 w-10 text-white" /></div>
           <h2 className="text-3xl font-black mb-4">Chào mừng đến với <span className="text-primary italic">Lumi Chat</span></h2>
           <p className="text-sm text-muted-foreground font-medium mb-10 opacity-70">Lumi Chat là không gian làm việc số tập trung, an toàn và bảo mật.</p>
        </div>
      </div>
    )
  }

  return (
    <TooltipProvider>
    {/* Outer container fills its parent flex slot */}
    <div className={cn("flex flex-col min-w-0 bg-background relative h-full", className)}>


      {/* ── Header ── */}
      <header className="flex items-center justify-between px-4 py-3 bg-background/80 backdrop-blur-md z-30 border-b shrink-0">
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 border-2 border-primary/10">
            <AvatarImage src={getAvatarUrl(conversation.avatarPath)} className="object-cover" />
            <AvatarFallback>{conversation.name?.[0]}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-black text-sm truncate uppercase tracking-tight">{conversation.name}</h2>
            <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest opacity-60 flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-green-500" /> {conversation.type === 'Group' ? 'Hội nhóm' : 'Liên lạc'}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => handleStartCall('video')}><VideoIcon className="h-5 w-5" /></Button>
            <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => onToggleSearch?.()}><Search className="h-5 w-5" /></Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-9 w-9"><MoreVertical className="h-5 w-5" /></Button></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1 rounded-xl">
                 <DropdownMenuItem onClick={onToggleBoard} className="p-2 gap-3 text-xs font-black uppercase"><ActivityIcon className="h-4 w-4" /> Bảng tin nhóm</DropdownMenuItem>
                 <DropdownMenuItem onClick={signalRData.repairE2EE} className="p-2 gap-3 text-xs font-black uppercase text-amber-500"><ShieldAlert className="h-4 w-4" /> Sửa lỗi mã hóa (Repair)</DropdownMenuItem>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem className="text-destructive p-2 gap-3 text-xs font-black uppercase cursor-pointer" onClick={async () => {
                      if (!confirm(`Rời khỏi "${conversation.name}"?`)) return
                      try { await conversationsApi.leaveConversation(token!, conversation.id); toast.success(`Đã rời khỏi`); if (onRefreshConversations) onRefreshConversations(); if (onBack) onBack(); } 
                      catch { toast.error('Thất bại') }
                 }}><LogOut className="h-4 w-4" /> Rời khỏi hội thoại</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
        </div>
      </header>

      {/* ── Pinned message bar ── */}
      {latestPin && (
         <div className="z-20 bg-background/95 border-b flex items-center border-l-4 border-l-primary h-12 px-4 gap-3 shrink-0 group">
             <div className="flex-1 min-w-0 flex items-center gap-3 cursor-pointer" onClick={() => scrollToMessage(latestPin.id)}>
                <Pin className="h-3.5 w-3.5 text-primary fill-primary" />
                <div className="flex-1 min-w-0">
                   <p className="text-[9px] font-black uppercase text-primary/60 mb-0.5 tracking-widest">TIN NHẮN GHIM</p>
                   <div className="text-xs font-bold truncate opacity-90"><span className="text-primary">{latestPin.senderName}:</span> <DecryptedText message={latestPin} onJoinMeeting={(mid) => setShowLobby({ meetingId: mid, type: 'video', title: 'Tham gia cuộc họp' })} isOwn={latestPin.senderId === user?.id} /></div>
                </div>
             </div>
             <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsPinnedListExpanded(!isPinnedListExpanded)}><ChevronDown className={cn("h-4 w-4 transition-transform", isPinnedListExpanded && "rotate-180")} /></Button>
         </div>
      )}

      {/* ── Active meeting banner (Teams-style) ── */}
      {activeMeeting && activeMeeting.conversationId === conversation.id && (
        <div className="z-20 shrink-0 border-b border-primary/20 bg-gradient-to-r from-primary/10 to-blue-500/10">
           <div className="px-4 py-2.5 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                 <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/30 shrink-0">
                   <VideoIcon className="h-4 w-4 text-white" />
                 </div>
                 <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-primary leading-none">Cuộc họp đang diễn ra</p>
                    <p className="text-xs font-bold truncate mt-0.5">{activeMeeting.title}</p>
                    <p className="text-[9px] text-muted-foreground truncate">Do {activeMeeting.hostName} tổ chức</p>
                 </div>
              </div>
              <Button size="sm" className="rounded-xl h-8 px-4 text-[10px] font-black uppercase tracking-widest shadow-lg shadow-primary/20 shrink-0" onClick={() => setShowLobby({ meetingId: activeMeeting.meetingId, type: activeMeeting.callType as any, title: activeMeeting.title })}>
                Tham gia
              </Button>
           </div>
        </div>
      )}

      {/* ── Messages (scrollable, fills available space) ── */}
      <div className="flex-1 overflow-y-auto min-h-0 relative bg-muted/5">
        <div className="p-4 flex flex-col space-y-4 pb-4">
          {messageGroups.map((group, idx) => {
            if (group.type === 'system-group') return <SystemMessageGroup key={`sys-${idx}`} messages={group.messages} onScrollTo={scrollToMessage} />;
            const m = group.data; const isOwn = m.senderId === user?.id;
            return (
              <MessageItem
                key={m.id}
                message={m}
                isOwn={isOwn}
                user={user}
                mySenderKey={mySenderKey}
                mySenderKeys={mySenderKeys}
                peerSenderKeys={peerSenderKeys}
                peerIdentityKeys={peerIdentityKeys}
                identityKeys={identityKeys}
                myRSAKeys={myRSAKeys}
                initiateHandshake={initiateE2EEHandshake}
                onJoinMeeting={(mid) => setShowLobby({ meetingId: mid, type: 'video', title: 'Tham gia cuộc họp' })}
                togglePinMessage={togglePinMessage}
                setReplyingTo={setReplyingTo}
                attachmentsRenderer={(msg) => (
                  msg.attachments && msg.attachments.length > 0 && (
                    <div className={cn("space-y-2 w-full flex flex-col", isOwn ? "items-end" : "items-start")}>
                      {msg.attachments.map((a: any) => (
                        // ✅ SỬA — thêm mySenderKeys vào DecryptedAttachment
// Trong JSX gọi component:
<DecryptedAttachment 
    key={a.id} 
    attachment={a} 
    token={token!} 
    user={user}
    mySenderKey={mySenderKeys?.get(conversation.id) ?? mySenderKey}  
    mySenderKeys={mySenderKeys}   
    peerSenderKeys={peerSenderKeys} 
    peerIdentityKeys={peerIdentityKeys}
    identityKeys={identityKeys}
    myRSAKeys={myRSAKeys}
    senderId={msg.senderId}
    conversationId={conversation.id}
    keyVersion={keyVersion}
/>
                      ))}
                    </div>
                  )
                )}
                keyVersion={keyVersion}
              />
            )
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* ── Message Input (always pinned to bottom) ── */}
      <div className="bg-card border-t pt-2 pb-4 px-4 space-y-2 shrink-0 z-40 relative">
        {replyingTo && (
          <div className="flex items-center justify-between bg-muted/40 rounded-xl p-2 px-3 border-l-2 border-primary">
             <div className="flex items-center gap-3 min-w-0">
                <Reply className="h-3 w-3 text-primary opacity-60 shrink-0" />
                <div className="min-w-0"><p className="text-[9px] font-black uppercase text-primary">Đang trả lời {replyingTo.senderName}</p><p className="text-xs truncate opacity-60 italic">{replyingTo.messageType === 'PLAIN_SECURE' || replyingTo.messageType === 'PLAIN' ? '🔒 [Tin nhắn mã hóa]' : replyingTo.encryptedContent}</p></div>
             </div>
             <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full shrink-0" onClick={() => setReplyingTo(null)}><X className="h-3.5 w-3.5" /></Button>
          </div>
        )}
        <div className="flex items-center gap-2 opacity-60">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" disabled={isUploading} onClick={() => imageInputRef.current?.click()}><ImageIcon className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl" disabled={isUploading} onClick={() => fileInputRef.current?.click()}><Paperclip className="h-4 w-4" /></Button>
            <input type="file" ref={imageInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
        </div>
        <div className="flex items-end gap-2 bg-muted/30 p-2 rounded-2xl border border-primary/5 focus-within:border-primary/20 transition-all">
            <textarea
              value={newMessage}
              onChange={(e) => { setNewMessage(e.target.value); if(conversation) sendTyping(conversation.id); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
              placeholder="Nhập tin nhắn..."
              className="flex-1 bg-transparent border-none focus:ring-0 text-sm py-2 px-2 resize-none max-h-32 min-h-[40px] outline-none font-medium leading-relaxed"
              rows={1}
            />
            <Button size="icon" className="h-9 w-9 bg-primary text-white rounded-xl shadow-lg shrink-0" onClick={handleSendMessage}><Send className="h-4 w-4" /></Button>
        </div>
      </div>
    </div>

    {/* ── Call Lobby Modal ── */}
    {showLobby && (
      <CallLobby 
        meetingId={showLobby.meetingId} 
        type={showLobby.type} 
        title={showLobby.title} 
        conversationId={conversation.id}
        onJoin={(mic, cam) => {
           setShowLobby(null);
           router.push(`/call/${showLobby.meetingId}?mic=${mic}&cam=${cam}`);
        }}
        onCancel={() => setShowLobby(null)} 
      />
    )}

    {/* ── Floating mini-call overlay (when minimized) ── */}
    {activeCallId && isMinimized && (
      <div className="fixed bottom-6 right-6 w-64 md:w-80 bg-[#1A1A1A] rounded-[2rem] overflow-hidden border border-primary/30 shadow-[0_20px_50px_rgba(0,0,0,0.5)] z-[99999] animate-in slide-in-from-bottom-5">
         <div className="relative aspect-video bg-black flex items-center justify-center">
            <video 
              autoPlay playsInline muted 
              ref={(v) => { if(v && localStream) v.srcObject = localStream; }}
              className="w-full h-full object-cover scale-x-[-1]" 
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
            <div className="absolute bottom-4 left-4 flex flex-col -space-y-1">
               <span className="text-[10px] font-black text-primary uppercase tracking-widest">Đang gọi</span>
               <span className="text-xs font-bold text-white truncate max-w-[150px]">{conversation.name}</span>
            </div>
            <div className="absolute top-4 right-4 flex gap-2">
               <Button onClick={() => setIsMinimized(false)} size="icon" className="h-8 w-8 rounded-full bg-primary text-white shadow-lg"><Maximize2 className="h-4 w-4" /></Button>
               <Button onClick={() => router.push(`/call/${activeCallId}`)} size="icon" className="h-8 w-8 rounded-full bg-white/10 text-white backdrop-blur-md"><PhoneCall className="h-4 w-4" /></Button>
            </div>
         </div>
         <div className="px-4 py-3 flex justify-between items-center bg-[#1A1A1A]">
            <div className="flex -space-x-2">
               <Avatar className="h-6 w-6 border-2 border-[#1A1A1A]"><AvatarImage src={getAvatarUrl(user?.id)} /><AvatarFallback className="text-[8px] font-black">Me</AvatarFallback></Avatar>
               {remotePeers.slice(0, 2).map(p => (
                   <Avatar key={p.userId} className="h-6 w-6 border-2 border-[#1A1A1A] text-white"><AvatarImage src={getAvatarUrl(p.userId)} /><AvatarFallback className="text-[8px] font-black">{p.userName[0]}</AvatarFallback></Avatar>
               ))}
               {remotePeers.length > 2 && <div className="h-6 w-6 rounded-full border-2 border-[#1A1A1A] bg-primary/20 text-[8px] flex items-center justify-center font-black">+{remotePeers.length - 2}</div>}
            </div>
            <Button onClick={() => endCall()} variant="destructive" size="sm" className="h-8 rounded-xl px-4 font-black uppercase text-[9px] tracking-widest">Kết thúc</Button>
         </div>
      </div>
    )}
    </TooltipProvider>
  )
}
