import { API_BASE_URL } from '@/constants/api.constants';

export interface ApiOptions extends RequestInit {
  token?: string
}

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function request<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
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
          (data?.errors && typeof data.errors === 'object'
            ? Object.values<string[]>(data.errors).flat()[0]
            : null) ||
          message

        if (response.status === 403 && message === 'MUST_CHANGE_PASSWORD' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('auth-must-change-password'));
        }
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

