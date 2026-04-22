export interface ChatMessage {
  id: number
  conversationId: number
  senderId: number
  sender: string
  message: string
  time: Date
  iv?: string
  messageType?: string
  attachments?: any[]
  avatarPath?: string
  stickerUrl?: string
  isPinned?: boolean
  isSystem?: boolean
  isRead?: boolean
  parentMessageId?: number
}

export interface SignalRHookReturn {
  isConnected: boolean
  isReconnecting: boolean
  sendMessage: (conversationId: number, plaintext: string, messageType?: string, parentMessageId?: number) => Promise<void>
  sendNotification: (message: string) => Promise<void>
  lastMessage: ChatMessage | null
  lastReadUpdate: { conversationId: number, userId: number } | null
  onTriggeredReminder: (callback: (data: { conversationId: number, content: string }) => void) => void
  notifications: ChatMessage[]
  onlineUsers: Set<number>
  incomingCall: { meetingId: string; callerName: string; callType: string; convName: string } | null
  clearIncomingCall: () => void
  callDeclined: { meetingId: string; declinerName: string } | null
  clearCallDeclined: () => void
  markAsRead: (conversationId: number) => Promise<void>
  lastGroupUpdate: { conversationId: number, avatarPath?: string, backgroundPath?: string } | null
  sendTyping: (conversationId: number) => Promise<void>
  typingUsers: { conversationId: number, userId: number, userName: string }[]
  lastUserUpdate: { userId: number, avatarPath: string } | null
  sendSticker: (conversationId: number, stickerUrl: string) => Promise<void>
  togglePinMessage: (messageId: number) => Promise<void>
  sendReminder: (conversationId: number, content: string, remindAtIso: string) => Promise<void>
  pinnedMessages: { messageId: number, isPinned: boolean, pinnedBy?: number, conversationId: number } | null
  lastDeletedMessage: { conversationId: number, messageId: number } | null
  markAllNotificationsRead: () => Promise<void>
  lastScheduleUpdate: { type: 'created' | 'status' | 'deleted', data: any } | null
  lastUserLeft: number | null
  activeMeeting: { meetingId: string; conversationId: number; title: string; callType: string; hostName: string } | null
  initiateE2EEHandshake: (conversationId: number) => Promise<void>
  hideMessageForMe: (messageId: number) => Promise<void>
  mySenderKey: CryptoKey | null
  mySenderKeys: Map<number, CryptoKey>
  peerSenderKeys: Map<number, CryptoKey>
  peerIdentityKeys: Map<number, CryptoKey>
  identityKeys: CryptoKeyPair | null
  keyVersion: number
  lastLeftConversationId: number | null
}

export interface Conversation {
  id: number
  name: string
  type: 'Private' | 'Group' | 'GlobalMeeting'
  lastMessage?: string
  lastMessageTime?: Date
  unreadCount?: number
  avatarPath?: string
  members?: ConversationMember[]
}

export interface ConversationMember {
  userId: number
  fullName: string
  role: string
  isOnline?: boolean
}

export interface Attachment {
  id: number
  fileName: string
  fileSize: number
  contentType: string
  iv?: string
  signature?: string
  url?: string
}

