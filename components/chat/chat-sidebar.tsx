'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
} from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { useAuth, type User } from '@/lib/auth-context'
import { ThemeToggle } from '@/components/theme-toggle'
import type { Conversation } from '@/app/chat/page'
import { adminApi, conversationsApi } from '@/lib/api'

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
  const { logout, token } = useAuth()
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [isSearchingUsers, setIsSearchingUsers] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')

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

  const filteredConversations = conversations.filter((conv) =>
    (conv.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (conv.lastMessage?.encryptedContent || '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  const filteredUsers = searchQuery.length >= 2 
    ? allUsers.filter(u => 
        (u.fullName || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (u.username || '').toLowerCase().includes(searchQuery.toLowerCase())
      ).filter(u => !conversations.some(c => c.otherUserId === u.id))
    : []

  const privateChats = filteredConversations.filter((c) => c.type === 'Private')
  const groupChats = filteredConversations.filter((c) => c.type === 'Group')

  const handleStartPrivateChat = async (userId: number) => {
    try {
      if (!token) return
      await conversationsApi.createPrivate(token, userId)
      window.location.reload()
    } catch (e) {
      console.error(e)
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

  const formatTime = (dateString: string) => {
    if (!dateString) return ''
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '...'
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } else if (days === 1) {
      return 'Yesterday'
    } else if (days < 7) {
      return date.toLocaleDateString([], { weekday: 'short' })
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

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
      </div>

      {/* Search */}
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sidebar-foreground/40" />
          <Input
            placeholder="Search chats or people..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 bg-sidebar-accent border-sidebar-border text-sidebar-foreground placeholder:text-sidebar-foreground/40"
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
            {/* Conversations section */}
            {(filteredConversations.length > 0 || !searchQuery) && (
              <div className="space-y-1">
                {searchQuery && <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 mb-2">Recent Chats</p>}
                {filteredConversations.map((conv) => (
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

            {/* People search results */}
            {searchQuery && filteredUsers.length > 0 && (
              <div className="space-y-1 pt-2">
                <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/40 mb-2">Find People</p>
                {filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleStartPrivateChat(u.id)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-sidebar-accent transition-colors text-left group"
                  >
                    <div className="relative">
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={u.avatarPath} />
                        <AvatarFallback className="bg-sidebar-accent text-sidebar-foreground text-xs">
                          {getInitials(u.fullName)}
                        </AvatarFallback>
                      </Avatar>
                      {onlineUsers.has(u.id) && (
                        <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-online border-2 border-sidebar" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{u.fullName}</p>
                      <p className="text-[10px] text-sidebar-foreground/40 truncate">@{u.username}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery && filteredConversations.length === 0 && filteredUsers.length === 0 && (
              <div className="py-20 text-center">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-sidebar-accent mb-3">
                  <Search className="h-6 w-6 text-sidebar-foreground/20" />
                </div>
                <p className="text-sm text-sidebar-foreground/60">No results found for "{searchQuery}"</p>
              </div>
            )}

            {!searchQuery && conversations.length === 0 && (
              <div className="py-20 text-center">
                <p className="text-sm text-sidebar-foreground/60">No conversations yet</p>
                <p className="text-xs text-sidebar-foreground/40 mt-1">Search for people to start a chat</p>
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
                  <AvatarImage src={user?.avatarPath} />
                  <AvatarFallback className="bg-primary/20 text-primary font-medium">{user?.fullName ? getInitials(user.fullName) : 'U'}</AvatarFallback>
                </Avatar>
                {isConnected && (
                  <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-online border-2 border-sidebar" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{user?.fullName}</p>
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 rounded-full bg-online shrink-0" />
                  <p className="text-xs text-muted-foreground truncate">
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
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer flex items-center w-full">
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
        <Avatar className="h-12 w-12">
          {conversation.avatarPath && (
            <AvatarImage src={`${process.env.NEXT_PUBLIC_API_URL?.replace('/api', '') || ''}${conversation.avatarPath}`} />
          )}
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
              {conversation.lastMessage.encryptedContent === '[Attachment]' ? '📎 Sent an attachment' : conversation.lastMessage.encryptedContent}
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
