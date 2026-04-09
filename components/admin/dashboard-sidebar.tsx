'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LayoutDashboard,
  Users,
  MessageSquare,
  Bell,
  Activity,
  Settings,
  LogOut,
  ChevronLeft,
  Calendar,
} from 'lucide-react'

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan', exact: true },
  { href: '/dashboard/users', icon: Users, label: 'Quản lý người dùng' },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'Quản lý nhóm' },
  { href: '/dashboard/schedule', icon: Calendar, label: 'Lịch làm việc' },
  { href: '/dashboard/online', icon: Activity, label: 'Theo dõi trực tuyến' },
]

const managerNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan', exact: true },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'Nhóm của tôi' },
  { href: '/dashboard/schedule', icon: Calendar, label: 'Lịch làm việc' },
]

export function DashboardSidebar() {
  const pathname = usePathname()
  const { user, logout } = useAuth()

  const isAdmin = user?.role === 'Admin'
  const navItems = isAdmin ? adminNavItems : managerNavItems

  return (
    <div className="flex h-screen w-64 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className="flex items-center gap-3 p-4 border-b border-sidebar-border">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sidebar-primary">
          <LayoutDashboard className="h-5 w-5 text-sidebar-primary-foreground" />
        </div>
        <div>
          <h1 className="font-semibold text-sidebar-foreground">Bảng quản trị</h1>
          <p className="text-xs text-sidebar-foreground/60">Lumi Chat Doanh nghiệp</p>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 px-3 py-4">
        <nav className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(item.href + '/')
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                  isActive
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Divider */}
        <div className="my-4 h-px bg-sidebar-border" />

        {/* Secondary nav */}
        <nav className="space-y-1">
          <Link
            href="/chat"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground transition-colors"
          >
            <ChevronLeft className="h-5 w-5" />
            <span className="font-medium">Quay lại Chat</span>
          </Link>
        </nav>
      </ScrollArea>

    </div>
  )
}
