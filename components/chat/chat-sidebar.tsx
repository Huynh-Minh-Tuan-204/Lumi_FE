'use client'

import { useState, useEffect, useMemo } from 'react'
import { cn, getAvatarUrl, getInitials } from '@/lib/utils'
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
  Plus
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
  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'chat' | 'global'>('chat')

  const uniqueConversations = useMemo(() => {
    const seen = new Set();
    return conversations.filter(c => {
      const key = c.type === 'Private' ? `user-${c.name}` : `group-${c.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return c.name.toLowerCase().includes(searchQuery.toLowerCase());
    });
  }, [conversations, searchQuery]);

  const groupChats = useMemo(() => uniqueConversations.filter(c => c.type === 'Group'), [uniqueConversations]);
  const privateChats = useMemo(() => uniqueConversations.filter(c => c.type === 'Private'), [uniqueConversations]);

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
            onClick={() => setSearchMode('chat')}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              searchMode === 'chat' ? "bg-sidebar shadow-sm text-primary" : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            Trò chuyện
          </button>
          <button 
            onClick={() => setSearchMode('global')}
            className={cn(
              "flex-1 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all",
              searchMode === 'global' ? "bg-sidebar shadow-sm text-primary" : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            Mọi người
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
      </div>

      <div className="flex-1 overflow-hidden flex flex-col min-h-0">
        <ScrollArea className="flex-1">
          <div className="p-2 space-y-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 opacity-20 gap-3">
                 <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                 <p className="text-[10px] font-black uppercase tracking-[0.3em]">Đang tải...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupChats.length > 0 && (
                  <div>
                    <p className="px-3 text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                       <Users className="h-3 w-3" /> Nhóm
                    </p>
                    <div className="space-y-1">
                      {groupChats.map(c => (
                        <ConversationItem 
                          key={c.id} 
                          conversation={c} 
                          isSelected={selectedConversation?.id === c.id}
                          onSelect={() => onSelectConversation(c)}
                          unreadCount={unreadCounts[c.id] || 0}
                          isOnline={false}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {privateChats.length > 0 && (
                  <div>
                    <p className="px-3 text-[10px] font-black text-primary/40 uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
                       <Hash className="h-3 w-3" /> Cá nhân
                    </p>
                    <div className="space-y-1">
                      {privateChats.map(c => (
                        <ConversationItem 
                          key={c.id} 
                          conversation={c} 
                          isSelected={selectedConversation?.id === c.id}
                          onSelect={() => onSelectConversation(c)}
                          unreadCount={unreadCounts[c.id] || 0}
                          isOnline={onlineUsers.has(c.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

function ConversationItem({ conversation, isSelected, onSelect, unreadCount, isOnline }: any) {
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
        <div className="flex items-center justify-between gap-2">
          <p className="font-bold text-sm truncate uppercase tracking-tight">{conversation.name}</p>
          <span className={cn("text-[10px] font-medium opacity-40", isSelected ? "text-primary-foreground" : "")}>
            {lastMsg?.createdAt ? new Date(lastMsg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''}
          </span>
        </div>
        <p className={cn("text-xs truncate opacity-60 font-medium", isSelected ? "text-primary-foreground/80" : "text-sidebar-foreground/60")}>
          {lastContent.includes('[Attachment]') ? '📎 Gửi một tệp đính kèm' : lastContent}
        </p>
      </div>

      {unreadCount > 0 && !isSelected && (
        <span className="h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-lg shadow-red-500/30 animate-in zoom-in duration-300">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  )
}
