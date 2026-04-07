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

interface RightTabbarProps {
  user: any
  onLogout: () => void
  onToggleNotifications: () => void
  onToggleSearch: () => void
  onToggleBoard: () => void
  onToggleMembers: () => void
  activeSidebar: string | null
}

function RightTabbar({ user, onLogout, onToggleNotifications, onToggleSearch, onToggleBoard, onToggleMembers, activeSidebar }: RightTabbarProps) {
  return (
    <div className="w-[60px] border-l bg-background flex flex-col items-center py-4 gap-6 shrink-0 z-[60] shadow-[-4px_0_15px_rgba(0,0,0,0.05)]">
       <div className="flex flex-col gap-4 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onToggleNotifications}
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all group",
                    activeSidebar === 'notifications' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  )}
                >
                   <Bell className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Thông báo</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onToggleSearch}
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all group",
                    activeSidebar === 'search' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  )}
                >
                   <Search className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Tìm kiếm</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={onToggleBoard}
                  className={cn(
                    "h-10 w-10 rounded-xl transition-all group",
                    activeSidebar === 'board' ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-primary/5 hover:text-primary"
                  )}
                >
                   <NotebookText className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Bảng tin</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                   variant="ghost" 
                   size="icon" 
                   className="h-10 w-10 text-muted-foreground hover:bg-primary/5 hover:text-primary rounded-xl"
                >
                   <Calendar className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="left">Lịch làm việc</TooltipContent>
            </Tooltip>
          </TooltipProvider>
       </div>

       <div className="mt-auto flex flex-col items-center gap-4">
          <TooltipProvider>
            <Tooltip>
               <TooltipTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={onLogout}
                    className="h-10 w-10 rounded-xl text-destructive/40 hover:text-destructive hover:bg-destructive/10 transition-all"
                  >
                     <LogOut className="h-5 w-5" />
                  </Button>
               </TooltipTrigger>
               <TooltipContent side="left">Đăng xuất</TooltipContent>
            </Tooltip>

            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button className="relative group active:scale-90 transition-transform">
                     <Avatar className="h-10 w-10 border-2 border-primary/20 group-hover:border-primary transition-colors">
                        <AvatarImage src={getAvatarUrl(user?.avatarPath)} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary font-black text-xs">{user?.fullName?.[0]}</AvatarFallback>
                     </Avatar>
                     <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent side="left" align="end" className="w-56 p-2 rounded-2xl shadow-2xl mb-2 mr-2">
                  <div className="p-3 border-b mb-1">
                     <p className="font-black text-sm uppercase truncate">{user?.fullName}</p>
                     <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest">{user?.role === 'Admin' ? 'Quản trị viên' : 'Nhân viên'}</p>
                  </div>
                  <DropdownMenuItem className="p-2.5 rounded-xl font-bold text-xs gap-3">
                     <UserIcon className="h-4 w-4 text-primary" /> Hồ sơ cá nhân
                  </DropdownMenuItem>
                  <DropdownMenuItem className="p-2.5 rounded-xl font-bold text-xs gap-3">
                     <Settings className="h-4 w-4" /> Cài đặt
                  </DropdownMenuItem>
               </DropdownMenuContent>
            </DropdownMenu>
          </TooltipProvider>
       </div>
    </div>
  )
}

