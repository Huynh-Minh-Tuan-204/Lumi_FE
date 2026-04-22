'use client'

import { useState, useEffect, useMemo } from 'react'
import { ChatSidebar } from '@/features/chat/chat-sidebar'
import { ChatArea } from '@/features/chat/chat-area'
import { MembersSidebar } from '@/features/chat/members-sidebar'
import { GroupBoard } from '@/features/chat/group-board'
import { MessageSearchSidebar } from '@/features/chat/message-search-sidebar'
import { ProjectNotes } from '@/features/chat/project-notes'
import { CreateEventModal } from '@/features/schedule/create-event-modal'
import { PersonalCalendar } from '@/features/schedule/personal-calendar'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { cn, getAvatarUrl } from '@/lib/utils'
import { 
  Calendar as CalendarIcon, 
  NotebookText, 
  Bell, 
  Search, 
  LogOut, 
  Settings, 
  User as UserIcon,
  MessageSquare,
  X,
  LayoutDashboard,
  Sun,
  Moon
} from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ScrollArea } from '@/components/ui/scroll-area'
import { toast } from 'sonner'

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
  onToggleCalendar: () => void
  onToggleNotes: () => void
  activeTab: string | null
  setActiveTab: (tab: string | null) => void
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => setMounted(true), [])

  if (!mounted) return (
     <Button variant="ghost" size="icon" className="h-12 w-12 text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl">
        <Moon className="h-6 w-6" />
     </Button>
  )

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
      className="h-12 w-12 text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl transition-all hover:scale-110 active:scale-90"
    >
       {theme === 'dark' ? (
          <Sun className="h-6 w-6 text-yellow-500 animate-in fade-in zoom-in spin-in-90 duration-300" />
       ) : (
          <Moon className="h-6 w-6 text-indigo-400 animate-in fade-in zoom-in spin-in-90 duration-300" />
       )}
    </Button>
  )
}

