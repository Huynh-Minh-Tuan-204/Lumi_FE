import { request } from './base'
import { RegisterDto } from '@/types/api.types'

export interface AdminUserResponse {
  id: number
  username: string
  fullName: string
  email: string
  employeeCode: string
  phone: string
  isActive: boolean
  isOnline: boolean
  avatarPath: string
  roleName: string
}

export interface AdminConversationResponse {
  id: number
  name: string
  type: string
  lastMessage: string | null
}

export const adminApi = {
  getAllUsers: (token: string) =>
    request<AdminUserResponse[]>('/Admin/get-all-users', { token }),

  createUser: (token: string, data: RegisterDto) =>
    request<{ message: string }>('/Auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  updateUser: (token: string, id: number, data: { fullName?: string, email?: string, phone?: string, isActive?: boolean }) =>
    request<{ message: string }>(`/Admin/update-user/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
      token,
    }),

  changeRole: (token: string, id: number, roleId: number) =>
    request<{ message: string }>(`/Admin/change-role/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ roleId: roleId }),
      token,
    }),

  deleteUser: (token: string, id: number) =>
    request<{ message: string }>(`/Admin/delete-user/${id}`, {
      method: 'DELETE',
      token,
    }),

  getAnnouncements: (token: string) =>
    request<Array<{ id: number; senderName: string; message: string; timestamp: string }>>(
      '/Announcements',
      { token }
    ),
    
  sendAnnouncement: (token: string, data: { title: string, encryptedContent: string, iv: string, signature: string, userIds?: number[], category?: string, forceConfirmed?: boolean }) =>
    request<any>('/Announcements', {
      method: "POST",
      body: JSON.stringify({
        title: data.title,
        encryptedContent: data.encryptedContent,
        iv: data.iv,
        signature: data.signature,
        userIds: data.userIds,
        category: data.category || "General",
        forceConfirmed: data.forceConfirmed || false
      }),
      token,
    }),
    
  getMyConversations: (token: string) =>
    request<AdminConversationResponse[]>('/Admin/my-conversations', { token }),

  getGroupMembers: (token: string, convId: number) =>
    request<Array<{ id: number; fullName: string; avatarPath: string; isActive: boolean }>>(
      `/Admin/group-members/${convId}`,
      { token }
    ),

  getChatHistory: (token: string, convId: number) =>
    request<Array<{ sender: string; message: string; time: string; isSystem: boolean }>>(
      `/Admin/chat-history/${convId}`,
      { token }
    ),

  createGroup: (token: string, groupName: string) =>
    request<{ id: number; message: string }>('/Admin/create-group', {
      method: 'POST',
      body: JSON.stringify(groupName),
      token,
    }),

  addMemberToGroup: (token: string, conversationId: number, userId: number) =>
    request<{ message?: string }>(
      `/Admin/add-member-to-group?conversationId=${conversationId}&userId=${userId}`,
      { method: 'POST', token }
    ),

  deleteGroup: (token: string, conversationId: number) =>
    request<{ message?: string }>(`/Groups/${conversationId}`, {
      method: 'DELETE',
      token,
    }),
}


export const usersApi = {
  updatePublicKey: (token: string, data: { publicKey?: string, rsaPublicKey?: string }) =>
    request<void>('/Users/me/public-key', {
      method: 'PUT',
      token,
      body: JSON.stringify(data),
    }),
}
