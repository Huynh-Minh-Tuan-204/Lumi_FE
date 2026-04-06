'use client'

import { useState, useEffect } from 'react'
import { conversationsApi } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { 
  Search, 
  X, 
  MessageSquare, 
  ArrowLeft,
  Calendar,
  Clock,
  Hash
} from 'lucide-react'
import { formatToVNTime, formatToVNDate, getAvatarUrl } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface SearchResult {
  id: number
  senderId: number
  senderName: string
  avatarPath?: string
  content: string
  createdAt: string
}

interface MessageSearchSidebarProps {
  conversationId: number
  onClose: () => void
}

export function MessageSearchSidebar({ conversationId, onClose }: MessageSearchSidebarProps) {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)

  const handleSearch = async () => {
    if (!query.trim() || !token) {
        setResults([]);
        return;
    }
    setIsSearching(true)
    try {
      // Fetch current conversation messages to search within
      const messages = await conversationsApi.getMessages(token, conversationId)
      const filtered = messages
        .filter((m: any) => (m.encryptedContent || m.content || m.message || '').toLowerCase().includes(query.toLowerCase()))
        .map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName || m.sender || 'Người dùng',
          avatarPath: m.avatarPath,
          content: m.encryptedContent || m.content || m.message || '',
          createdAt: m.createdAt || m.time || new Date().toISOString()
        }))
      setResults(filtered)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => {
        handleSearch();
    }, 400);
    return () => clearTimeout(timer);
  }, [query])

  return (
    <div className="flex flex-col h-full bg-background border-l shadow-2xl animate-in slide-in-from-right-1 duration-300">
      <header className="p-4 border-b flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose} className="h-8 w-8 hover:bg-primary/5">
             <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="min-w-0">
             <h3 className="font-black text-xs uppercase tracking-widest text-primary">Tìm kiếm tin nhắn</h3>
             <p className="text-[10px] text-muted-foreground font-bold opacity-60">Lumi Search</p>
          </div>
        </div>
      </header>

      <div className="p-4 border-b bg-muted/20">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-40" />
          <Input 
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nội dung tin nhắn..."
            className="pl-9 h-10 bg-background border-primary/5 focus-visible:ring-primary/20 rounded-xl font-medium"
            autoFocus
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {isSearching ? (
             <div className="flex flex-col items-center justify-center py-12 opacity-30 gap-3">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                <p className="text-[10px] font-black uppercase tracking-widest">Đang tìm...</p>
             </div>
          ) : results.length > 0 ? (
            <div className="space-y-4">
               <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest pl-1">{results.length} kết quả tìm được</p>
               {results.map((res) => (
                 <div 
                    key={res.id} 
                    className="group bg-muted/10 p-4 rounded-2xl border border-primary/5 hover:bg-primary/5 cursor-pointer transition-all hover:border-primary/20"
                    onClick={() => {
                        (window as any).scrollToMsg?.(res.id);
                        onClose();
                    }}
                 >
                    <div className="flex items-center gap-3 mb-3">
                        <Avatar className="h-8 w-8 border border-primary/10">
                            <AvatarImage src={getAvatarUrl(res.avatarPath)} />
                            <AvatarFallback className="text-[10px] font-black">{res.senderName?.[0] || 'U'}</AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-black truncate">{res.senderName}</p>
                            <div className="flex items-center gap-2 text-[9px] text-muted-foreground/60 font-black uppercase tracking-tighter">
                                <Calendar className="h-2.5 w-2.5" />
                                {formatToVNDate(res.createdAt)}
                                <Clock className="ml-1 h-2.5 w-2.5" />
                                {formatToVNTime(res.createdAt)}
                            </div>
                        </div>
                    </div>
                    <div className="bg-background/50 p-3 rounded-xl border border-primary/5 group-hover:bg-background transition-colors">
                        <p className="text-sm font-medium text-foreground/80 leading-relaxed line-clamp-3">
                            {res.content}
                        </p>
                    </div>
                 </div>
               ))}
            </div>
          ) : query.trim() ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/30 opacity-60">
               <MessageSquare className="h-16 w-16 mb-4 stroke-[1px]" />
               <p className="text-sm font-black uppercase tracking-widest">Không tìm thấy tin nhắn</p>
               <p className="text-[10px] mt-2 font-bold px-8 text-center leading-relaxed">Tìm kiếm theo từ khóa trong cuộc hội thoại này</p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/20 italic">
               <Search className="h-10 w-10 mb-2" />
               <p className="text-xs">Nhập từ khóa để bắt đầu tìm kiếm</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
