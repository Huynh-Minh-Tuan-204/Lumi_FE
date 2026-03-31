'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { MessageSquare, Users, Bell, Settings, LayoutDashboard } from 'lucide-react'

export function MobileNavigation() {
  const pathname = usePathname()
  const { user } = useAuth()
  
  const isAdmin = user?.role === 'Admin'

  const navItems = [
    { href: '/chat', icon: MessageSquare, label: 'Chats' },
    { href: '/contacts', icon: Users, label: 'Contacts' },
    { href: '/notifications', icon: Bell, label: 'Alerts' },
    ...(isAdmin ? [{ href: '/dashboard', icon: LayoutDashboard, label: 'Admin' }] : []),
    { href: '/settings', icon: Settings, label: 'Settings' },
  ]

  return (
    <nav className="flex items-center justify-around border-t bg-background py-2 px-4 safe-bottom">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center gap-1 px-3 py-2 rounded-lg transition-colors',
              isActive
                ? 'text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <item.icon className="h-5 w-5" />
            <span className="text-xs font-medium">{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
