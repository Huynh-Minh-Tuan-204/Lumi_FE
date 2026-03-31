'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { authApi, ApiError } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { Lock, ShieldAlert, CheckCircle2, Loader2, LogOut } from 'lucide-react'

export function SecurityGuard({ children }: { children: React.ReactNode }) {
  const { user, token, isAuthenticated, isLoading, logout, updateUser } = useAuth()
  
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isUpdating, setIsUpdating] = useState(false)

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

    setIsUpdating(true)
    try {
      await authApi.changePasswordFirstTime(token, oldPassword, newPassword)
      toast.success('Kích hoạt tài khoản thành công!')
      
      // Update local state to dismiss modal in real-time
      updateUser({ isFirstLogin: false })
      
      // Clear form
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      
      // After successfully updating, the modal will automatically be unmounted 
      // because user.isFirstLogin will be false.
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Lỗi cập nhật mật khẩu.'
      toast.error(message)
    } finally {
      setIsUpdating(false)
    }
  }

  const isVisible = !isLoading && isAuthenticated && user?.isFirstLogin

  return (
    <div className="relative min-h-screen">
      {/* 
          Chỉ render children (Giao diện chính) nếu người dùng đã đổi mật khẩu 
          hoặc chưa đăng nhập (Trang Login). Điều này giúp tránh gọi các API 
          bị chặn 403 từ các Component như ChatSidebar, ChatArea...
      */}
      {(!isAuthenticated || !user?.isFirstLogin) ? (
        children
      ) : (
        /* Khi chưa đổi mật khẩu, ta giữ DOM sạch sẽ, không render giao diện chat */
        <div className="fixed inset-0 bg-slate-950 z-0" />
      )}

      {/* Force Change Password Modal Overlay */}
      {isVisible && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Blur/Dark Backdrop - No interaction with background allowed */}
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md pointer-events-auto" />
          
          <Card className="w-full max-w-lg relative z-10 border-white/10 bg-background/90 shadow-2xl backdrop-blur-xl animate-in zoom-in duration-300">
            <CardHeader className="space-y-1">
              <div className="flex justify-center mb-2">
                <div className="p-3 rounded-full bg-primary/10 border border-primary/20">
                  <ShieldAlert className="h-8 w-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-2xl text-center font-black tracking-tight uppercase">Kích hoạt tài khoản</CardTitle>
              <CardDescription className="text-center text-muted-foreground font-medium">
                Chào mừng <span className="text-primary font-bold">{user?.fullName}</span>! Bạn cần cập nhật mật khẩu lần đầu để bảo vệ an toàn cho hệ thống Lumi.
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit}>
              <CardContent className="space-y-4 py-2">
                <div className="grid gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                      <Lock className="h-3 w-3" /> Mật khẩu do Admin cấp
                    </label>
                    <Input
                      type="password"
                      placeholder="Nhập mật khẩu hiện tại..."
                      className="h-11 bg-muted/50"
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      required
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-3 w-3 text-green-500" /> Mật khẩu mới
                      </label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="h-11 bg-muted/50"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Xác nhận</label>
                      <Input
                        type="password"
                        placeholder="••••••••"
                        className="h-11 bg-muted/50"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                      />
                    </div>
                  </div>
                  <ul className="text-[10px] space-y-1 text-muted-foreground bg-muted/30 p-3 rounded-lg border border-border/50">
                    <li className="flex items-center gap-1.5">• Tối thiểu 8 ký tự.</li>
                    <li className="flex items-center gap-1.5">• Bao gồm chữ hoa, chữ thường và số.</li>
                    <li className="flex items-center gap-1.5">• Tuyệt đối không trùng mật khẩu cũ.</li>
                  </ul>
                </div>
              </CardContent>
              <CardFooter className="flex flex-col gap-3 pt-4 pb-6">
                <Button 
                  type="submit" 
                  className="w-full font-bold h-12 text-md shadow-lg shadow-primary/20" 
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Đang mã hóa & lưu...
                    </>
                  ) : 'Cập nhật & Truy cập ngay'}
                </Button>
                <Button 
                    variant="ghost" 
                    type="button" 
                    className="w-full text-xs opacity-50 hover:opacity-100 hover:text-destructive transition-all" 
                    onClick={logout}
                    disabled={isUpdating}
                >
                  <LogOut className="h-3 w-3 mr-2" />
                  Đăng xuất tài khoản
                </Button>
              </CardFooter>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
