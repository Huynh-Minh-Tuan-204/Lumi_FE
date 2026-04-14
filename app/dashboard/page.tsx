'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { adminApi, conversationsApi } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Users, MessageSquare, Activity, Bell, UserPlus } from 'lucide-react'
import Link from 'next/link'


interface Stats {
  totalUsers: number
  activeUsers: number
  totalGroups: number
  recentNotifications: number
}

export default function DashboardPage() {
  const { token, user } = useAuth()
  const [stats, setStats] = useState<Stats>({
    totalUsers: 0,
    activeUsers: 0,
    totalGroups: 0,
    recentNotifications: 0
  })

  const [recentUsers, setRecentUsers] = useState<
    {
      id: number
      fullName: string
      role: string
      isActive: boolean
    }[]
  >([])

  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const loadData = async () => {
      if (!token) return

      try {
        const users = await adminApi.getAllUsers(token)
        const conversations = await conversationsApi.getMyConversations(token)
        const announcements = await adminApi.getAnnouncements(token)

        setStats({
          totalUsers: users.length,
          activeUsers: users.filter((u: any) => u.isActive).length,
          totalGroups: conversations.length,
          recentNotifications: announcements.length
        })

        setRecentUsers(
          users.slice(0, 5).map((u: any) => ({
            id: u.id,
            fullName: u.fullName,
            role: u.role,
            isActive: u.isActive
          }))
        )
      } catch (error) {
        console.error('Failed to load dashboard data:', error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [token])





  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)

  const isAdmin = user?.role === 'Admin'

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            Chào mừng trở lại, {user?.fullName?.split(' ')[0]}
          </h2>
          <p className="text-muted-foreground">
            Đây là những gì đang diễn ra trong tổ chức của bạn hôm nay.
          </p>
        </div>

        {isAdmin && (
          <Button asChild>
            <Link href="/dashboard/users">
              <UserPlus className="mr-2 h-4 w-4" />
              Thêm người dùng
            </Link>
          </Button>
        )}
      </div>
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tổng số người dùng</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats.totalUsers}
            </div>
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Đang tải...' : `${stats.activeUsers} hoạt động`}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Người dùng đang hoạt động</CardTitle>
            <Activity className="h-4 w-4 text-online"/>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold text-online">
              {isLoading ? '-' : stats.activeUsers}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Nhóm trò chuyện</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats.totalGroups}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Thông báo</CardTitle>
            <Bell className="h-4 w-4 text-muted-foreground"/>
          </CardHeader>

          <CardContent>
            <div className="text-2xl font-bold">
              {isLoading ? '-' : stats.recentNotifications}
            </div>
          </CardContent>
        </Card>

      </div>

      {/* Recent users */}
      <Card>
        <CardHeader>
          <CardTitle>Người dùng mới</CardTitle>
          <CardDescription>Người dùng đăng ký gần đây</CardDescription>
        </CardHeader>

        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              Đang tải...
            </div>
          ) : (
            <div className="space-y-4">
              {recentUsers.map((u) => (
                <div key={u.id} className="flex items-center gap-3">
                  <Avatar>
                    <AvatarFallback>
                      {getInitials(u.fullName)}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <p className="font-medium">{u.fullName}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.role}
                    </p>
                  </div>

                  <span
                    className={`h-2 w-2 rounded-full ${
                      u.isActive ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>


    </div>
  )
}