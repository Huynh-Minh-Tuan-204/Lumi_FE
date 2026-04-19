'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSignalR } from '@/hooks/use-signalr'
import { getAvatarUrl } from '@/lib/utils'
import { adminApi } from '@/lib/api'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Search, Activity, Users, Clock, Wifi, WifiOff, Shield } from 'lucide-react'

interface UserStatus {
  id: number
  username: string
  fullName: string
  email: string
  isActive: boolean
  isOnline: boolean
  avatarPath: string
  roleName: string
}

export default function OnlineMonitorPage() {
  const { token, user } = useAuth()
  const { lastUserUpdate } = useSignalR()
  const [users, setUsers] = useState<UserStatus[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadUsers()
    // Poll for updates every 30 seconds
    const interval = setInterval(loadUsers, 30000)
    return () => clearInterval(interval)
  }, [token])

  useEffect(() => {
    if (lastUserUpdate) {
      setUsers(prev => prev.map(u => {
        if (u.id === lastUserUpdate.userId) {
          return { ...u, avatarPath: lastUserUpdate.avatarPath }
        }
        return u
      }))
    }
  }, [lastUserUpdate])

  const loadUsers = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAllUsers(token)
      setUsers(data)
    } catch (error) {
      console.error('Failed to load users:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredUsers = users.filter(
    (u) =>
      u.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.username.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const onlineUsers = filteredUsers.filter((u) => u.isOnline)
  const offlineUsers = filteredUsers.filter((u) => !u.isOnline)

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const isAdmin = user?.role === 'Admin'

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            Only administrators can view the online monitor.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Online Monitor</h2>
        <p className="text-muted-foreground">
          View and monitor user online status in real-time
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Online Now</CardTitle>
            <Activity className="h-4 w-4 text-online" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-online">
              {users.filter((u) => u.isOnline).length}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Offline</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => !u.isOnline).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Search Users</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name or username..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
        </CardContent>
      </Card>

      {/* User lists */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Online users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wifi className="h-5 w-5 text-online" />
              Online Users
              <Badge variant="secondary" className="ml-auto">
                {onlineUsers.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Currently active users
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : onlineUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mb-4 opacity-20" />
                <p>No users online</p>
              </div>
            ) : (
              <ScrollArea className="h-75">
                <div className="space-y-3">
                  {onlineUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={getAvatarUrl(u.avatarPath)} />
                          <AvatarFallback className="text-xs">
                            {getInitials(u.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{u.username}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {u.roleName}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Offline users */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <WifiOff className="h-5 w-5 text-muted-foreground" />
              Offline Users
              <Badge variant="secondary" className="ml-auto">
                {offlineUsers.length}
              </Badge>
            </CardTitle>
            <CardDescription>
              Users not currently active
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : offlineUsers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mb-4 opacity-20" />
                <p>All users are online</p>
              </div>
            ) : (
              <ScrollArea className="h-75">
                <div className="space-y-3">
                  {offlineUsers.map((u) => (
                    <div
                      key={u.id}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors opacity-60"
                    >
                      <div className="relative">
                        <Avatar className="h-10 w-10">
                          <AvatarImage src={getAvatarUrl(u.avatarPath)} />
                          <AvatarFallback className="text-xs">
                            {getInitials(u.fullName)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-muted-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{u.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          @{u.username}
                        </p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        {u.roleName}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

