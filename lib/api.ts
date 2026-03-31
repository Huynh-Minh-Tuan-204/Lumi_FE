
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';

interface ApiOptions extends RequestInit {
  token?: string
}

class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  const { token, ...fetchOptions } = options

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'ngrok-skip-browser-warning': 'true',
    ...(options.headers || {}),
  }

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    let message = `Request failed (${response.status})`

    try {
      if (contentType.includes('application/json')) {
        const data = await response.json()
        message =
          data?.error ||
          data?.message ||
          // ASP.NET Core ModelState errors (nếu có)
          (data?.errors && typeof data.errors === 'object'
            ? Object.values<string[]>(data.errors).flat()[0]
            : null) ||
          message
      } else {
        const text = await response.text()
        message = text || message
      }
    } catch {
      // ignore parse errors
    }

    throw new ApiError(message, response.status)
  }

  const text = await response.text()
  if (!text) {
    return {} as T
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    return text as unknown as T
  }
}

// ========== DTOs PascalCase (khớp C# fullBE) ==========
export interface LoginDto {
  Username: string
  Password: string
}

export interface RegisterDto {
  EmployeeCode: string
  Username: string
  Password: string
  FullName: string
  Email: string
  Phone: string
  RoleId: number
}

export interface RefreshTokenRequestDto {
  RefreshToken: string
}

export interface TokenResponseDto {
  AccessToken: string
  RefreshToken: string
}

// Response từ API (ASP.NET Core mặc định camelCase)
export interface LoginResponse {
  accessToken: string
  refreshToken: string
  isFirstLogin: boolean
  message: string
}

export interface AuthMeResponse {
  id: number
  username: string
  fullName: string
  email: string
  employeeCode: string
  avatarPath: string
  role: string
  isFirstLogin: boolean
}

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

export interface ConversationsListItemResponse {
  id: number
  name: string
  type: string
  avatarPath?: string
  backgroundPath?: string
  lastMessageAt: string
  lastMessage: { encryptedContent: string; createdAt: string; messageType?: string; senderId?: number } | null
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
  // Fallbacks if backend is strictly PascalCase
  Id?: number
  SenderId?: number
  EncryptedContent?: string
  Iv?: string
  CreatedAt?: string
  MessageType?: string
  SenderName?: string
  AvatarPath?: string
  attachments?: Array<{
    id: number
    fileName: string
    encryptedFilePath: string
    fileSize: number
    mimeType: string
  }>
}

export interface AttachmentUploadResponseDto {
  id: number;
  fileName: string;
  encryptedFilePath: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: number;
  uploadedAt: string;
}

export interface CreateGroupDto {
  Name: string;
  MemberIds: number[];
}

export interface AddMemberDto {
  UserId: number;
  RoleInConversation: string;
}

export interface CreateAnnouncementDto {
  Message: string;
  IV: string;
}

export interface StartMeetingDto {
  Title: string;
  ScheduledAt?: string;
  ParticipantIds: number[];
}


// ========== Auth API (api/Auth/*) ==========
export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>('/Auth/login', {
      method: 'POST',
      body: JSON.stringify({ Username: username, Password: password } as LoginDto),
    }),

  refreshToken: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/Auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ RefreshToken: refreshToken } as RefreshTokenRequestDto),
    }),

  getMe: (token: string) =>
    request<AuthMeResponse>('/Auth/me', { token }),

  logoutAll: (token: string) =>
    request<{ message: string }>('/Auth/logout-all', { method: 'POST', token }),

  uploadAvatar: (token: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return fetch(`${API_BASE_URL}/Users/avatar`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'ngrok-skip-browser-warning': 'true'
      },
      body: formData
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status);
      return res.json() as Promise<{ avatarPath: string }>;
    });
  },

  changePasswordFirstTime: (token: string, oldPassword: string, newPassword: string) =>
    request<{ message: string }>('/Auth/change-password-first-time', {
      method: 'POST',
      token,
      body: JSON.stringify({ OldPassword: oldPassword, NewPassword: newPassword }),
    }),
}

