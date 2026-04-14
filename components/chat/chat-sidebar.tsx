'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn, getAvatarUrl, getInitials, formatZaloRelativeTime } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useSignalR } from '@/hooks/use-signalr'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Search, 
  MessageSquare, 
  Users, 
  Settings, 
  MoreVertical, 
  Hash, 
  User as UserIcon,
  LogOut,
  Bell,
  ChevronRight,
  ChevronDown,
  Plus,
  X,
  Video
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import Link from 'next/link'
import { toast } from 'sonner'
import { meetingsApi } from '@/lib/api'
import { CallLobby } from '@/components/chat/call-lobby'

interface Conversation {
  id: number
  name: string
  type: string
  avatarPath?: string
  lastMessage?: any
  unreadCount?: number
}

interface ChatSidebarProps {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  onSelectConversation: (conversation: Conversation) => void
  isLoading: boolean
  isConnected: boolean
  user: any
  onlineUsers: Set<number>
  unreadCounts: Record<number, number>
  isMobile?: boolean
}

export function ChatSidebar({
  conversations,
  selectedConversation,
  onSelectConversation,
  isLoading,
  isConnected,
  user,
  onlineUsers,
  unreadCounts,
  isMobile = false,
}: ChatSidebarProps) {
  const { token } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all')
  const [showLobby, setShowLobby] = useState<{ meetingId: any; type: 'voice' | 'video'; title: string } | null>(null)
  
  const [isRoomsExpanded, setIsRoomsExpanded] = useState(true)
  const [isChatsExpanded, setIsChatsExpanded] = useState(true)



  const uniqueConversations = useMemo(() => {
    const seen = new Set();
    return conversations.filter(c => {
      const key = c.type === 'Private' ? `user-${c.name}` : `group-${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);

      // Filter by name
      const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Filter by mode
      if (filterMode === 'unread') {
        return (unreadCounts[c.id] || 0) > 0;
      }

      return true;
    });
  }, [conversations, searchQuery, filterMode, unreadCounts]);

  const sortedConversations = useMemo(() => {
    return [...uniqueConversations].sort((a, b) => {
      const timeA = a.lastMessage?.createdAt ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const timeB = b.lastMessage?.createdAt ? new Date(b.lastMessage.createdAt).getTime() : 0;
      return timeB - timeA;
    });
  }, [uniqueConversations]);

  const meetingRooms = useMemo(() => 
    sortedConversations.filter(c => c.type === 'GlobalMeeting' || c.name.toLowerCase().includes('cuộc họp nhanh')), 
    [sortedConversations]
  );
  
  const directChats = useMemo(() => 
    sortedConversations.filter(c => c.type !== 'GlobalMeeting' && !c.name.toLowerCase().includes('cuộc họp nhanh')), 
    [sortedConversations]
  );

  return (
    <div className="flex flex-col h-full bg-sidebar border-r border-sidebar-border overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-sidebar-border space-y-4 shrink-0 bg-sidebar/50 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
               <MessageSquare className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
               <h1 className="text-sm font-black tracking-tight uppercase">Lumi Chat</h1>
               <div className="flex items-center gap-1.5">
                  <div className={cn("h-1.5 w-1.5 rounded-full animate-pulse", isConnected ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]" : "bg-red-500")} />
                  <span className="text-[9px] font-bold text-sidebar-foreground/40 uppercase tracking-widest">
                    {isConnected ? 'Đã kết nối' : 'Đang ngắt'}
                  </span>
               </div>
            </div>
          </div>
        </div>

        <div className="flex p-0.5 bg-sidebar-accent/50 rounded-xl border border-sidebar-border">
          <button 
            onClick={() => setFilterMode('all')}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              filterMode === 'all' ? "bg-sidebar shadow-sm text-primary" : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            Tất cả
          </button>
          <button 
            onClick={() => setFilterMode('unread')}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all relative",
              filterMode === 'unread' ? "bg-sidebar shadow-sm text-primary" : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            Chưa đọc
            {Object.values(unreadCounts).some(count => count > 0) && (
              <span className="absolute top-1 right-2 h-1.5 w-1.5 rounded-full bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]" />
            )}
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-sidebar-foreground/40" />
          <Input
            placeholder="Tìm kiếm..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10 bg-sidebar-accent/50 border-sidebar-border focus-visible:ring-primary/20 rounded-xl font-medium"
          />
        </div>

        <div className="pt-1">
            <div className="flex items-center gap-2 p-1.5 bg-primary/5 rounded-xl border border-primary/10">
                <Hash className="h-4 w-4 text-primary opacity-40 ml-2" />
                <input 
                    placeholder="Mã phòng..." 
                    className="flex-1 bg-transparent border-none outline-none text-[11px] font-bold placeholder:text-sidebar-foreground/30"
                    onKeyDown={async (e) => {
                        if (e.key === 'Enter') {
                            const val = e.currentTarget.value.replace('#', '').trim();
                            if (val) {
                               try {
                                 const m = await meetingsApi.getMeeting(token!, val);
                                 window.location.href = `/call/${m.meetingGuid || m.id}?type=video`;
                               } catch(e) { toast.error("Mã phòng không hợp lệ"); }
                            }
                        }
                    }}
                />
                <Button size="icon" className="h-7 w-7 rounded-lg group" onClick={async (e) => {
                    const input = e.currentTarget.parentElement?.querySelector('input');
                    const val = input?.value.replace('#', '').trim();
                    if (val) {
                       try {
                         const m = await meetingsApi.getMeeting(token!, val);
                         window.location.href = `/call/${m.meetingGuid || m.id}?type=video`;
                       } catch(e) { toast.error("Mã phòng không hợp lệ"); }
                    }
                }}>
                    <ChevronRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
            </div>
            <p className="text-[8px] font-black text-sidebar-foreground/20 uppercase tracking-[0.2em] mt-1 ml-2">Tham gia nhanh bằng mã phòng</p>
        </div>
      </div>

      <ScrollArea className="flex-1 bg-sidebar/30">
          <div className="p-2 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20 gap-3">
                 <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                 <p className="text-[10px] font-black uppercase tracking-[0.3em]">Đang tải...</p>
              </div>
            ) : (
            <div className="space-y-4">
                <div className="space-y-1">
                   <button 
                    onClick={() => setIsChatsExpanded(!isChatsExpanded)}
                    className="w-full flex items-center justify-between px-2 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors sticky top-0 bg-sidebar/95 backdrop-blur-sm z-20 mb-1"
                   >
                      <span className="flex items-center gap-2">
                        <MessageSquare className="h-3 w-3 text-primary/60" /> Trò chuyện ({directChats.length})
                      </span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform duration-300", !isChatsExpanded && "-rotate-90")} />
                   </button>
                   
                   {isChatsExpanded && (
                      <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
                         {directChats.map(c => (
                            <ConversationItem 
                              key={c.id} 
                              conversation={c} 
                              isSelected={selectedConversation?.id === c.id}
                              onSelect={() => onSelectConversation(c)}
                              unreadCount={unreadCounts[c.id] || 0}
                              isOnline={c.type === 'Private' ? onlineUsers.has(c.id) : false}
                            />
                         ))}
                      </div>
                   )}
                </div>

                {meetingRooms.length > 0 && (
                   <div className="space-y-1">
                    <button 
                      onClick={() => setIsRoomsExpanded(!isRoomsExpanded)}
                      className="w-full flex items-center justify-between px-2 py-2 text-[10px] font-black uppercase tracking-[0.15em] text-sidebar-foreground/40 hover:text-sidebar-foreground transition-colors group sticky top-0 bg-sidebar/95 backdrop-blur-sm z-20 mb-1"
                    >
                       <span className="flex items-center gap-2">
                          <Video className="h-3 w-3 text-primary/60" /> Phòng họp ({meetingRooms.length})
                       </span>
                       <ChevronDown className={cn("h-3 w-3 transition-transform duration-300", !isRoomsExpanded && "-rotate-90")} />
                    </button>
                      
                      {isRoomsExpanded && (
                         <div className="space-y-1 animate-in fade-in slide-in-from-top-1 duration-300">
                            {meetingRooms.map(c => (
                               <ConversationItem 
                                 key={c.id} 
                                 conversation={c} 
                                 isSelected={selectedConversation?.id === c.id}
                                 onSelect={() => onSelectConversation(c)}
                                 unreadCount={unreadCounts[c.id] || 0}
                                 onDelete={async () => {
                                    if (confirm('Bạn có chắc muốn xóa cuộc họp này?')) {
                                        try {
                                          await meetingsApi.deleteMeeting(token!, c.id);
                                          toast.success('Đã xóa cuộc họp');
                                          window.location.reload();
                                        } catch(e) { toast.error('Lỗi khi xóa'); }
                                    }
                                 }}
                               />
                            ))}
                         </div>
                      )}
                   </div>
                )}
              </div>
            )}
          </div>
      </ScrollArea>
      
      {showLobby && (
        <CallLobby 
          meetingId={showLobby.meetingId}
          type={showLobby.type}
          title={showLobby.title}
          conversationId={0}
          onJoin={(mic, cam) => {
            window.location.href = `/call/${showLobby.meetingId}?type=${showLobby.type}&mic=${mic}&cam=${cam}`;
          }}
          onCancel={() => setShowLobby(null)}
        />
      )}
    </div>
  )
}

function ConversationItem({ conversation, isSelected, onSelect, unreadCount, isOnline, onDelete }: any) {
  const lastMsg = conversation.lastMessage;
  const lastContent = lastMsg?.message || lastMsg?.content || lastMsg?.encryptedContent || lastMsg?.EncryptedContent || '';

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full flex items-center gap-3 p-3 rounded-2xl transition-all relative group",
        isSelected ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02] z-10" : "hover:bg-sidebar-accent/50 text-sidebar-foreground"
      )}
    >
      <div className="relative shrink-0">
        <Avatar className={cn("h-12 w-12 border-2 transition-transform group-hover:scale-105", isSelected ? "border-primary-foreground/20" : "border-primary/10")}>
          <AvatarImage src={getAvatarUrl(conversation.avatarPath)} />
          <AvatarFallback className={cn("font-black uppercase text-xs", isSelected ? "bg-primary-foreground/10 text-primary-foreground" : "bg-primary/5 text-primary")}>
            {getInitials(conversation.name)}
          </AvatarFallback>
        </Avatar>
        {isOnline && (
           <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-sidebar" />
        )}
      </div>
      
      <div className="flex-1 min-w-0 text-left space-y-0.5">
        <div className="flex items-center justify-between mb-0.5">
          <span className={cn("text-xs font-black uppercase tracking-tight truncate", isSelected ? "text-primary-foreground" : "text-sidebar-foreground")}>
            {conversation.name}
          </span>
          <span className="text-[9px] font-medium opacity-40">
            {conversation.lastMessage?.createdAt ? formatZaloRelativeTime(conversation.lastMessage.createdAt) : ''}
          </span>
        </div>
        <p className={cn("text-[10px] truncate opacity-80 font-black tracking-tight", isSelected ? "text-primary-foreground/90 whitespace-nowrap" : "text-primary/60")}>
          {conversation.type === 'GlobalMeeting' 
            ? (conversation.meetingGuid ? `CODE: ${conversation.meetingGuid}` : `ID: #${conversation.id}`) 
            : (lastContent.includes('[Attachment]') ? '📎 Gửi một tệp đính kèm' : lastContent)}
        </p>
      </div>

      {unreadCount > 0 && !isSelected && (
        <span className="h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 animate-in zoom-in duration-300">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
      
      {onDelete && isSelected && (
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="absolute right-2 top-2 p-1 rounded-full bg-destructive/10 text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </button>
  )
}
