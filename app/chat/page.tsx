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
      if (lastMsg) {
        if (selectedConversation?.id !== lastMsg.conversationId && lastMsg.sender !== user?.fullName) {
          setUnreadCounts(prev => ({
            ...prev,
            [lastMsg.conversationId]: (prev[lastMsg.conversationId] || 0) + 1
          }))
        }

        // Optimistically update conversation list sorting and lastMessage content
        setConversations(prev => {
          const newConvs = [...prev]
          const targetIdx = newConvs.findIndex(c => c.id === lastMsg.conversationId)
          if (targetIdx !== -1) {
            newConvs[targetIdx] = {
              ...newConvs[targetIdx],
              lastMessage: {
                encryptedContent: lastMsg.message,
                createdAt: lastMsg.time instanceof Date ? lastMsg.time.toISOString() : lastMsg.time
              },
              lastMessageAt: lastMsg.time instanceof Date ? lastMsg.time.toISOString() : lastMsg.time
            }
            // Move to top
            const target = newConvs.splice(targetIdx, 1)[0]
            newConvs.unshift(target)
          }
          return newConvs
        })
      }
    }
  }, [realtimeMessages, selectedConversation, user])

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
        {selectedConversation && selectedConversation.type === 'Group' && (
          <div className={`transition-all duration-300 ease-in-out shrink-0 overflow-hidden ${showDesktopMembers ? 'w-80 border-l opacity-100' : 'w-0 border-none opacity-0'}`}>
            <MembersSidebar
              conversationId={selectedConversation.id}
              conversationName={selectedConversation.name}
              onlineUsers={onlineUsers}
            />
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