// ========== Admin API (api/Admin/*) ==========
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
      body: JSON.stringify({ RoleId: roleId }),
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
  sendAnnouncement: async (token: string, message: string, userIds?: number[]) => {
    const res = await fetch(`${API_BASE_URL}/Announcements`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true",
      },
      body: JSON.stringify({
        Message: message,
        UserIds: userIds || [] // Empty array or null usually means broadcast all on backend
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("Announcement API error:", text);
      throw new Error(text || "Failed to send announcement");
    }

    return res.json();
  },
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

// ========== Conversations API (api/Conversations/*) ==========
export const conversationsApi = {
  getMyConversations: (token: string) =>
    request<ConversationsListItemResponse[]>('/Conversations/my', { token }), // updated to /my to match backend

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
}

// ========== Attachments API (api/Attachments/*) ==========
export const attachmentsApi = {
  upload: (token: string, file: File, conversationId?: number, messageId?: number) => {
    const formData = new FormData()
    formData.append('file', file)
    if (conversationId) formData.append('conversationId', conversationId.toString())
    if (messageId) formData.append('messageId', messageId.toString())

    // Custom fetch because of FormData
    return fetch(`${API_BASE_URL}/Attachments/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        "ngrok-skip-browser-warning": "true"
      },
      body: formData
    }).then(async res => {
      if (!res.ok) throw new ApiError(await res.text(), res.status);
      return res.json() as Promise<AttachmentUploadResponseDto>;
    });
  },

  getAttachment: (token: string, id: number) =>
    request<any>(`/Attachments/${id}`, { token }),

  deleteAttachment: (token: string, id: number) =>
    request<any>(`/Attachments/${id}`, { method: 'DELETE', token }),
}

// ========== Meetings (Calls) API (api/Meetings/*) ==========
export const meetingsApi = {
  getMeeting: (token: string, id: number) =>
    request<any>(`/Meetings/${id}`, { token }),

  getConversationMeeting: (token: string, conversationId: number) =>
    request<any>(`/Meetings/conversation/${conversationId}`, { token }),

  startMeeting: (token: string, conversationId: number, title: string, participantIds: number[], callType: string = 'video') =>
    request<any>(`/Meetings/start/${conversationId}`, {
      method: 'POST',
      body: JSON.stringify({ Title: title, Type: callType, ParticipantIds: participantIds }),
      token,
    }),

  joinMeeting: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/join`, { method: 'POST', token }),

  leaveMeeting: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/leave`, { method: 'POST', token }),

  endMeeting: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/end`, { method: 'POST', token }),

  declineCall: (token: string, id: number) =>
    request<any>(`/Meetings/${id}/decline`, { method: 'POST', token }),

  getParticipants: (token: string, id: number) =>
    request<any[]>(`/Meetings/${id}/participants`, { token }),
}

// ========== Announcements API ==========
export const announcementsApi = {
  getAnnouncements: (token: string) =>
    request<any[]>('/Announcements', { token }),

  createAnnouncement: (token: string, message: string, iv: string) =>
    request<any>('/Announcements', {
      method: 'POST',
      body: JSON.stringify({ Message: message, IV: iv }),
      token,
    }),
  markAllRead: (token: string) =>
    request<any>('/Announcements/read', {
      method: 'POST',
      token,
    }),
}

// ========== Work Schedules API (api/WorkSchedules/*) ==========
export interface ScheduleParticipant {
  userId: number;
  fullName: string;
  avatarPath: string;
  status: string;
}

export interface WorkScheduleResponse {
  id: number;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location: string;
  userRole: string;
  participants: ScheduleParticipant[];
}

export const schedulesApi = {
  getMySchedules: (token: string) =>
    request<WorkScheduleResponse[]>('/WorkSchedules', { token }),

  create: (token: string, data: { title: string; description?: string; startTime: string; endTime: string; location?: string; participantIds?: number[] }) =>
    request<{ message: string; id: number }>('/WorkSchedules', {
      method: 'POST',
      body: JSON.stringify(data),
      token,
    }),

  updateStatus: (token: string, id: number, status: string) =>
    request<{ message: string }>(`/WorkSchedules/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(status), // the backend expects [FromBody] string status but wait it's plain string. Let's send as json string: JSON.stringify(status) or just a JSON object. Actually [FromBody] string status in .NET means sending exactly `"Accepted"` with quotes. So JSON.stringify(status) works.
      token,
    }),

  delete: (token: string, id: number) =>
    request<void>(`/WorkSchedules/${id}`, {
      method: 'DELETE',
      token,
    }),
}

export { ApiError }
