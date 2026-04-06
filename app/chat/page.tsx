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
import { cn } from '@/lib/utils'

export interface Conversation {
  id: number
  name: string
  type: string
  avatarPath?: string
  backgroundPath?: string
  lastMessage?: string
  lastMessageTime?: string
  unreadCount?: number
  createdBy?: number
}

export default function ChatPage() {
  const { token, user } = useAuth()
  const { pinnedMessages } = useSignalR()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [rightSidebar, setRightSidebar] = useState<'members' | 'board' | 'search' | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const selectedConversation = conversations.find((c) => c.id === selectedId) || null

  const loadConversations = async () => {
    if (!token) return
    try {
      // Use getMyConversations as corrected
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

  const handleSelectConversation = (id: number) => {
    setSelectedId(id)
    setIsSidebarOpen(false) 
    setRightSidebar(null) 
  }

  const toggleBoard = () => setRightSidebar(prev => prev === 'board' ? null : 'board')
  const toggleMembers = () => setRightSidebar(prev => prev === 'members' ? null : 'members')
  const toggleSearch = () => setRightSidebar(prev => prev === 'search' ? null : 'search')

  // Register global toggle and scroll utilities
  useEffect(() => {
    (window as any).toggleSearch = toggleSearch;
    (window as any).scrollToMsg = (msgId: number) => {
        const el = document.getElementById(`message-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            el.classList.add('bg-primary/20');
            setTimeout(() => el.classList.remove('bg-primary/20'), 2000);
        }
    };

    return () => { 
      delete (window as any).toggleSearch;
      delete (window as any).scrollToMsg;
    }
  }, [rightSidebar]) // Re-bind if needed or just empty deps if handlers are stable

  return (
    <div className="flex h-screen bg-background overflow-hidden relative">
      {/* Left Chat Sidebar */}
      <div 
        className={cn(
          "w-80 border-r shrink-0 h-full flex flex-col transition-all duration-300 z-30 bg-background",
          !isSidebarOpen && "md:w-80 -ml-80 md:ml-0"
        )}
      >
        <ChatSidebar 
          conversations={conversations}
          onSelect={handleSelectConversation}
          onRefresh={loadConversations}
        />
      </div>

      {/* Main Container: Chat Area + Right Sidebar Parent */}
      <div className="flex-1 flex min-w-0 h-full overflow-hidden relative">
        <main className="flex-1 h-full min-w-0 transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]">
          <ChatArea 
            conversation={selectedConversation}
            onBack={() => setIsSidebarOpen(true)}
            onShowMembers={toggleMembers}
            onToggleBoard={toggleBoard}
            onRefreshConversations={loadConversations}
            isMobile={!isSidebarOpen}
          />
        </main>

        {/* Dynamic Right Sidebars Containers */}
        
        {/* Members Sidebar */}
        <div 
          className={cn(
            "fixed md:relative top-0 right-0 h-full bg-background border-l transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] z-40 md:z-20 overflow-hidden",
            rightSidebar === 'members' ? "w-80" : "w-0 border-none"
          )}
        >
          <div className="w-80 h-full">
            <MembersSidebar 
              conversationId={selectedId || 0} 
            />
          </div>
        </div>

        {/* Group News Board Sidebar */}
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

        {/* Message Search Sidebar */}
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
      </div>
    </div>
  )
}
