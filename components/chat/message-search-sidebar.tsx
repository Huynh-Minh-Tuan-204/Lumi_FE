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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ChevronDown, User, Calendar as CalendarIcon, FilterX } from 'lucide-react'

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
  onGoToMessage?: (id: number) => void
}

export function MessageSearchSidebar({ conversationId, onClose, onGoToMessage }: MessageSearchSidebarProps) {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [senderFilter, setSenderFilter] = useState<string | null>(null)
  const [dateFilter, setDateFilter] = useState<string | null>(null)
  const [senders, setSenders] = useState<string[]>([])

  const handleSearch = async () => {
    if ((!query.trim() && !senderFilter && !dateFilter) || !token) {
        setResults([]);
        return;
    }
    setIsSearching(true)
    try {
      // Fetch current conversation messages to search within
      const messages = await conversationsApi.getMessages(token, conversationId)
      
      // Extract unique senders for the filter
      const uniqueSenders = Array.from(new Set(messages.map((m: any) => m.senderName || m.sender || 'Người dùng'))) as string[]
      setSenders(uniqueSenders)

      let filtered = messages
        .map((m: any) => ({
          id: m.id,
          senderId: m.senderId,
          senderName: m.senderName || m.sender || 'Người dùng',
          avatarPath: m.avatarPath,
          content: m.encryptedContent || m.content || m.message || '',
          createdAt: m.createdAt || m.time || new Date().toISOString()
        }))

      // Apply Filter Logic
      if (query.trim()) {
        filtered = filtered.filter((m: any) => m.content.toLowerCase().includes(query.toLowerCase()))
      }
      if (senderFilter) {
        filtered = filtered.filter((m: any) => m.senderName === senderFilter)
      }
      if (dateFilter) {
        filtered = filtered.filter((m: any) => new Date(m.createdAt).toDateString() === new Date(dateFilter).toDateString())
      }

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
  }, [query, senderFilter, dateFilter])

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

        <div className="flex items-center gap-2 mt-3">
           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="outline" size="sm" className="flex-1 h-8 text-[10px] font-black uppercase tracking-tight gap-2 rounded-lg bg-background/50 border-primary/5">
                    <User className="h-3 w-3 opacity-40" />
                    <span className="truncate">{senderFilter || 'Người gửi'}</span>
                    <ChevronDown className="h-3 w-3 opacity-20 ml-auto" />
                 </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-48 p-1 rounded-xl">
                 <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest opacity-40 px-2 py-1">Lọc theo người gửi</DropdownMenuLabel>
                 <DropdownMenuSeparator />
                 <DropdownMenuItem onClick={() => setSenderFilter(null)} className="text-[10px] font-black uppercase tracking-tight rounded-lg">Tất cả</DropdownMenuItem>
                 {senders.map(s => (
                    <DropdownMenuItem key={s} onClick={() => setSenderFilter(s)} className="text-[10px] font-black uppercase tracking-tight rounded-lg">{s}</DropdownMenuItem>
                 ))}
              </DropdownMenuContent>
           </DropdownMenu>

           <DropdownMenu>
              <DropdownMenuTrigger asChild>
                 <Button variant="outline" size="sm" className="flex-1 h-8 text-[10px] font-black uppercase tracking-tight gap-2 rounded-lg bg-background/50 border-primary/5">
                    <CalendarIcon className="h-3 w-3 opacity-40" />
                    <span className="truncate">{dateFilter ? formatToVNDate(dateFilter) : 'Ngày gửi'}</span>
                    <ChevronDown className="h-3 w-3 opacity-20 ml-auto" />
                 </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 p-1 rounded-xl">
                  <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-widest opacity-40 px-2 py-1">Lọc theo ngày</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setDateFilter(null)} className="text-[10px] font-black uppercase tracking-tight rounded-lg">Tất cả thời gian</DropdownMenuItem>
                  {/* Simplification: Just show a few options or ideally a date picker. For now, let's just allow clearing or showing some defaults if any result exists */}
                  {results.length > 0 && Array.from(new Set(results.map(r => new Date(r.createdAt).toDateString()))).map(d => (
                    <DropdownMenuItem key={d} onClick={() => setDateFilter(d)} className="text-[10px] font-black uppercase tracking-tight rounded-lg">{formatToVNDate(d)}</DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
           </DropdownMenu>

           {(senderFilter || dateFilter) && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-destructive/40 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                onClick={() => {
                  setSenderFilter(null)
                  setDateFilter(null)
                }}
              >
                <FilterX className="h-4 w-4" />
              </Button>
           )}
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
