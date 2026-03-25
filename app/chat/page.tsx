'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { conversationsApi } from '@/lib/api'
import { ChatSidebar } from '@/components/chat/chat-sidebar'
import { ChatArea } from '@/components/chat/chat-area'
import { MembersSidebar } from '@/components/chat/members-sidebar'
import { MobileNavigation } from '@/components/chat/mobile-navigation'
import { useSignalR } from '@/hooks/use-signalr'

export interface Conversation {
  id: number
  name: string
  type: string
  lastMessageAt: string
  lastMessage: { encryptedContent: string; createdAt: string } | null
  otherUserId?: number
}

export default function ChatPage() {
  const { token, user } = useAuth()
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [showMobileMembers, setShowMobileMembers] = useState(false)
  const [showDesktopMembers, setShowDesktopMembers] = useState(false)
  const [isLoadingConversations, setIsLoadingConversations] = useState(true)
  const [unreadCounts, setUnreadCounts] = useState<Record<number, number>>({})
  const { isConnected, onlineUsers, messages: realtimeMessages } = useSignalR()

  useEffect(() => {
    const loadConversations = async () => {
      if (!token) return
      try {
        const data = await conversationsApi.getMyConversations(token)
        setConversations(data)

        if (data.length > 0) {
          setSelectedConversation(data[0])
        }

      } catch (error) {
        console.error('Failed to load conversations:', error)
      } finally {
        setIsLoadingConversations(false)
      }
    }

    loadConversations()

  }, [token])

  useEffect(() => {
    if (realtimeMessages.length > 0) {
      const lastMsg = realtimeMessages[realtimeMessages.length - 1]
      if (lastMsg && selectedConversation?.id !== lastMsg.conversationId) {
        setUnreadCounts(prev => ({
          ...prev,
          [lastMsg.conversationId]: (prev[lastMsg.conversationId] || 0) + 1
        }))
      }
    }
  }, [realtimeMessages, selectedConversation])

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setUnreadCounts(prev => ({ ...prev, [conversation.id]: 0 }))
    setShowMobileChat(true)
    setShowMobileMembers(false)
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
          className="flex-1"
        />
        
        {/* Right sidebar - Members */}
        {selectedConversation && selectedConversation.type === 'Group' && showDesktopMembers && (
          <MembersSidebar
            conversationId={selectedConversation.id}
            conversationName={selectedConversation.name}
            onlineUsers={onlineUsers}
          />
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
