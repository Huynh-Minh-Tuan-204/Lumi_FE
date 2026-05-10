'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn, getAvatarUrl } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import Image from 'next/image'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Menu,
  LogOut,
  Settings,
  LayoutDashboard,
  Users,
  MessageSquare,
  Activity,
  ChevronLeft,
  Calendar,
  Bell,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tổng quan',
  '/dashboard/users': 'Quản lý người dùng',
  '/dashboard/groups': 'Quản lý nhóm',
  '/dashboard/online': 'Theo dõi trực tuyến',
  '/dashboard/notifications': 'Thông báo',
  '/dashboard/settings': 'Cài đặt',
}

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan', exact: true },
  { href: '/dashboard/users', icon: Users, label: 'Quản lý người dùng' },
  { href: '/dashboard/schedule', icon: Calendar, label: 'Lịch làm việc' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Thông báo' },
  { href: '/dashboard/online', icon: Activity, label: 'Theo dõi trực tuyến' },
]

export function DashboardHeader() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const pageTitle = pageTitles[pathname] || 'Dashboard'

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  return (
    <header className="flex items-center justify-between gap-4 border-b bg-card px-4 py-3 md:px-6">
      <div className="flex items-center gap-3">
        {/* Mobile menu trigger */}
        <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="lg:hidden">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 bg-sidebar">
            <SheetHeader className="p-4 border-b border-sidebar-border">
              <SheetTitle className="text-sidebar-foreground text-left">Bảng quản trị</SheetTitle>
            </SheetHeader>
            <nav className="p-3 space-y-1">
              {adminNavItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch={false}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors',
                      isActive
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/80 hover:bg-sidebar-accent'
                    )}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
              <div className="my-4 h-px bg-sidebar-border" />
              <Link
                href="/chat"
                prefetch={false}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-foreground/80 hover:bg-sidebar-accent transition-colors"
              >
                <ChevronLeft className="h-5 w-5" />
                <span className="font-medium">Quay lại Chat</span>
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <div>
          <h1 className="text-lg font-semibold md:text-xl">{pageTitle}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Quản lý tổ chức của bạn
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">

        {/* Theme Toggle */}
        <ThemeToggle />


        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3">
              <div className="relative h-8 w-8 rounded-full overflow-hidden bg-muted">
                {user?.avatarPath ? (
                  <Image 
                    src={getAvatarUrl(user.avatarPath)} 
                    alt={user.fullName || 'User'}
                    fill
                    sizes="32px"
                    className="object-cover"
                    loading="lazy"
                    quality={60}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] font-bold">
                    {user?.fullName ? getInitials(user.fullName) : 'U'}
                  </div>
                )}
              </div>
              <span className="hidden md:block font-medium">{user?.fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-3 p-2">
              <div className="relative h-10 w-10 rounded-full overflow-hidden bg-muted">
                {user?.avatarPath ? (
                  <Image 
                    src={getAvatarUrl(user.avatarPath)} 
                    alt={user.fullName || 'User'}
                    fill
                    sizes="40px"
                    className="object-cover"
                    loading="lazy"
                    quality={60}
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold">
                    {user?.fullName ? getInitials(user.fullName) : 'U'}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" prefetch={false} className="cursor-pointer">
                <Settings className="mr-2 h-4 w-4" />
                Cài đặt
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Đăng xuất
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
