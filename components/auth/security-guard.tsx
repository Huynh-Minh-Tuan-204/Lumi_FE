'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { ShieldAlert } from 'lucide-react'

export function SecurityGuard({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!isLoading && isAuthenticated && user?.isFirstLogin) {
      if (pathname !== '/change-password') {
        router.push('/change-password')
      }
    }
  }, [user, isAuthenticated, isLoading, pathname, router])

  // Nếu đang là lần đầu đăng nhập và không ở trang đổi pass, ẩn nội dung để tránh "lộ" giao diện
  if (!isLoading && isAuthenticated && user?.isFirstLogin && pathname !== '/change-password') {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4 text-center p-6">
          <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
            <ShieldAlert className="h-10 w-10 text-primary animate-pulse" />
          </div>
          <h2 className="text-xl font-bold">Yêu cầu bảo mật</h2>
          <p className="text-muted-foreground text-sm max-w-xs">
            Vui lòng thay đổi mật khẩu mặc định để tiếp tục truy cập ứng dụng.
          </p>
          <div className="h-1 w-24 bg-primary/20 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-primary animate-progress-buffer w-1/2" />
          </div>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
