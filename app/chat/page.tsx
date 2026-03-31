'use client'

import { useState, useEffect, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi } from '@/lib/api'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ChatArea } from '@/components/chat/chat-area'
import { MembersSidebar } from '@/components/chat/members-sidebar'
import { MobileNavigation } from '@/components/chat/mobile-navigation'
import { useSignalR } from '@/hooks/use-signalr'
import { useRouter } from 'next/navigation'

export interface Conversation {
  id: number
  name: string
  type: string
  lastMessageAt: string
  lastMessage: { encryptedContent: string; createdAt: string; messageType?: string; senderId?: number } | null
  avatarPath?: string
  backgroundPath?: string
  otherUserId?: number
  unreadCount?: number
  createdBy?: number
}

export default function ChatPage() {
  const router = useRouter()
  const { token, user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [showMobileMembers, setShowMobileMembers] = useState(false)
  const [showDesktopMembers, setShowDesktopMembers] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({})
  const { isConnected, onlineUsers, lastMessage, lastGroupUpdate, lastUserUpdate, markAsRead, lastDeletedMessage } = useSignalR()

  const loadConversations = useCallback(async () => {
    if (!token) return
    try {
      const data = await conversationsApi.getMyConversations(token)
      setConversations(data)
      
      // Sync initial unread counts
      const initialUnreads: Record<number, number> = {}
      data.forEach(c => {
        if (c.unreadCount) initialUnreads[c.id] = c.unreadCount
      })
      setUnreadCounts(initialUnreads)

      // Update selected conversation metadata or set initial one
      setSelectedConversation(prev => {
        if (prev) {
          const updated = data.find(c => c.id === prev.id)
          return updated || prev
        }
        return data.length > 0 ? data[0] : null
      })

    } catch (error) {
      console.error('Failed to load conversations:', error)
    } finally {
      setIsLoadingConversations(false)
    }
  }, [token]) // removed selectedConversation from dependencies

  useEffect(() => {
    if (token) {
      loadConversations()
    }
  }, [token]) // Only reload when token changes (login/logout/refresh)

  useEffect(() => {
    if (lastGroupUpdate) {
      setConversations(prev => prev.map(c => {
        if (c.id === lastGroupUpdate.conversationId) {
          return {
            ...c,
            avatarPath: lastGroupUpdate.avatarPath || c.avatarPath,
            backgroundPath: lastGroupUpdate.backgroundPath || c.backgroundPath
          }
        }
        return c;
      }))
      
      if (selectedConversation?.id === lastGroupUpdate.conversationId) {
        setSelectedConversation(prev => prev ? {
          ...prev,
          avatarPath: lastGroupUpdate.avatarPath || prev.avatarPath,
          backgroundPath: lastGroupUpdate.backgroundPath || prev.backgroundPath
        } : null)
      }
    }
  }, [lastGroupUpdate])

  useEffect(() => {
    if (lastUserUpdate) {
      setConversations(prev => prev.map(c => {
        if (c.type === 'Private' && c.otherUserId === lastUserUpdate.userId) {
          return {
            ...c,
            avatarPath: lastUserUpdate.avatarPath
          }
        }
        return c;
      }))
      
      if (selectedConversation?.type === 'Private' && selectedConversation?.otherUserId === lastUserUpdate.userId) {
        setSelectedConversation(prev => prev ? {
          ...prev,
          avatarPath: lastUserUpdate.avatarPath
        } : null)
      }
    }
  }, [lastUserUpdate])

  useEffect(() => {
    if (lastMessage) {
        const isOwn = lastMessage.senderId === user?.id
        
        // If we are already in the conversation, mark it as read on the backend
        if (selectedConversation?.id === lastMessage.conversationId && !isOwn) {
          markAsRead(lastMessage.conversationId)
        }
        
        // Refresh conversation list to get latest LastMessage and UnreadCount
        loadConversations()
    }
  }, [lastMessage, selectedConversation, user, markAsRead, loadConversations])

  useEffect(() => {
    if (lastDeletedMessage) {
      loadConversations()
    }
  }, [lastDeletedMessage, loadConversations])

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setUnreadCounts(prev => ({ ...prev, [conversation.id]: 0 }))
    setShowMobileChat(true)
    setShowMobileMembers(false)

    if (token) {
      try {
        await conversationsApi.markConversationRead(token, conversation.id)
        // Ensure local unread is cleared and synced from server
        loadConversations()
      } catch (e) {}
    }
  }

  const handleBackToList = () => {
    setShowMobileChat(false)
    setShowMobileMembers(false)
  }

  const handleShowMembers = () => {
    setShowMobileMembers(true)
    setShowDesktopMembers(prev => !prev)
  }

  const handleHideMembers = () => {
    setShowMobileMembers(false)
  }

  return (
    <div className="flex h-screen bg-background overflow-hidden text-sidebar-foreground">
      {/* Desktop layout */}
      <div className="hidden md:flex w-full h-full min-h-0">
        {/* Left sidebar - Conversations */}
        <ChatSidebar
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={handleSelectConversation}
          isLoading={isLoadingConversations}
          isConnected={isConnected}
          user={user}
          onlineUsers={onlineUsers}
          unreadCounts={unreadCounts}
        />
        
        {/* Main chat area */}
        <ChatArea
          conversation={selectedConversation}
          onShowMembers={handleShowMembers}
          onRefreshConversations={loadConversations}
          className="flex-1"
        />
        
        {/* Right sidebar - Members */}
        {selectedConversation && selectedConversation.type === 'Group' && (
          <div 
            className={cn(
              "transition-all duration-300 ease-in-out shrink-0 overflow-hidden flex border-l bg-card",
              showDesktopMembers ? "w-80 opacity-100" : "w-0 opacity-0 border-none"
            )}
          >
            <div className="w-80 h-full">
              <MembersSidebar
                conversationId={selectedConversation.id}
                conversationName={selectedConversation.name}
                onlineUsers={onlineUsers}
              />
            </div>
          </div>
        )}
      </div>

      {/* Mobile layout */}
      <div className="md:hidden flex flex-col w-full h-full">
        {!showMobileChat ? (
          <ChatSidebar
            conversations={conversations}
            selectedConversation={selectedConversation}
            onSelectConversation={handleSelectConversation}
            isLoading={isLoadingConversations}
            isConnected={isConnected}
            user={user}
            onlineUsers={onlineUsers}
            unreadCounts={unreadCounts}
            isMobile
          />
        ) : showMobileMembers && selectedConversation ? (
          <MembersSidebar
            conversationId={selectedConversation.id}
            conversationName={selectedConversation.name}
            isMobile
            onBack={handleHideMembers}
            onlineUsers={onlineUsers}
          />
        ) : (
          <ChatArea
            conversation={selectedConversation}
            onBack={handleBackToList}
            onShowMembers={handleShowMembers}
            onRefreshConversations={loadConversations}
            isMobile
            className="flex-1"
          />
        )}
        
        {/* Mobile bottom navigation */}
        <MobileNavigation />
      </div>
    </div>
  )
}
