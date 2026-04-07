'use client'

import { useState, useEffect } from 'react'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ChatArea } from '@/components/chat/chat-area'
import { MembersSidebar } from '@/components/chat/members-sidebar'
import { GroupBoard } from '@/components/chat/group-board'
import { MessageSearchSidebar } from '@/components/chat/message-search-sidebar'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { cn, getAvatarUrl } from '@/lib/utils'
import { 
  Calendar, 
  NotebookText, 
  Bell, 
  Search, 
  LogOut, 
  Settings, 
  User as UserIcon,
  MessageSquare,
  X 
} from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface Conversation {
  id: number
  name: string
  type: string
  avatarPath?: string
  backgroundPath?: string
  lastMessage?: any
  lastMessageTime?: string
  unreadCount?: number
  createdBy?: number
  otherUserId?: number
}

interface LeftTabbarProps {
  user: any
  onLogout: () => void
  onToggleNotifications: () => void
  onToggleSearch: () => void
  onToggleBoard: () => void
  activeTab: string | null
  setActiveTab: (tab: string | null) => void
}

function LeftTabbar({ user, onLogout, onToggleNotifications, onToggleSearch, onToggleBoard, activeTab, setActiveTab }: LeftTabbarProps) {
  return (
    <div className="w-[64px] bg-[#1a1c1e] flex flex-col items-center py-6 gap-6 shrink-0 z-[60] shadow-2xl h-full border-r border-white/5">
       <div className="flex flex-col gap-6 items-center flex-1 w-full">
          {/* Logo or Top Icon */}
          <div className="h-10 w-10 rounded-2xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20 mb-2 active:scale-95 transition-transform cursor-pointer">
             <MessageSquare className="h-5 w-5 text-primary-foreground" />
          </div>

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "h-12 w-12 rounded-xl transition-all group",
                    activeTab === 'chat' ? "bg-white/10 text-primary" : "text-white/40 hover:bg-white/5 hover:text-white"
                  )}
                >
                   <MessageSquare className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Tin nhắn</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onToggleNotifications}
                  className={cn(
                    "h-12 w-12 rounded-xl transition-all group",
                    activeTab === 'notifications' ? "bg-white/10 text-primary" : "text-white/40 hover:bg-white/5 hover:text-white"
                  )}
                >
                   <Bell className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Thông báo</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-12 w-12 text-white/40 hover:bg-white/5 hover:text-white rounded-xl"
                >
                   <Calendar className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Lịch làm việc</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-12 w-12 text-white/40 hover:bg-white/5 hover:text-white rounded-xl"
                >
                   <NotebookText className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Ghi chú</TooltipContent>
            </Tooltip>
          </TooltipProvider>
       </div>

       {/* Bottom Profile & Logout */}
       <div className="mt-auto flex flex-col items-center gap-6 w-full pb-2">
          <TooltipProvider>
            <Tooltip>
               <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={onLogout}
                    className="h-12 w-12 rounded-xl text-red-500/60 hover:text-red-500 hover:bg-red-500/10 transition-all"
                  >
                     <LogOut className="h-6 w-6" />
                  </Button>
               </TooltipTrigger>
               <TooltipContent side="right">Đăng xuất</TooltipContent>
            </Tooltip>

            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button className="relative group active:scale-90 transition-transform mb-4">
                     <Avatar className="h-10 w-10 border-2 border-white/10 group-hover:border-primary transition-colors ring-2 ring-primary/0 group-hover:ring-primary/20">
                        <AvatarImage src={getAvatarUrl(user?.avatarPath)} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary font-black text-xs uppercase">{user?.fullName?.[0]}</AvatarFallback>
                     </Avatar>
                     <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-[#1a1c1e]" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent side="right" align="end" className="w-64 p-3 rounded-2xl shadow-2xl mb-4 ml-2 bg-popover border-white/5">
                  <div className="flex items-center gap-4 p-2 border-b border-white/5 mb-3 pb-4">
                     <Avatar className="h-12 w-12">
                        <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                        <AvatarFallback className="bg-primary/10 text-primary font-black uppercase">{user?.fullName?.[0]}</AvatarFallback>
                     </Avatar>
                     <div className="min-w-0">
                        <p className="font-black text-sm uppercase truncate text-foreground">{user?.fullName}</p>
                        <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest text-primary italic">
                           {user?.role === 'Admin' ? 'Quản trị viên' : 'Nhân viên'}
                        </p>
                     </div>
                  </div>
                  <DropdownMenuItem className="p-3 rounded-xl font-bold text-xs gap-3">
                     <UserIcon className="h-4 w-4 text-primary" /> Hồ sơ cá nhân
                  </DropdownMenuItem>
                  <DropdownMenuItem className="p-3 rounded-xl font-bold text-xs gap-3">
                     <Settings className="h-4 w-4 text-primary" /> Cài đặt hệ thống
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
       </div>
    </div>
  )
}

