'use client'

import { useState, useEffect } from 'react'
import { cn, getAvatarUrl, formatToVNTime, formatToVNDate } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Bell,
  MessageSquare,
  Users,
  Search,
  Settings,
  LogOut,
  ChevronDown,
  Hash,
  User as UserIcon,
  Wifi,
  WifiOff,
  Globe,
  CheckCheck,
} from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { useAuth, type User } from '@/lib/auth-context'
import { useSignalR } from '@/hooks/use-signalr'
import { ThemeToggle } from '@/components/theme-toggle'
import type { Conversation } from '@/app/chat/page'
import { adminApi, conversationsApi, announcementsApi } from '@/lib/api'

interface ChatSidebarProps {
  conversations: Conversation[]
  selectedConversation: Conversation | null
  onSelectConversation: (conversation: Conversation) => void
  isLoading: boolean
  isConnected: boolean
  user: User | null
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
  const logout = useAuth().logout;
  const token = useAuth().token;
  const router = useRouter()
  const { lastUserUpdate, notifications, markAllNotificationsRead } = useSignalR()
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [isSearchingUsers, setIsSearchingUsers] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 3
  
  const totalPages = Math.ceil(notifications.length / itemsPerPage)
  const paginatedNotifications = [...notifications]
    .slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchMode, setSearchMode] = useState<'chat' | 'global'>('chat')

  // Count unread notifications (simple client-side logic for now)
  useEffect(() => {
    setUnreadNotifications(notifications.filter(n => !n.isRead).length)
    setCurrentPage(1) // Reset to first page when new notifications arrive
  }, [notifications])

  const handleMarkNotificationsRead = async () => {
    if (!token) return
    try {
      await announcementsApi.markAllRead(token)
      markAllNotificationsRead()
    } catch (e) {}
  }

  useEffect(() => {
    const fetchUsers = async () => {
      if (!user || !token) return
      try {
        const data = await adminApi.getAllUsers(token)
        setAllUsers(data.filter((u: any) => u.id !== user.id))
      } catch (e) {}
    }
    fetchUsers()
  }, [user, token])

  useEffect(() => {
    if (lastUserUpdate) {
      setAllUsers(prev => prev.map(u => {
        if (u.id === lastUserUpdate.userId) {
          return { ...u, avatarPath: lastUserUpdate.avatarPath }
        }
        return u
      }))
    }
  }, [lastUserUpdate])

  const filteredConversations = conversations.filter((conv) =>
    (conv.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.lastMessage?.content || conv.lastMessage?.message || conv.lastMessage?.encryptedContent || conv.lastMessage?.EncryptedContent || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredUsers = searchQuery.length >= 1 && searchMode === 'global'
    ? Array.from(new Map(allUsers.filter(u => 
        (u.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
      ).filter(u => !conversations.some(c => c.otherUserId === u.id && c.type === 'Private')).map(u => [u.id, u])).values())
    : []

  const privateChats = Array.from(new Map(
    filteredConversations.filter((c) => c.type === 'Private')
    .map(c => [c.otherUserId, c])
  ).values())
  const groupChats = filteredConversations.filter((c) => c.type === 'Group')

  const handleStartPrivateChat = async (userId: number) => {
    try {
      if (!token) return
      const resp = await conversationsApi.createPrivate(token, userId)
      if (resp && resp.id) {
        // Find if we already have it in state
        const existing = conversations.find(c => c.id === resp.id)
        if (existing) {
          onSelectConversation(existing)
        } else {
          // If totally new, we might need to reload or get new list
          window.location.reload()
        }
        setSearchQuery('')
        setSearchMode('chat')
      }
    } catch (e) {
      console.error('Failed to start private chat:', e)
      toast.error('Could not start private chat')
    }
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const formatTime = (dateString: string) => formatToVNTime(dateString)

  return (
    <div
      className={cn(
        'flex flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border',
        isMobile ? 'w-full h-full' : 'w-80'
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
            <MessageSquare className="h-5 w-5 text-sidebar-primary-foreground" />
          </div>
          <div>
            <h1 className="font-semibold text-sidebar-foreground">Lumi Chat</h1>
            <div className="flex items-center gap-1.5 text-xs text-sidebar-foreground/60">
              {isConnected ? (
                <>
                  <Wifi className="h-3 w-3 text-online" />
                  <span>Connected</span>
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3 text-destructive" />
                  <span>Offline</span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* NOTIFICATION HUB */}
        <Popover onOpenChange={(open) => {
          if (open) handleMarkNotificationsRead()
        }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 rounded-full bg-sidebar-accent/50 hover:bg-sidebar-accent border border-sidebar-border shadow-sm">
              <Bell className="h-4 w-4" />
              {unreadNotifications > 0 && (
                <span className="absolute top-0 right-0 h-4 w-4 flex items-center justify-center rounded-full bg-destructive text-[10px] text-white font-black border-2 border-sidebar shadow-md animate-in zoom-in duration-300">
                  {unreadNotifications > 9 ? '9+' : unreadNotifications}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-0 shadow-2xl border-sidebar-border rounded-xl overflow-hidden bg-card/95 backdrop-blur-xl">
            <div className="flex items-center justify-between border-b p-4 bg-primary/5">
              <h4 className="font-black text-xs uppercase tracking-widest text-primary">Thông báo Hệ thống</h4>
              {unreadNotifications > 0 && (
                 <span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full font-bold">
                  {unreadNotifications} Mới
                </span>
              )}
            </div>
            <ScrollArea className="max-h-[400px]">
              <div className="divide-y divide-sidebar-border/50 min-h-[200px]">
                {notifications.length === 0 ? (
                  <div className="p-10 text-center">
                    <div className="bg-primary/5 h-12 w-12 rounded-full flex items-center justify-center mx-auto mb-3">
                       <Bell className="h-6 w-6 opacity-20 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-muted-foreground/60">Không có thông báo nào</p>
                  </div>
                ) : (
                  paginatedNotifications.map((n) => (
                    <div key={n.id} className="p-4 hover:bg-sidebar-accent/50 transition-colors group cursor-default">
                      <div className="flex justify-between items-start gap-3 mb-1.5">
                        <span className="text-[11px] font-black text-primary truncate">
                          BY {n.sender?.toUpperCase() || 'SYSTEM'}
                        </span>
                        <span className="text-[9px] font-bold text-muted-foreground/60 tabular-nums">
                          {formatTime(n.time.toISOString())}
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed text-foreground/80 font-medium break-words">
                        {n.message}
                      </p>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 p-3 bg-muted/20 border-t">
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="h-7 w-7 p-0" 
                   disabled={currentPage === 1}
                   onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                 >
                   &lt;
                 </Button>
                 <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest px-2">
                   Trang {currentPage} | {totalPages}
                 </span>
                 <Button 
                   variant="ghost" 
                   size="sm" 
                   className="h-7 w-7 p-0" 
                   disabled={currentPage === totalPages}
                   onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                 >
                   &gt;
                 </Button>
              </div>
            )}

            <div className="p-3 bg-muted/30 border-t flex flex-col gap-2">
              {notifications.length > 0 && (
                <Button variant="ghost" size="sm" className="w-full text-[10px] font-bold uppercase tracking-widest h-auto py-2 flex items-center gap-2" onClick={handleMarkNotificationsRead}>
                  <CheckCheck className="h-3 w-3" /> Đánh dấu đã đọc
                </Button>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {/* Search & Modes */}
      <div className="p-3 space-y-2">
        <div className="flex bg-sidebar-accent rounded-lg p-0.5">
          <button
            onClick={() => setSearchMode('chat')}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              searchMode === 'chat' 
                ? "bg-sidebar shadow-sm text-sidebar-foreground" 
                : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            Chats
          </button>
          <button
            onClick={() => setSearchMode('global')}
            className={cn(
              "flex-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all",
              searchMode === 'global' 
                ? "bg-sidebar shadow-sm text-sidebar-foreground" 
                : "text-sidebar-foreground/40 hover:text-sidebar-foreground"
            )}
          >
            People
          </button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
          <Input
            placeholder={searchMode === 'chat' ? "Search chats..." : "Search all people..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40 h-9"
          />
        </div>
      </div>

      {/* Tabs / ScrollArea */}
      <ScrollArea className="flex-1 px-2 py-1">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8 text-sidebar-foreground/60">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-sidebar-primary border-t-transparent" />
            <p className="mt-2 text-sm">Loading chats...</p>
          </div>
        ) : (
          <div className="space-y-4">
            {searchMode === 'chat' ? (
              <>
                {/* Groups section */}
                {groupChats.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 mb-2 mt-4">👥 Groups</p>
                    {groupChats.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isSelected={selectedConversation?.id === conv.id}
                        onClick={() => onSelectConversation(conv)}
                        formatTime={formatTime}
                        getInitials={getInitials}
                        isOnline={false}
                        unreadCount={unreadCounts[conv.id] || 0}
                      />
                    ))}
                  </div>
                )}

                {/* Private Chats section */}
                {privateChats.length > 0 && (
                  <div className="space-y-1">
                    <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 mb-2 mt-4">💬 Private</p>
                    {privateChats.map((conv) => (
                      <ConversationItem
                        key={conv.id}
                        conversation={conv}
                        isSelected={selectedConversation?.id === conv.id}
                        onClick={() => onSelectConversation(conv)}
                        formatTime={formatTime}
                        getInitials={getInitials}
                        isOnline={conv.otherUserId ? onlineUsers.has(conv.otherUserId) || (conv.otherUserId === user?.id) : false}
                        unreadCount={unreadCounts[conv.id] || 0}
                      />
                    ))}
                  </div>
                )}

                {conversations.length === 0 && !searchQuery && (
                  <div className="py-20 text-center px-4">
                    <p className="text-sm text-sidebar-foreground/40 italic">No conversations yet.</p>
                    <p className="text-xs text-sidebar-foreground/20 mt-1">Switch to "People" to find someone!</p>
                  </div>
                )}

                {searchQuery && groupChats.length === 0 && privateChats.length === 0 && (
                   <div className="py-10 text-center px-4">
                    <p className="text-sm text-sidebar-foreground/40 italic">No chats matching "{searchQuery}"</p>
                  </div>
                )}
              </>
            ) : (
              /* Global People Search results */
              <div className="space-y-1 pt-2">
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 mb-2">Global Search</p>
                {filteredUsers.length > 0 ? (
                  filteredUsers.map((u) => (
                    <button
                      key={u.id}
                      onClick={() => handleStartPrivateChat(u.id)}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors text-left group"
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={getAvatarUrl(u.avatarPath)} />
                          <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs">
                            {getInitials(u.fullName || u.username)}
                          </AvatarFallback>
                        </Avatar>
                        {onlineUsers.has(u.id) && (
                          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full border-2 border-sidebar bg-online" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{u.fullName || u.username}</p>
                        <p className="text-[10px] text-sidebar-foreground/40 truncate italic">Start messaging...</p>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="py-20 text-center px-4">
                    <p className="text-sm text-sidebar-foreground/40 italic">
                      {searchQuery ? `No users found matching "${searchQuery}"` : "Search for users across the organization"}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </ScrollArea>

      {/* Bottom Profile Info */}
      <div className="p-3 border-t border-sidebar-border shrink-0">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors text-left outline-none group relative">
              <div className="relative">
                <Avatar className="h-10 w-10 border-2 border-background shrink-0">
                  <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">{user?.fullName ? getInitials(user.fullName) : 'U'}</AvatarFallback>
                </Avatar>
                {isConnected && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online border-2 border-sidebar" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{user?.fullName}</p>
                <div className="flex items-center gap-1">
                  <p className="text-xs text-muted-foreground truncate uppercase font-bold tracking-tighter opacity-60">
                    {user?.role || 'Employee'}
                  </p>
                </div>
              </div>
              <Settings className="h-4 w-4 text-sidebar-foreground/40 group-hover:text-sidebar-foreground transition-colors shrink-0" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="top" className="w-56 mb-2">
            <div className="flex items-center justify-between p-2">
              <span className="text-xs font-medium text-muted-foreground">Appearance</span>
              <ThemeToggle />
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="cursor-pointer">
              <Link href="/dashboard/settings" className="w-full flex items-center">
                <UserIcon className="mr-2 h-4 w-4" />
                Edit Profile
              </Link>
            </DropdownMenuItem>
            
            {(user?.role === 'Admin' || user?.role === 'Manager') && (
              <DropdownMenuItem 
                className="cursor-pointer"
                onClick={() => window.location.href = '/dashboard/users'}
              >
                <Users className="mr-2 h-4 w-4" />
                Manage Users
              </DropdownMenuItem>
            )}

            <DropdownMenuSeparator />
            
            {user?.role === 'Admin' && (
              <>
                <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase">
                  Admin Actions
                </div>
                <DropdownMenuItem 
                  onClick={async () => {
                    const newFullName = prompt("Enter new name:", user.fullName);
                    if (newFullName && token) {
                      try {
                        await adminApi.updateUser(token, user.id, { fullName: newFullName });
                        toast.success("Name updated! Refreshing...");
                        window.location.reload();
                      } catch (e) { toast.error("Failed to update name"); }
                    }
                  }}
                >
                  Change System Name
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}

            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

interface ConversationItemProps {
  conversation: Conversation
  isSelected: boolean
  onClick: () => void
  formatTime: (date: string) => string
  getInitials: (name: string) => string
  isOnline: boolean
  unreadCount?: number
}

function ConversationItem({
  conversation,
  isSelected,
  onClick,
  formatTime,
  getInitials,
  isOnline,
  unreadCount = 0,
}: ConversationItemProps) {
  const isGroup = conversation.type === 'Group'

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 p-3 rounded-lg transition-colors text-left',
        isSelected
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'hover:bg-sidebar-accent text-sidebar-foreground'
      )}
    >
      <div className="relative">
        <Avatar className="h-12 w-12 shrink-0">
          <AvatarImage src={getAvatarUrl(conversation.avatarPath) || (isGroup ? '/icon.png' : '')} />
          <AvatarFallback
            className={cn(
              isSelected ? 'bg-sidebar-primary-foreground/20' : 'bg-sidebar-accent',
              isSelected ? 'text-sidebar-primary-foreground' : 'text-sidebar-foreground'
            )}
          >
            {isGroup ? <Hash className="h-5 w-5" /> : getInitials(conversation.name)}
          </AvatarFallback>
        </Avatar>
        {!isGroup && isOnline && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online border-2 border-sidebar" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="font-medium truncate">{conversation.name}</span>
          {conversation.lastMessage && (
            <span
              className={cn(
                'text-xs shrink-0',
                isSelected ? 'text-sidebar-primary-foreground/70' : unreadCount > 0 ? 'text-destructive font-bold' : 'text-sidebar-foreground/60'
              )}
            >
              {formatTime(conversation.lastMessage.createdAt)}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 mt-0.5">
          {conversation.lastMessage && (
            <p
              className={cn(
                'text-sm truncate',
                isSelected ? 'text-sidebar-primary-foreground/70' : unreadCount > 0 ? 'text-sidebar-foreground font-semibold' : 'text-sidebar-foreground/60'
              )}
            >
              {(conversation.lastMessage.content || conversation.lastMessage.message || conversation.lastMessage.encryptedContent || conversation.lastMessage.EncryptedContent) === '[Attachment]' ? '📎 Sent an attachment' : (conversation.lastMessage.content || conversation.lastMessage.message || conversation.lastMessage.encryptedContent || conversation.lastMessage.EncryptedContent)}
            </p>
          )}
          {unreadCount > 0 && !isSelected && (
            <span className="flex shrink-0 items-center justify-center h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}
