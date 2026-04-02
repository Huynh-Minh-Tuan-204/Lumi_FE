'use client'
import SettingsPage from '@/app/dashboard/settings/page'
import { MobileNavigation } from '@/components/chat/mobile-navigation'
import { useAuth } from '@/lib/auth-context'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

export default function Settings() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/')
  }, [isLoading, isAuthenticated, router])

  if (isLoading || !isAuthenticated) return null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex-1 overflow-auto pt-6 px-4 md:px-8 max-w-4xl mx-auto w-full">
         <SettingsPage />
      </div>
      <div className="md:hidden shrink-0 border-t">
        <MobileNavigation />
      </div>
    </div>
  )
}