export default function ChatPage() {
  const { token, user } = useAuth()
  const { 
    isConnected, 
    onlineUsers, 
    pinnedMessages 
  } = useSignalR()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
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
    setIsSidebarOpen(false) 
    setRightSidebar(null) 
  }

  const toggleBoard = () => setRightSidebar(prev => prev === 'board' ? null : 'board')
  const toggleMembers = () => setRightSidebar(prev => prev === 'members' ? null : 'members')
  const toggleSearch = () => setRightSidebar(prev => prev === 'search' ? null : 'search')
  const toggleNotifications = () => setRightSidebar(prev => prev === 'notifications' ? null : 'notifications')

  // Load notifications from local storage
  const [localNotifications, setLocalNotifications] = useState<any[]>([])
  useEffect(() => {
    const saved = localStorage.getItem('lumi_notifications')
    if (saved) {
      try {
        setLocalNotifications(JSON.parse(saved))
      } catch (e) {
        console.error('Failed to parse notifications', e)
      }
    } else {
      // Sample notifications if none exist
      const samples = [
        { id: 1, title: 'Bảo trì hệ thống', content: 'Hệ thống sẽ bảo trì vào 23:00 hôm nay.', time: new Date().toISOString() },
        { id: 2, title: 'Thông báo mới', content: 'Bạn có lời mời tham gia nhóm Dự án mới.', time: new Date(Date.now() - 3600000).toISOString() }
      ]
      setLocalNotifications(samples)
      localStorage.setItem('lumi_notifications', JSON.stringify(samples))
    }
  }, [rightSidebar === 'notifications'])

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
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Left Chat Sidebar */}
      <div 
        className={cn(
          "w-80 border-r shrink-0 h-full flex flex-col transition-all duration-300 z-30 bg-background text-foreground",
          !isSidebarOpen && "md:w-80 -ml-80 md:ml-0"
        )}
      >
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

      {/* Main Container */}
      <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
        <main className="flex-1 h-full min-w-0 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] bg-background">
          <ChatArea 
            conversation={selectedConversation}
            onBack={() => setIsSidebarOpen(true)}
            onShowMembers={toggleMembers}
            onToggleBoard={toggleBoard}
            onRefreshConversations={loadConversations}
            isMobile={!isSidebarOpen}
          />
        </main>

        {/* Members Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-40 md:z-20 overflow-hidden",
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
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-40 md:z-20 overflow-hidden",
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

        {/* Search Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-40 md:z-20 overflow-hidden",
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
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-40 md:z-20 overflow-hidden",
            rightSidebar === 'notifications' ? "w-80 md:w-90" : "w-0 border-none"
          )}
        >
          <div className="w-80 md:w-90 h-full flex flex-col">
             <header className="p-4 border-b flex items-center justify-between">
                <h3 className="font-black text-xs uppercase tracking-widest text-primary">Thông báo</h3>
                <Button variant="ghost" size="icon" onClick={() => setRightSidebar(null)} className="h-8 w-8"><X className="h-4 w-4" /></Button>
             </header>
             <ScrollArea className="flex-1">
                <div className="p-4 space-y-4">
                   {localNotifications.length > 0 ? (
                      localNotifications.map((notif) => (
                         <div key={notif.id} className="p-3 rounded-xl bg-muted/30 border border-primary/5 hover:border-primary/20 transition-all cursor-pointer group">
                            <p className="font-black text-xs uppercase tracking-tight text-primary">{notif.title}</p>
                            <p className="text-xs opacity-70 mt-1">{notif.content}</p>
                            <p className="text-[9px] opacity-40 mt-2 font-bold">{new Date(notif.time).toLocaleString()}</p>
                         </div>
                      ))
                   ) : (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20 italic text-center">
                         <Bell className="h-12 w-12 mb-4 text-primary" />
                         <p className="text-sm font-bold uppercase tracking-widest">Không có thông báo</p>
                         <p className="text-[10px] mt-2 opacity-60">Lịch sử thông báo sẽ xuất hiện tại đây</p>
                      </div>
                   )}
                </div>
             </ScrollArea>
          </div>
        </div>

        {/* Right Tabbar */}
        <RightTabbar 
          user={user} 
          onLogout={() => { if(confirm('Bạn có chắc muốn đăng xuất?')) window.location.href = '/' }} 
          onToggleNotifications={toggleNotifications}
          onToggleSearch={toggleSearch}
          onToggleBoard={toggleBoard}
          onToggleMembers={toggleMembers}
          activeSidebar={rightSidebar}
        />
      </div>
    </div>
  )
}
