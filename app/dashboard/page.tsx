'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { adminApi, conversationsApi, meetingsApi } from '@/lib/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Users, MessageSquare, Activity, Bell, UserPlus, Hash, Video, Plus, ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { toast } from 'sonner'
import { CallLobby } from '@/components/chat/call-lobby'

interface Stats {
  totalUsers: number
  activeUsers: number
  totalGroups: number
  recentNotifications: number
}

export default function DashboardPage() {
  const { token, user } = useAuth()
  const [meetingCode, setMeetingCode] = useState('')
  const [meetingName, setMeetingName] = useState('Cuộc họp nhanh')
  const [showLobby, setShowLobby] = useState<{ meetingId: string; type: 'voice' | 'video'; title: string; conversationId: number } | null>(null)

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

  const handleCreateMeeting = async () => {
    if (!token) return;
    try {
      const resp = await meetingsApi.startGlobalMeeting(token, meetingName || "Cuộc họp nhanh");
      setShowLobby({
        meetingId: resp.meetingId,
        type: 'video',
        title: resp.title,
        conversationId: resp.conversationId
      });
    } catch (e) {
      toast.error("Không thể tạo cuộc họp.");
    }
  }

  const handleJoinMeeting = async () => {
    if (!token || !meetingCode.trim()) return;
    try {
      const resp = await meetingsApi.getMeeting(token, meetingCode.trim());
      setShowLobby({
        meetingId: resp.meetingGuid,
        type: 'video',
        title: resp.title,
        conversationId: resp.conversationId
      });
    } catch (e) {
      toast.error("Mã phòng không hợp lệ hoặc đã kết thúc.");
    }
  }

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

      {/* Meeting Hub */}
      <div className="grid gap-4 md:grid-cols-2">
         <Card className="bg-primary text-primary-foreground border-none shadow-xl shadow-primary/20 overflow-hidden relative group">
            <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700" />
            <CardHeader>
               <CardTitle className="flex items-center gap-2">
                  <Video className="h-5 w-5" /> Cuộc họp của bạn
               </CardTitle>
               <CardDescription className="text-primary-foreground/70">Đặt tên và bắt đầu thảo luận ngay lập tức.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <Input 
                 placeholder="Tên cuộc họp..." 
                 value={meetingName}
                 onChange={(e) => setMeetingName(e.target.value)}
                 className="h-10 border-white/20 bg-white/10 text-white placeholder:text-white/40 rounded-xl font-bold focus-visible:ring-offset-0 focus-visible:ring-white/30"
               />
               <Button onClick={handleCreateMeeting} variant="secondary" className="w-full h-12 rounded-xl font-black uppercase tracking-widest gap-2">
                  <Plus className="h-4 w-4" /> Tạo cuộc họp
               </Button>
            </CardContent>
         </Card>

         <Card className="border-2 border-primary/10 shadow-lg">
            <CardHeader>
               <CardTitle className="flex items-center gap-2">
                  <Hash className="h-5 w-5 text-primary" /> Tham gia bằng mã
               </CardTitle>
               <CardDescription>Nhập đúng mã phòng (phân biệt hoa thường) để tham gia.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
               <div className="flex gap-2">
                  <Input 
                    placeholder="Mã phòng (vd: a1b2c-d3e4f-g5h6i)" 
                    value={meetingCode}
                    onChange={(e) => setMeetingCode(e.target.value)}
                    className="h-12 border-primary/20 focus-visible:ring-primary rounded-xl font-bold font-mono"
                  />
                  <Button onClick={handleJoinMeeting} className="h-12 w-12 rounded-xl p-0" variant="default">
                     <ArrowRight className="h-5 w-5" />
                  </Button>
               </div>
            </CardContent>
         </Card>
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

      {showLobby && (
        <CallLobby 
          meetingId={showLobby.meetingId}
          type={showLobby.type}
          title={showLobby.title}
          conversationId={showLobby.conversationId}
          onJoin={(mic, cam) => {
            const path = `/call/${showLobby.meetingId}?type=${showLobby.type}&mic=${mic}&cam=${cam}`;
            import('next/navigation').then(({ useRouter }) => {
                // If router is already available from hook
            });
            // Better to use current router instance from component
            router.push(path);
            setShowLobby(null);
          }}
          onCancel={() => setShowLobby(null)}
        />
      )}
    </div>
  )
}