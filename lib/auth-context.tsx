'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'
import { authApi, ApiError } from './api'

export interface User {
  id: number
  username: string
  fullName: string
  email: string
  employeeCode: string
  avatarPath: string
  role: 'Admin' | 'Manager' | 'Employee'
  isFirstLogin: boolean
}

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => void
  updateUser: (data: Partial<User>) => void
  error: string | null
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const TOKEN_KEY = 'lumi_access_token'
const REFRESH_TOKEN_KEY = 'lumi_refresh_token'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const logout = useCallback(() => {
    setUser(null)
    setToken(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(REFRESH_TOKEN_KEY)
    window.location.href = '/' // Force redirect security
  }, [])

  const updateUser = useCallback((data: Partial<User>) => {
    setUser(prev => prev ? { ...prev, ...data } : null)
  }, [])

  const tryRefreshToken = useCallback(async (): Promise<string | null> => {
    const storedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!storedRefreshToken) return null

    try {
      const refreshed = await authApi.refreshToken(storedRefreshToken)
      localStorage.setItem(TOKEN_KEY, refreshed.accessToken)
      localStorage.setItem(REFRESH_TOKEN_KEY, refreshed.refreshToken)
      return refreshed.accessToken
    } catch {
      return null
    }
  }, [])

  const fetchUser = useCallback(async (accessToken: string) => {
    try {
      const userData = await authApi.getMe(accessToken)
      setUser({
        ...userData,
        role: userData.role as 'Admin' | 'Manager' | 'Employee',
        isFirstLogin: userData.isFirstLogin
      })
      setToken(accessToken)
    } catch (err) {
      // Token hết hạn/không hợp lệ -> thử refresh token rồi gọi lại /me
      if (err instanceof ApiError && err.status === 401) {
        const newAccessToken = await tryRefreshToken()
        if (newAccessToken) {
          await fetchUser(newAccessToken)
          return
        }
      }
      logout()
    }
  }, [logout, tryRefreshToken])

  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem(TOKEN_KEY)
      if (storedToken) {
        await fetchUser(storedToken)
      }
      setIsLoading(false)
    }
    initAuth()
  }, [fetchUser])

  const login = async (username: string, password: string) => {
    setError(null)
    setIsLoading(true)
    try {
      const response = await authApi.login(username, password)
      localStorage.setItem(TOKEN_KEY, response.accessToken)
      localStorage.setItem(REFRESH_TOKEN_KEY, response.refreshToken)
      await fetchUser(response.accessToken)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Login failed'
      setError(message)
      throw err
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: !!user,
        login,
        logout,
        updateUser,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