function LeftTabbar({ user, onLogout, onToggleNotifications, onToggleSearch, onToggleBoard, onToggleCalendar, onToggleNotes, activeTab, setActiveTab }: LeftTabbarProps) {
  return (
    <div className="w-[64px] bg-card flex flex-col items-center py-6 gap-6 shrink-0 z-[60] shadow-2xl h-full border-r border-border">
       <div className="flex flex-col gap-6 items-center flex-1 w-full">
          {user?.role === 'Admin' && (
             <TooltipProvider>
               <Tooltip>
                 <TooltipTrigger asChild>
                   <Button 
                     variant="ghost" 
                     size="icon" 
                     asChild
                     className="h-12 w-12 rounded-xl text-primary/60 hover:bg-primary/5 hover:text-primary transition-all mb-2"
                   >
                     <Link href="/dashboard">
                        <LayoutDashboard className="h-6 w-6" />
                     </Link>
                   </Button>
                 </TooltipTrigger>
                 <TooltipContent side="right">Bảng quản trị</TooltipContent>
               </Tooltip>
             </TooltipProvider>
          )}

          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setActiveTab('chat')}
                  className={cn(
                    "h-12 w-12 rounded-xl transition-all group",
                    activeTab === 'chat' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
                    activeTab === 'notifications' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                   <Bell className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Thông báo hệ thống</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                   variant="ghost" 
                   size="icon" 
                   onClick={onToggleCalendar}
                   className="h-12 w-12 text-muted-foreground hover:bg-muted hover:text-foreground rounded-xl"
                >
                   <CalendarIcon className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Lịch công tác</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                   id="btn-project-notes"
                   variant="ghost" 
                   size="icon"
                   onClick={() => onToggleNotes()}
                   className={cn(
                    "h-12 w-12 rounded-xl transition-all group",
                    activeTab === 'notes' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                   )}
                >
                   <NotebookText className="h-6 w-6" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">Ghi chú dự án (Minh Tuấn)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <ThemeToggle />
              </TooltipTrigger>
              <TooltipContent side="right">Cài đặt giao diện</TooltipContent>
            </Tooltip>
          </TooltipProvider>
       </div>

       <div className="mt-auto flex flex-col items-center gap-6 w-full pb-2">
          <TooltipProvider>
            <DropdownMenu>
               <DropdownMenuTrigger asChild>
                  <button className="relative group active:scale-90 transition-transform mb-4">
                     <Avatar className="h-10 w-10 border-2 border-border group-hover:border-primary transition-colors ring-2 ring-primary/0 group-hover:ring-primary/20">
                        <AvatarImage src={getAvatarUrl(user?.avatarPath)} className="object-cover" />
                        <AvatarFallback className="bg-primary/10 text-primary font-black text-xs uppercase">{user?.fullName?.[0]}</AvatarFallback>
                     </Avatar>
                     <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 border-2 border-background" />
                  </button>
               </DropdownMenuTrigger>
               <DropdownMenuContent side="right" align="end" className="w-64 p-3 rounded-2xl shadow-2xl mb-4 ml-2 bg-popover border-border">
                  <div className="flex items-center gap-4 p-2 border-b border-border mb-3 pb-4">
                     <Avatar className="h-12 w-12">
                        <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                        <AvatarFallback className="bg-primary/10 text-primary font-black uppercase text-xs">{user?.fullName?.[0]}</AvatarFallback>
                     </Avatar>
                     <div className="min-w-0">
                        <p className="font-black text-sm uppercase truncate text-foreground">{user?.fullName}</p>
                        <p className="text-[10px] opacity-40 font-bold uppercase tracking-widest text-primary italic">
                           {user?.role === 'Admin' ? 'Quản trị viên' : 'Nhân viên'}
                        </p>
                     </div>
                  </div>
                  <DropdownMenuItem onClick={() => toast.info('Tính năng này đang phát triển!')} className="p-3 rounded-xl font-bold text-[11px] uppercase tracking-widest gap-3">
                     <UserIcon className="h-4 w-4 text-primary" /> Hồ sơ cá nhân
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => toast.info('Tính năng này đang phát triển!')} className="p-3 rounded-xl font-bold text-[11px] uppercase tracking-widest gap-3">
                     <Settings className="h-4 w-4 text-primary" /> Cài đặt chung
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-border" />
                  <DropdownMenuItem onClick={onLogout} className="p-3 rounded-xl font-bold text-[11px] uppercase tracking-widest gap-3 text-red-500 focus:text-red-500 focus:bg-red-500/10">
                     <LogOut className="h-4 w-4" /> Đăng xuất
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
  const { isConnected, onlineUsers, notifications, lastUserLeft, togglePinMessage, pinnedMessages, lastMessage } = useSignalR()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<string | null>('chat')
  const [rightSidebar, setRightSidebar] = useState<'members' | 'board' | 'search' | 'notes' | null>(null)
  const [showNotifModal, setShowNotifModal] = useState(false)
  const [showCalendar, setShowCalendar] = useState(false)
  const [showCreateEvent, setShowCreateEvent] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

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

  // Handle participant removal on UserLeft
  useEffect(() => {
    if (lastUserLeft) {
      console.log(`User ${lastUserLeft} left signal received. Syncing UI...`)
    }
  }, [lastUserLeft])

  // Real-time update for conversation list when new message arrives
  useEffect(() => {
    if (lastMessage) {
      setConversations(prev => {
        // Use String comparison for ID to avoid number vs string issues
        const index = prev.findIndex(c => String(c.id) === String(lastMessage.conversationId));
        
        if (index === -1) {
          // If conversation not found in current list, refetch to be safe
          loadConversations();
          return prev;
        }

        const updated = [...prev];
        const currentConv = updated[index];
        
        // Update the conversation with new message info
        const updatedConv = {
          ...currentConv,
          lastMessage: {
            ...currentConv.lastMessage,
            id: lastMessage.id,
            content: lastMessage.message,
            encryptedContent: lastMessage.message,
            createdAt: lastMessage.time.toISOString(),
            senderId: lastMessage.senderId
          }
        };

        // Remove from current position and push to the very top
        updated.splice(index, 1);
        return [updatedConv, ...updated];
      });
    }
  }, [lastMessage])

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* 1. Left Navigation Tabbar */}
      <LeftTabbar 
        user={user} 
        onLogout={() => { if(confirm('Đăng xuất khỏi hệ thống Lumi?')) logout() }} 
        onToggleNotifications={() => setShowNotifModal(true)}
        onToggleSearch={() => setRightSidebar(prev => prev === 'search' ? null : 'search')}
        onToggleBoard={() => setRightSidebar(prev => prev === 'board' ? null : 'board')}
        onToggleCalendar={() => setShowCalendar(true)}
        onToggleNotes={() => {
           console.log("Opening notes...");
           setRightSidebar(prev => prev === 'notes' ? null : 'notes');
           setActiveTab(prev => prev === 'notes' ? 'chat' : 'notes');
        }}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* 2. Conversations Sidebar */}
      <div className={cn(
        "w-80 border-r shrink-0 h-full flex flex-col bg-background z-30 transition-all duration-300",
        selectedId && "hidden md:flex", // Hide on mobile if chat is open
        !selectedId && "flex w-full md:w-80" // Full width on mobile if no chat open
      )}>
        <ChatSidebar 
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoading}
          isConnected={isConnected}
          user={user}
          onlineUsers={onlineUsers}
          unreadCounts={{}}
          onRefreshConversations={loadConversations}
          isMobile={true}
        />
      </div>

      {/* 3. Main Chat Area */}
      <main className={cn(
        "flex-1 h-full min-w-0 bg-background relative z-10 transition-all duration-300",
        !selectedId && "hidden md:block", // Hide on mobile if no chat selected
        selectedId && "block"
      )}>
        <ChatArea 
          conversation={selectedConversation}
          onBack={() => setSelectedId(null)}
          onShowMembers={() => setRightSidebar(prev => prev === 'members' ? null : 'members')}
          onToggleBoard={() => setRightSidebar(prev => prev === 'board' ? null : 'board')}
          onToggleSearch={() => setRightSidebar(prev => prev === 'search' ? null : 'search')}
          onToggleCalendar={() => setShowCreateEvent(true)}
          onRefreshConversations={loadConversations}
          isMobile={true}
        />
      </main>

      {/* 4. Right Panel — Overlay trên <xl, Push trên xl+ */}
      {/* Backdrop: chỉ hiện trên màn nhỏ khi sidebar mở */}
      {rightSidebar && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 xl:hidden" 
          onClick={() => setRightSidebar(null)} 
        />
      )}

      <div 
        className={cn(
          // Mobile/tablet: fixed overlay từ phải
          "fixed top-0 right-0 h-full z-50 bg-card border-l shadow-2xl transition-transform duration-300 ease-in-out",
          // Desktop XL+: relative (push layout)
          "xl:relative xl:z-auto xl:shadow-none xl:transition-all xl:duration-300",
          // Khi đóng
          rightSidebar 
            ? "translate-x-0 w-80 md:w-96 xl:w-80 xl:opacity-100" 
            : "translate-x-full xl:translate-x-0 xl:w-0 xl:opacity-0 xl:border-none"
        )}
      >
        <div className="w-80 md:w-96 xl:w-80 h-full flex flex-col overflow-hidden">
            {rightSidebar === 'search' && selectedId && (
              <MessageSearchSidebar 
                conversationId={selectedId}
                onClose={() => setRightSidebar(null)}
              />
            )}
            {rightSidebar === 'members' && selectedConversation && (
              <MembersSidebar 
                conversationId={selectedId || 0}
                conversationName={selectedConversation.name || ""}
                onlineUsers={onlineUsers}
                onClose={() => setRightSidebar(null)}
              />
            )}
            {rightSidebar === 'board' && selectedConversation && (
              <GroupBoard 
                conversationId={selectedId || 0}
                token={token || ""}
                onGoToMessage={(id) => (window as any).scrollToMsg?.(id)}
                onUnpin={(id) => togglePinMessage(id)}
                lastPinSignal={pinnedMessages}
                onClose={() => setRightSidebar(null)}
              />
            )}
            {rightSidebar === 'notes' && (
              <ProjectNotes 
                onClose={() => {
                   setRightSidebar(null);
                   if(activeTab === 'notes') setActiveTab('chat');
                }}
              />
            )}
        </div>
      </div>

      {/* 5. Notifications Modal (Big Central Modal) */}
      {showNotifModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowNotifModal(false)} />
          <div className="w-full max-w-2xl bg-card border shadow-2xl rounded-3xl overflow-hidden relative animate-in zoom-in-95 duration-200 flex flex-col max-h-[80vh]">
             <header className="p-6 border-b flex items-center justify-between bg-primary/5">
                <div className="flex items-center gap-4">
                   <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                      <Bell className="h-6 w-6 text-primary" />
                   </div>
                   <div>
                      <h2 className="text-xl font-black uppercase tracking-tight">Thông báo hệ thống</h2>
                      <p className="text-xs font-bold text-primary/60 uppercase tracking-widest">Trung tâm quản lý Lumi</p>
                   </div>
                </div>
                <Button variant="ghost" size="icon" onClick={() => setShowNotifModal(false)} className="rounded-xl h-10 w-10">
                   <X className="h-6 w-6" />
                </Button>
             </header>
             <ScrollArea className="flex-1 p-6">
                <div className="space-y-4">
                   {notifications.length > 0 ? (
                      notifications.map((n: any) => (
                        <div key={n.id} className="p-5 rounded-2xl bg-muted/30 border border-primary/5 hover:border-primary/20 transition-all group">
                           <div className="flex justify-between items-start gap-4">
                              <p className="font-black text-sm uppercase tracking-tight text-primary">{n.sender || 'Hệ thống'}</p>
                              <span className="text-[10px] font-black opacity-30 uppercase">{new Date(n.time).toLocaleString('vi-VN', { hour12: false })}</span>
                           </div>
                           <p className="text-sm mt-2 leading-relaxed opacity-80">{n.message}</p>
                        </div>
                      ))
                   ) : (
                      <div className="flex flex-col items-center justify-center py-20 opacity-20 italic">
                         <Search className="h-12 w-12 mb-4" />
                         <p className="font-bold uppercase tracking-widest">Chưa có thông báo mới</p>
                      </div>
                   )}
                </div>
             </ScrollArea>
             <footer className="p-6 border-t bg-muted/20 flex justify-end">
                <Button variant="outline" onClick={() => setShowNotifModal(false)} className="rounded-xl px-8 font-black uppercase tracking-widest text-xs">Đóng</Button>
             </footer>
          </div>
        </div>
      )}
      {/* 6. Calendar Integration (Personal Schedule) */}
      {showCalendar && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
           <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in" onClick={() => setShowCalendar(false)} />
           <div className="w-full max-w-5xl bg-card border shadow-2xl rounded-3xl overflow-hidden relative animate-in slide-in-from-bottom-10 duration-300 flex flex-col h-[80vh]">
              <header className="p-6 bg-primary text-primary-foreground flex justify-between items-center shrink-0">
                 <h2 className="text-xl font-black uppercase tracking-tighter flex items-center gap-3"><CalendarIcon className="h-6 w-6" /> Lịch công tác cá nhân</h2>
                 <Button variant="ghost" size="icon" onClick={() => setShowCalendar(false)} className="text-white"><X className="h-6 w-6" /></Button>
              </header>
              <div className="flex-1 overflow-hidden">
                  <PersonalCalendar token={token || ""} userRole={user?.role} />
              </div>
           </div>
        </div>
      )}

      {/* 5. Create Event Modal */}
      <CreateEventModal 
        token={token || ""}
        isOpen={showCreateEvent}
        onClose={() => setShowCreateEvent(false)}
        conversationName={selectedConversation?.name}
        initialParticipants={selectedConversation ? [user?.id, selectedConversation.otherUserId].filter((id): id is number => !!id) : []}
      />
    </div>
  )
}

