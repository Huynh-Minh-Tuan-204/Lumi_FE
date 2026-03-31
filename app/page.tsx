'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { LoginForm } from '@/components/auth/login-form'

export default function HomePage() {
  const { isAuthenticated, isLoading, user } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && isAuthenticated && user) {
      if (user.isFirstLogin) {
        router.push('/change-password')
      } else if (user.role === 'Admin') {
        router.push('/dashboard')
      } else {
        router.push('/chat')
      }
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return null
  }

  return <LoginForm />
}
