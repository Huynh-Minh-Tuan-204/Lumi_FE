import { request, ApiError } from './base'
import { API_BASE_URL } from '@/constants/api.constants'
import { CreateGroupDto } from '@/types/api.types'

export interface ConversationsListItemResponse {
  id: number
  name: string
  type: string
  avatarPath?: string
  backgroundPath?: string
  lastMessageAt: string
  lastMessage: { content?: string; encryptedContent?: string; createdAt: string; messageType?: string; senderId?: number } | null
  otherUserId?: number
  unreadCount?: number
}

export interface MessageResponse {
  id: number
  senderId: number
  encryptedContent: string
  iv: string
  createdAt: string
  messageType: string
  senderName?: string
  avatarPath?: string
  Id?: number
  SenderId?: number
  EncryptedContent?: string
  Iv?: string
  CreatedAt?: string
  MessageType?: string
  SenderName?: string
  AvatarPath?: string
  isPinned?: boolean
  IsPinned?: boolean
  attachments?: Array<{
    id: number
    fileName: string
    encryptedFilePath: string
    fileSize: number
    mimeType: string
    iv?: string
    signature?: string
  }>
}

export const conversationsApi = {
  getMyConversations: (token: string) =>
    request<ConversationsListItemResponse[]>('/Conversations/my', { token }),

  getMessages: (token: string, conversationId: number) =>
    request<MessageResponse[]>(`/Conversations/${conversationId}/messages`, { token }),

  markConversationRead: (token: string, conversationId: number) =>
    request<void>(`/Conversations/${conversationId}/read`, {
      method: 'POST',
      token,
    }),

  createPrivate: (token: string, otherUserId: number) =>
    request<{ id: number; name: string; type: string }>('/Conversations/private', {
      method: 'POST',
      body: JSON.stringify({ OtherUserId: otherUserId }),
      token,
    }),

  createGroup: (token: string, data: CreateGroupDto) =>
    request<{ id: number; name: string; type: string }>('/Conversations/group', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  addMember: (token: string, id: number, userId: number, role: string = "Member") =>
    request<any>(`/Conversations/${id}/members`, {
      method: 'POST',
      body: JSON.stringify({ UserId: userId, RoleInConversation: role }),
      token,
    }),

  removeMember: (token: string, id: number, userId: number) =>
    request<any>(`/Conversations/${id}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  leaveConversation: (token: string, id: number) =>
    request<any>(`/Conversations/${id}/leave`, {
      method: 'POST',
      token,
    }),

  renameConversation: (token: string, id: number, name: string) =>
    request<{ message: string; name: string }>(`/Conversations/${id}/name`, {
      method: 'PUT',
      body: JSON.stringify({ Name: name }),
      token,
    }),

  deleteConversation: (token: string, id: number) =>
    request<any>(`/Conversations/${id}`, {
      method: 'DELETE',
      token,
    }),

  getAvailableUsers: (token: string, id: number) =>
    request<any[]>(`/Conversations/${id}/available-users`, { token }),

  sendMessage: (
    token: string,
    conversationId: number,
    encryptedContent: string,
    iv: string
  ) =>
    request(`/Conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify({
        ConversationId: conversationId,
        EncryptedContent: encryptedContent,
        IV: iv
      }),
      token
    }),

  uploadGroupAvatar: (token: string, conversationId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE_URL}/Conversations/${conversationId}/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true"
      },
      body: formData
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status);
      return res.json() as Promise<{ avatarPath: string }>;
    });
  },

  uploadGroupBackground: (token: string, conversationId: number, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE_URL}/Conversations/${conversationId}/background`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true"
      },
      body: formData
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status);
      return res.json() as Promise<{ backgroundPath: string }>;
    });
  },

  disband: (token: string, id: number) =>
    request<any>(`/Conversations/${id}/disband`, {
      method: 'POST',
      token,
    }),

  leave: (token: string, id: number, userId: number) =>
    request<any>(`/Conversations/${id}/members/${userId}`, {
      method: 'DELETE',
      token,
    }),

  deleteMessage: (token: string, id: number) =>
    request<any>(`/Messages/${id}`, {
      method: 'DELETE',
      token,
    }),
}

