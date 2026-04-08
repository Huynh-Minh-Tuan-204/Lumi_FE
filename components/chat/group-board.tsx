'use client'

import { useState, useEffect } from 'react'
import { cn, getAvatarUrl, formatToVNTime, formatToVNDate } from '@/lib/utils'
import { conversationsApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  ArrowLeft, 
  Plus, 
  Hash, 
  MessageSquare,
  Activity
} from 'lucide-react'

interface GroupBoardProps {
  conversationId: number
  token: string
  onClose: () => void
  onGoToMessage: (id: number) => void
  onUnpin?: (id: number) => void
  lastPinSignal?: any
}

export function GroupBoard({ conversationId, token, onClose, onGoToMessage, onUnpin, lastPinSignal }: GroupBoardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'pins' | 'notes' | 'polls'>('pins')
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchPins = async () => {
    if (!conversationId || !token) return
    setIsLoading(true)
    try {
      const msgs = await conversationsApi.getMessages(token, conversationId)
      const mapped = msgs.map((m: any) => ({
        ...m,
        id: m.id || m.Id,
        senderName: m.senderName || m.SenderName || m.sender,
        encryptedContent: m.encryptedContent || m.EncryptedContent || m.content || m.message,
        createdAt: m.createdAt || m.CreatedAt || m.time,
        isPinned: m.isPinned || m.IsPinned,
        attachments: m.attachments || m.Attachments || []
      }))
      const pins = mapped.filter((m: any) => m.isPinned)
      setPinnedMessages(pins)
    } catch (error) {
      console.error("Failed to fetch pins for board:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPins()
  }, [conversationId, token, lastPinSignal])

  return (
    <div className="w-80 md:w-96 flex flex-col h-full bg-card animate-in slide-in-from-right-1 duration-300 border-l shadow-2xl">
      <div className="p-4 border-b flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5" onClick={onClose}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
             <h3 className="font-black text-xs uppercase tracking-widest text-primary">Bảng tin nhóm</h3>
             <p className="text-[10px] text-muted-foreground font-bold opacity-60">Tin nhắn đã ghim</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 hover:bg-primary/5">
          <Plus className="h-5 w-5" />
        </Button>
      </div>

      <div className="flex border-b bg-muted/20">
        {(['all', 'pins', 'notes', 'polls'] as const).map((tab) => (
          <button
            key={tab}
            className={cn(
              "flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2",
              activeTab === tab 
                ? "border-primary text-primary bg-primary/5" 
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-primary/5"
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'Tất cả' : tab === 'pins' ? 'Tin ghim' : tab === 'notes' ? 'Ghi chú' : 'Bình chọn'}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 p-4 bg-muted/5">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 opacity-40">
             <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
             <p className="text-[10px] font-black uppercase tracking-widest">Đang tải dữ liệu...</p>
          </div>
        ) : activeTab === 'pins' ? (
          <div className="space-y-4">
            {pinnedMessages.length === 0 ? (
              <div className="py-24 text-center space-y-3 opacity-30">
                <Hash className="h-16 w-16 mx-auto mb-4 stroke-[1px]" />
                <p className="text-sm font-black uppercase tracking-widest">Chưa có tin ghim</p>
                <p className="text-[10px] font-bold px-10 leading-relaxed text-balance">Nhấn giữ hoặc click chuột phải vào tin nhắn để ghim thông tin quan trọng tại đây</p>
              </div>
            ) : (
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">{pinnedMessages.length} tin nhắn được ghim</p>
                  {[...pinnedMessages].reverse().map((msg) => {
                    const senderName = msg.senderName ?? msg.SenderName ?? msg.sender ?? 'Người dùng';
                    const createdAt = msg.createdAt ?? msg.CreatedAt ?? msg.time ?? new Date().toISOString();
                    const avatarPath = msg.avatarPath ?? msg.AvatarPath;

                    return (
                      <div key={msg.id} className="bg-background rounded-2xl p-4 border border-primary/5 space-y-4 hover:border-primary/20 transition-all group relative overflow-hidden shadow-sm hover:shadow-md">
                        <div className="absolute top-0 right-0 p-2 opacity-5 group-hover:opacity-20 transition-opacity">
                          <Hash className="h-6 w-6 rotate-12" />
                        </div>

                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 ring-2 ring-background shrink-0 shadow-sm border border-primary/5">
                            <AvatarImage src={getAvatarUrl(avatarPath)} />
                            <AvatarFallback className="text-xs font-black bg-primary/5 text-primary">
                              {senderName.substring(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate text-foreground/90">{senderName}</p>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground font-black uppercase tracking-widest opacity-60">
                              <MessageSquare className="h-2.5 w-2.5 text-primary" />
                              Tin ghim
                            </div>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <div className="bg-muted/30 p-3.5 rounded-2xl border border-primary/5 relative group-hover:bg-muted/50 transition-all min-h-[40px]">
                             <p className="text-xs text-foreground leading-relaxed font-bold opacity-80 whitespace-pre-wrap">
                                {(() => {
                                  if (msg.stickerUrl) return '[Nhãn dán]';
                                  
                                  const text = msg.encryptedContent ?? msg.EncryptedContent ?? msg.content ?? msg.message ?? '';
                                  const isPlaceholder = text === "." || text === "[Attachment]";
                                  if (text && !isPlaceholder) return text;
                                  
                                  const atts = msg.attachments ?? msg.Attachments;
                                  if (atts && atts.length > 0) {
                                    const att = atts[0];
                                    const mime = att.mimeType || att.MimeType || att.contentType || "";
                                    const name = att.fileName || att.FileName || "Tệp đính kèm";
                                    if (mime.startsWith('image/')) return "[Hình ảnh]";
                                    if (mime.startsWith('video/')) return "[Video]";
                                    return `[File: ${name}]`;
                                  }
                                  return "Tin nhắn không có nội dung";
                                })()}
                             </p>
                          </div>
                          <div className="flex items-center justify-between px-1">
                            <span className="text-[9px] font-black text-muted-foreground/40 tabular-nums uppercase tracking-tighter">
                              {formatToVNTime(createdAt)}, {formatToVNDate(createdAt)}
                            </span>
                            <div className="flex items-center gap-3">
                              <button 
                                className="text-[10px] font-black text-primary hover:text-primary/70 transition-colors uppercase tracking-widest"
                                onClick={() => onGoToMessage(msg.id)}
                              >
                                Xem tin nhắn gốc
                              </button>
                              <button 
                                className="text-[10px] font-black text-destructive hover:text-destructive/70 transition-colors uppercase tracking-widest pl-3 border-l"
                                onClick={() => onUnpin?.(msg.id)}
                              >
                                Bỏ ghim
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            }
          </div>
        ) : (
           <div className="py-24 text-center opacity-20 space-y-4">
              <Activity className="h-12 w-12 mx-auto stroke-[1px]" />
              <p className="text-xs font-black uppercase tracking-[0.2em]">Tính năng đang phát triển</p>
              <p className="text-[10px] px-10">Tab này sẽ sớm hỗ trợ quản lý các ghi chú và bình chọn trong nhóm của bạn</p>
           </div>
        )}
      </ScrollArea>
    </div>
  );
}
