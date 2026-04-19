'use client'
import { MobileNavigation } from '@/features/chat/mobile-navigation'
import { MessageSquare, Search } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth-context'
import { useEffect } from 'react'

export default function Contacts() {
  const { isAuthenticated, isLoading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.push('/')
  }, [isLoading, isAuthenticated, router])

  if (isLoading || !isAuthenticated) return null

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      <div className="flex-1 overflow-auto p-4 max-w-4xl mx-auto w-full flex flex-col items-center justify-center">
         <Search className="h-16 w-16 mb-4 text-primary opacity-50" />
         <h1 className="text-xl font-bold mb-2">Tìm kiếm liên hệ</h1>
         <p className="text-muted-foreground mb-6 text-center max-w-xs text-sm leading-relaxed">
            Danh bạ đã được tích hợp vào Chats. Vui lòng chuyển qua mục <strong>Chats &gt; People</strong> (Tìm kiếm) để tìm và bắt đầu trò chuyện với mọi người trong hệ thống.
         </p>
         <Button onClick={() => router.push('/chat')} className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Đi tới Danh bạ
         </Button>
      </div>
      <div className="md:hidden shrink-0 border-t">
        <MobileNavigation />
      </div>
    </div>
  )
}

