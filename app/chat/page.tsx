'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
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
  lastMessage: { encryptedContent: string; createdAt: string; messageType?: string; senderId?: number } | null
  avatarPath?: string
  backgroundPath?: string
  otherUserId?: number
  unreadCount?: number
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
  const { isConnected, onlineUsers, lastMessage, lastGroupUpdate, lastUserUpdate, markAsRead } = useSignalR()

  useEffect(() => {
    const loadConversations = async () => {
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

        if (data.length > 0 && !selectedConversation) {
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
        // Only increment unread if NOT the current conversation AND not own message
        const isOwn = lastMessage.senderId === user?.id
        
        if (selectedConversation?.id !== lastMessage.conversationId && !isOwn) {
          setUnreadCounts(prev => ({
            ...prev,
            [lastMessage.conversationId]: (prev[lastMessage.conversationId] || 0) + 1
          }))
        } else if (selectedConversation?.id === lastMessage.conversationId && !isOwn) {
          // If we ARE in the conversation, mark it as read immediately on backend
          markAsRead(lastMessage.conversationId)
        }

        // Optimistically update conversation list sorting and lastMessage content
        setConversations(prev => {
          const newConvs = [...prev]
          const targetIdx = newConvs.findIndex(c => c.id === lastMessage.conversationId)
          if (targetIdx !== -1) {
            newConvs[targetIdx] = {
              ...newConvs[targetIdx],
              lastMessage: {
                encryptedContent: lastMessage.message,
                createdAt: lastMessage.time.toISOString(),
                messageType: lastMessage.messageType,
                senderId: lastMessage.senderId
              },
              lastMessageAt: lastMessage.time.toISOString()
            }
            // Move to top
            const target = newConvs.splice(targetIdx, 1)[0]
            newConvs.unshift(target)
          }
          return newConvs
        })
    }
  }, [lastMessage, selectedConversation, user, markAsRead])

  const handleSelectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation)
    setUnreadCounts(prev => ({ ...prev, [conversation.id]: 0 }))
    setShowMobileChat(true)
    setShowMobileMembers(false)

    if (token) {
      try {
        await conversationsApi.markConversationRead(token, conversation.id)
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
