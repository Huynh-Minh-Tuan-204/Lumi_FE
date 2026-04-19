'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Pin } from 'lucide-react'

interface Message {
  id: number
  conversationId?: number
  senderId: number
  senderName?: string
  encryptedContent: string
  messageType: string
  createdAt: string
  isPinned?: boolean
  parentMessageId?: number
}

interface SystemMessageGroupProps {
  messages: Message[]
  onScrollTo: (id: number) => void
}

export function SystemMessageGroup({ messages, onScrollTo }: SystemMessageGroupProps) {
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
           {m.parentMessageId && !m.encryptedContent.toLowerCase().includes('bỏ ghim') && (
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
        {latest.parentMessageId && !latest.encryptedContent.toLowerCase().includes('bỏ ghim') && (
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

