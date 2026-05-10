'use client'

import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { SearchProvider } from '@/features/admin/search-context'

// Dynamic imports with SSR disabled to optimize initial load waterfall
const DashboardSidebar = dynamic(() => import('@/features/admin/dashboard-sidebar').then(mod => mod.DashboardSidebar), { ssr: false })
const DashboardHeader = dynamic(() => import('@/features/admin/dashboard-header').then(mod => mod.DashboardHeader), { ssr: false })

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading) {
      if (!isAuthenticated) {
        router.push('/')
      } else if (user?.role !== 'Admin' && user?.role !== 'Manager') {
        router.push('/chat')
      }
    }
  }, [isAuthenticated, isLoading, user, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  if (!isAuthenticated || (user?.role !== 'Admin' && user?.role !== 'Manager')) {
    return null
  }

  return (
    <SearchProvider>
      <div className="flex h-screen bg-background">
        {/* Desktop sidebar */}
        <div className="hidden lg:block">
          <DashboardSidebar />
        </div>
        
        <div className="flex flex-1 flex-col overflow-hidden">
          <DashboardHeader />
          <main className="flex-1 overflow-auto p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </SearchProvider>
  )
}

