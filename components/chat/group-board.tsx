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
}

export function GroupBoard({ conversationId, token, onClose, onGoToMessage }: GroupBoardProps) {
  const [activeTab, setActiveTab] = useState<'all' | 'pins' | 'notes' | 'polls'>('pins')
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const fetchPins = async () => {
      if (!conversationId || !token) return
      setIsLoading(true)
      try {
        const msgs = await conversationsApi.getMessages(token, conversationId)
        // Filter messages that have isPinned flag (camelCase or PascalCase)
        const pins = msgs.filter((m: any) => m.isPinned || m.IsPinned)
        setPinnedMessages(pins)
      } catch (error) {
        console.error("Failed to fetch pins for board:", error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPins()
  }, [conversationId, token])

  return (
    <div className="w-80 flex flex-col h-full bg-card">
      <div className="p-4 border-b flex items-center justify-between bg-background/50">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h3 className="font-bold text-sm">Bảng tin nhóm</h3>
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex border-b">
        {(['all', 'pins', 'notes', 'polls'] as const).map((tab) => (
          <button
            key={tab}
            className={cn(
              "flex-1 py-3 text-[11px] font-bold font-sans transition-all border-b-2",
              activeTab === tab 
                ? "border-primary text-primary" 
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(tab)}
          >
            {tab === 'all' ? 'Tất cả' : tab === 'pins' ? 'Tin ghim' : tab === 'notes' ? 'Ghi chú' : 'Bình chọn'}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1 p-3">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
             <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
             <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Đang tải...</p>
          </div>
        ) : activeTab === 'pins' && (
          <div className="space-y-4">
            {pinnedMessages.length === 0 ? (
              <div className="py-20 text-center space-y-3 opacity-40">
                <Hash className="h-12 w-12 mx-auto mb-2" />
                <p className="text-xs font-bold uppercase tracking-widest">Chưa có tin ghim</p>
                <p className="text-[10px]">Nhấn giữ tin nhắn để ghim thông tin<br/>thiết kế tại đây</p>
              </div>
            ) : (
              [...pinnedMessages].reverse().map((msg) => (
                <div key={msg.id} className="bg-muted/40 rounded-xl p-4 border border-primary/5 space-y-3 hover:bg-muted/60 transition-colors group relative overflow-hidden">
                   <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-30 transition-opacity">
                      <Hash className="h-4 w-4" />
                   </div>

                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 ring-2 ring-background">
                      <AvatarImage src={getAvatarUrl(msg.avatarPath)} />
                      <AvatarFallback className="text-[10px] font-bold bg-primary/10 text-primary">
                        {msg.senderName ? msg.senderName.substring(0, 2).toUpperCase() : 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-black truncate">{msg.senderName || 'Người dùng'}</p>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-bold uppercase opacity-60">
                        <MessageSquare className="h-2.5 w-2.5" />
                        Tin ghim
                      </div>
                    </div>
                  </div>
                  
                  <div className="pl-11 pr-2">
                    <div className="bg-background/40 p-3 rounded-lg border border-primary/5 mb-3 relative group-hover:bg-background/60 transition-colors">
                       <p className="text-xs text-foreground/90 leading-relaxed font-medium">
                        {msg.stickerUrl ? '[Nhãn dán]' : msg.encryptedContent}
                       </p>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[9px] font-bold text-muted-foreground/50 tabular-nums uppercase">
                        Hôm nay lúc {formatToVNTime(msg.createdAt || new Date().toISOString())}
                      </span>
                      <button 
                        className="text-[10px] font-black text-primary hover:underline underline-offset-4 decoration-2"
                        onClick={() => onGoToMessage(msg.id)}
                      >
                        Xem tin nhắn gốc
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
        
        {(activeTab === 'all' || activeTab === 'notes' || activeTab === 'polls') && (
           <div className="py-20 text-center opacity-20">
              <Activity className="h-10 w-10 mx-auto mb-3" />
              <p className="text-xs font-black uppercase tracking-[0.2em]">Tính năng đang phát triển</p>
           </div>
        )}
      </ScrollArea>
    </div>
  );
}
