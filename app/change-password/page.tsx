'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { authApi, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Lock, ShieldAlert, CheckCircle2 } from 'lucide-react'

export default function ChangePasswordPage() {
  const router = useRouter()
  const { user, token, logout, updateUser } = useAuth()
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  // Redirect if not logged in
  if (!user && !isLoading) {
    if (typeof window !== 'undefined') router.push('/')
    return null
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!token) return

    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu mới không trùng khớp.')
      return
    }

    if (newPassword === oldPassword) {
      toast.error('Mật khẩu mới không được trùng mật khẩu cũ.')
      return
    }

    if (newPassword.length < 8) {
      toast.error('Mật khẩu phải dài ít nhất 8 ký tự.')
      return
    }

    setIsLoading(true)
    try {
      await authApi.changePasswordFirstTime(token, oldPassword, newPassword)
      toast.success('Đổi mật khẩu thành công!')
      
      // Update local state to allow access
      updateUser({ isFirstLogin: false })
      
      // Full refresh to ensure SignalR and other providers get the updated status
      setTimeout(() => {
        window.location.href = '/chat'
      }, 1500)
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Đổi mật khẩu thất bại.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4">
      <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/10 rounded-full blur-[120px]" />
      </div>

      <Card className="w-full max-w-md relative z-10 border-white/10 bg-black/60 backdrop-blur-xl">
        <CardHeader className="space-y-1">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
              <ShieldAlert className="h-8 w-8 text-primary animate-pulse" />
            </div>
          </div>
          <CardTitle className="text-2xl text-center font-bold tracking-tight">Kích hoạt tài khoản</CardTitle>
          <CardDescription className="text-center text-muted-foreground">
            Đây là lần đầu bạn đăng nhập. Vui lòng cập nhật mật khẩu mới để bảo mật tài khoản.
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 flex items-center gap-2">
                <Lock className="h-4 w-4 opacity-70" /> Mật khẩu hiện tại (được cấp)
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border-white/10"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 opacity-70 text-green-500" /> Mật khẩu mới
              </label>
              <Input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border-white/10"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
              />
              <p className="text-[10px] text-muted-foreground">Ít nhất 8 ký tự, bao gồm chữ hoa, chữ thường và số.</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none">Xác nhận mật khẩu mới</label>
              <Input
                type="password"
                placeholder="••••••••"
                className="bg-white/5 border-white/10"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full font-bold h-11" disabled={isLoading}>
              {isLoading ? 'Đang xử lý...' : 'Cập nhật mật khẩu'}
            </Button>
            <Button variant="ghost" type="button" className="w-full text-xs opacity-50 hover:opacity-100" onClick={logout}>
              Đăng xuất
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
