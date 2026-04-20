import { request } from './base'

export const announcementsApi = {
  getAnnouncements: (token: string) =>
    request<any[]>('/Announcements', { token }),

  sendAnnouncement: (token: string, data: { title: string; encryptedContent: string; iv: string; signature: string; userIds?: number[] }) =>
    request<any>('/Announcements', {
      method: 'POST',
      body: JSON.stringify({ 
        title: data.title, 
        encryptedContent: data.encryptedContent, 
        iv: data.iv, 
        signature: data.signature,
        userIds: data.userIds 
      }),
      token,
    }),

  markAllRead: (token: string) =>
    request<any>('/Announcements/read', {
      method: 'POST',
      token,
    }),
}

