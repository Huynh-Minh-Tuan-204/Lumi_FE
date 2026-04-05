'use client'

import { useAuth } from '@/lib/auth-context'
import { getAvatarUrl } from '@/lib/utils'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { User, Globe, Moon, Shield, Save, Upload, Camera } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useRef } from 'react'
import { adminApi, authApi } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

export default function SettingsPage() {
  const { user, token, updateUser } = useAuth()
  const [isSaving, setIsSaving] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [profile, setProfile] = useState({
    fullName: user?.fullName || '',
    email: user?.email || '',
    phone: '' // Add phone if user model exposes it eventually
  })

  const handleSaveProfile = async () => {
    if (!token || !user) return
    setIsSaving(true)
    try {
      await adminApi.updateUser(token, user.id, {
        fullName: profile.fullName,
        email: profile.email
      })
      toast.success('Cập nhật hồ sơ thành công! Các thay đổi có thể có hiệu lực vào lần đăng nhập tiếp theo.')
    } catch (e) {
      toast.error('Cập nhật hồ sơ thất bại')
    } finally {
      setIsSaving(false)
    }
  }

  const handleAvatarChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file || !token || !user) return

    try {
      toast.info('Đang tải ảnh đại diện lên...')
      const res = await authApi.uploadAvatar(token, file)
      updateUser({ avatarPath: `${res.avatarPath}?t=${Date.now()}` })
      toast.success('Cập nhật ảnh đại diện thành công!')
    } catch (e) {
      toast.error('Tải ảnh đại diện thất bại')
    }
  }

  return (
    <div className="space-y-6 max-w-4xl pb-10">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Cài đặt</h2>
        <p className="text-muted-foreground">
          Quản lý cài đặt tài khoản và tùy chọn của bạn
        </p>
      </div>

      <div className="grid gap-6">
        {/* Profile Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5 text-primary" />
              Cài đặt hồ sơ
            </CardTitle>
            <CardDescription>
              Cập nhật thông tin cá nhân của bạn
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-6">
              <div 
                className="relative group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                <Avatar className="h-24 w-24 border-2 border-primary/10 transition-colors group-hover:border-primary">
                  <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                  <AvatarFallback className="text-2xl">{user?.fullName?.charAt(0) || 'U'}</AvatarFallback>
                </Avatar>
                <div className="absolute inset-0 bg-black/40 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <Camera className="h-6 w-6 text-white" />
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  onChange={handleAvatarChange}
                />
              </div>
              <div className="space-y-1">
                <h3 className="font-medium">Ảnh đại diện</h3>
                <p className="text-sm text-muted-foreground">Nhấp vào ảnh để tải lên ảnh đại diện mới (JPG, PNG, WEBP)</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input 
                  id="fullName" 
                  value={profile.fullName} 
                  onChange={(e) => setProfile({...profile, fullName: e.target.value})} 
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input 
                  id="email" 
                  type="email" 
                  value={profile.email}
                  onChange={(e) => setProfile({...profile, email: e.target.value})} 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Vai trò</Label>
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted p-2 rounded-md">
                <Shield className="h-4 w-4" />
                {user?.role === 'Admin' ? 'Quản trị viên' : user?.role === 'Manager' ? 'Quản lý' : 'Nhân viên'}
              </div>
            </div>
            <Button onClick={handleSaveProfile} disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : <><Save className="mr-2 h-4 w-4" /> Lưu thay đổi</>}
            </Button>
          </CardContent>
        </Card>

        {/* Preferences */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              Tùy chọn
            </CardTitle>
            <CardDescription>
              Tùy chỉnh trải nghiệm của bạn
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label className="text-base">Giao diện</Label>
                <p className="text-sm text-muted-foreground">Chuyển đổi giữa chế độ sáng và tối</p>
              </div>
              <ThemeToggle />
            </div>

            <div className="space-y-2 max-w-sm">
              <Label>Ngôn ngữ</Label>
              <Select defaultValue="vi">
                <SelectTrigger>
                  <SelectValue placeholder="Chọn ngôn ngữ" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English (US)</SelectItem>
                  <SelectItem value="vi">Tiếng Việt</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