export default function ChatPage() {
  const { token, user, logout } = useAuth()
  const { 
    isConnected, 
    onlineUsers, 
    pinnedMessages 
  } = useSignalR()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>('chat')
  const [rightSidebar, setRightSidebar] = useState<'members' | 'board' | 'search' | 'notifications' | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const unreadCounts = conversations.reduce((acc, conv) => {
    acc[conv.id] = conv.unreadCount || 0
    return acc
  }, {} as Record<number, number>)

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null

  const loadConversations = async () => {
    if (!token) return
    try {
      const data = await conversationsApi.getMyConversations(token)
      setConversations(data)
    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadConversations()
  }, [token])

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedId(conversation.id)
    setRightSidebar(null) 
  }

  const toggleBoard = () => setRightSidebar(prev => prev === 'board' ? null : 'board')
  const toggleMembers = () => setRightSidebar(prev => prev === 'members' ? null : 'members')
  const toggleSearch = () => setRightSidebar(prev => prev === 'search' ? null : 'search')
  const toggleNotifications = () => setRightSidebar(prev => prev === 'notifications' ? null : 'notifications')

  useEffect(() => {
    (window as any).scrollToMsg = (msgId: number) => {
        const el = document.getElementById(`message-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('bg-primary/20');
            setTimeout(() => el.classList.remove('bg-primary/20'), 2000);
        }
    };
    return () => { delete (window as any).scrollToMsg; }
  }, [])

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* 1. Left Navigation Tabbar (Zalo style) */}
      <LeftTabbar 
        user={user} 
        onLogout={() => { if(confirm('Xác nhận đăng xuất khỏi hệ thống?')) logout() }} 
        onToggleNotifications={toggleNotifications}
        onToggleSearch={toggleSearch}
        onToggleBoard={toggleBoard}
        activeTab={activeTab === 'chat' && rightSidebar === 'notifications' ? 'notifications' : 'chat'}
        setActiveTab={(t) => {
           setActiveTab(t);
           if (t === 'chat') setRightSidebar(null);
        }}
      />

      {/* 2. Conversations Sidebar */}
      <div className={cn("w-80 border-r shrink-0 h-full flex flex-col bg-background z-30")}>
        <ChatSidebar 
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoading}
          isConnected={isConnected}
          user={user}
          onlineUsers={onlineUsers}
          unreadCounts={unreadCounts}
        />
      </div>

      {/* 3. Main Chat Container */}
      <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
        <main className="flex-1 h-full min-w-0 bg-background transition-all">
          <ChatArea 
            conversation={selectedConversation}
            onBack={() => {}}
            onShowMembers={toggleMembers}
            onToggleBoard={toggleBoard}
            onRefreshConversations={loadConversations}
            isMobile={false}
          />
        </main>

        {/* 4. Right Sidebars (Fixed to absolute right to never overlap Tabbar) */}
        
        {/* Members Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-in-out z-40 overflow-hidden",
            rightSidebar === 'members' ? "w-80" : "w-0 border-none"
          )}
        >
          <div className="w-80 h-full">
            {selectedConversation && (
              <MembersSidebar 
                conversationId={selectedId || 0}
                conversationName={selectedConversation.name || ""}
                onlineUsers={onlineUsers}
                onClose={() => setRightSidebar(null)}
              />
            )}
          </div>
        </div>

        {/* Group News Board */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-in-out z-40 overflow-hidden",
            rightSidebar === 'board' ? "w-80 md:w-96" : "w-0 border-none"
          )}
        >
          <div className="w-80 md:w-96 h-full">
            <GroupBoard 
              conversationId={selectedId || 0}
              token={token || ""}
              onClose={() => setRightSidebar(null)}
              onGoToMessage={(id) => (window as any).scrollToMsg?.(id)}
              lastPinSignal={pinnedMessages}
            />
          </div>
        </div>

        {/* Message Search Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-in-out z-40 overflow-hidden",
            rightSidebar === 'search' ? "w-80 md:w-90" : "w-0 border-none"
          )}
        >
          <div className="w-80 md:w-90 h-full">
             {selectedId && (
               <MessageSearchSidebar 
                conversationId={selectedId}
                onClose={() => setRightSidebar(null)}
              />
             )}
          </div>
        </div>

        {/* Notifications Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-in-out z-40 overflow-hidden",
            rightSidebar === 'notifications' ? "w-80 md:w-90" : "w-0 border-none"
          )}
        >
          <div className="w-80 md:w-90 h-full flex flex-col">
             <header className="p-4 border-b flex items-center justify-between bg-muted/50">
                <h3 className="font-black text-xs uppercase tracking-[0.2em] text-primary">Thông báo</h3>
                <Button variant="ghost" size="icon" onClick={() => setRightSidebar(null)} className="h-8 w-8"><X className="h-4 w-4" /></Button>
             </header>
             <ScrollArea className="flex-1">
                <div className="p-4 flex flex-col gap-3">
                   {/* Realistic notification load logic would go here */}
                   <div className="p-3 rounded-xl bg-primary/5 border border-primary/10">
                      <p className="font-extrabold text-[11px] text-primary uppercase">Hệ thống</p>
                      <p className="text-xs mt-1 font-medium">Chào mừng bạn đã trở lại Lumi Chat. Chúc bạn một ngày làm việc hiệu quả!</p>
                      <p className="text-[9px] opacity-40 mt-2 font-bold uppercase">{new Date().toLocaleTimeString()}</p>
                   </div>
                </div>
             </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  )
}
