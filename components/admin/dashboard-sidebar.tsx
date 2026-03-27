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
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
  { href: '/dashboard/users', icon: Users, label: 'User Management' },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'Group Management' },
  { href: '/dashboard/schedule', icon: Calendar, label: 'Work Schedule' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Notifications' },
  { href: '/dashboard/online', icon: Activity, label: 'Online Monitor' },
]

const managerNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'My Groups' },
  { href: '/dashboard/schedule', icon: Calendar, label: 'Work Schedule' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Announcements' },
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
          <h1 className="font-semibold text-sidebar-foreground">Admin Panel</h1>
          <p className="text-xs text-sidebar-foreground/60">Lumi Chat Enterprise</p>
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
            <span className="font-medium">Back to Chat</span>
          </Link>
          <Link
            href="/dashboard/settings"
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
              pathname === '/dashboard/settings'
                ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                : 'text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-foreground'
            )}
          >
            <Settings className="h-5 w-5" />
            <span className="font-medium">Settings</span>
          </Link>
        </nav>
      </ScrollArea>

      <div className="p-4 border-t border-sidebar-border mt-auto">
        <Button 
          variant="ghost" 
          onClick={logout} 
          className="w-full justify-start gap-3 hover:bg-destructive/10 hover:text-destructive text-sidebar-foreground/80"
        >
          <LogOut className="h-5 w-5" />
          <span className="font-medium">Sign Out</span>
        </Button>
      </div>
    </div>
  )
}
