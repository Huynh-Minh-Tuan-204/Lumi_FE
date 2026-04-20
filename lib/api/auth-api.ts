import { request, ApiError } from './base'
import { API_BASE_URL } from '@/constants/api.constants'
import { LoginDto, RefreshTokenRequestDto } from '@/types/api.types'

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

export const authApi = {
  login: (username: string, password: string) =>
    request<LoginResponse>('/Auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password } as LoginDto),
    }),

  refreshToken: (refreshToken: string) =>
    request<{ accessToken: string; refreshToken: string }>('/Auth/refresh-token', {
      method: 'POST',
      body: JSON.stringify({ refreshToken } as RefreshTokenRequestDto),
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
      body: JSON.stringify({ oldPassword, newPassword }),
    }),
}

