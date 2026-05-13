'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MessageSquare, Lock, User, AlertCircle } from 'lucide-react'

export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { login, user } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await login(username, password)
      // Redirect based on role will happen in useEffect on page.tsx
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đăng nhập thất bại. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle redirect after successful login
  if (user) {
    if (user.role === 'Admin') {
      router.push('/dashboard')
    } else {
      router.push('/chat')
    }
    return null
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-linear-to-br from-sidebar via-background to-sidebar p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Logo and branding */}
        <div className="flex flex-col items-center text-center">
          <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-linear-to-br from-primary to-accent shadow-2xl shadow-primary/40 mb-2 transform hover:scale-105 transition-transform duration-300">
            <MessageSquare className="h-12 w-12 text-white drop-shadow-lg" />
          </div>
          <h1 className="mt-6 text-3xl font-bold tracking-tight text-foreground">
            Lumi Chat
          </h1>
          <p className="mt-2 text-muted-foreground">
            Nền tảng giao tiếp doanh nghiệp
          </p>
        </div>

        {/* Login card */}
        <Card className="border-0 shadow-xl bg-card/80 backdrop-blur-sm">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl text-center">Đăng nhập vào tài khoản</CardTitle>
            <CardDescription className="text-center">
              Nhập thông tin tài khoản để truy cập hệ thống
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="username">Tên đăng nhập</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="username"
                    type="text"
                    placeholder="Nhập tên đăng nhập"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="username"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Nhập mật khẩu"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="current-password"
                    disabled={isSubmitting}
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={isSubmitting || !username || !password}
              >
                {isSubmitting ? (
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                    Đang đăng nhập...
                  </span>
                ) : (
                  'Đăng nhập'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground">
          Liên hệ quản trị viên hệ thống nếu bạn cần truy cập
        </p>
      </div>
    </div>
  )
}

