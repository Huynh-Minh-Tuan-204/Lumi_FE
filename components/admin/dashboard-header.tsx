'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn, getAvatarUrl } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover' // Import thêm Popover
import {
  Menu,
  Search,
  Bell,
  LogOut,
  User,
  Settings,
  LayoutDashboard,
  Users,
  MessageSquare,
  Activity,
  ChevronLeft,
} from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { useSearch } from './search-context'
import { useSignalR } from '@/hooks/use-signalr'
import { announcementsApi } from '@/lib/api'

const pageTitles: Record<string, string> = {
  '/dashboard': 'Tổng quan',
  '/dashboard/users': 'Quản lý người dùng',
  '/dashboard/groups': 'Quản lý nhóm',
  '/dashboard/notifications': 'Thông báo',
  '/dashboard/online': 'Theo dõi trực tuyến',
  '/dashboard/settings': 'Cài đặt',
}

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Tổng quan', exact: true },
  { href: '/dashboard/users', icon: Users, label: 'Quản lý người dùng' },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'Quản lý nhóm' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Thông báo' },
  { href: '/dashboard/online', icon: Activity, label: 'Theo dõi trực tuyến' },
]

export function DashboardHeader() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
  const { notifications, markAllNotificationsRead } = useSignalR()
  const unreadCount = notifications.filter(n => !n.isRead).length
  const token = useAuth().token // Ensure we get latest token
  const { searchQuery, setSearchQuery } = useSearch()
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

        {/* Notifications Popover */}
        <Popover onOpenChange={async (open) => {
          if (open && token) {
            try {
              await announcementsApi.markAllRead(token);
              markAllNotificationsRead();
            } catch (e) {}
          }
        }}>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 h-3.5 w-3.5 flex items-center justify-center rounded-full bg-destructive text-[10px] text-white">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
              <span className="sr-only">Toggle notifications</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0 shadow-xl border-sidebar-border">
            <div className="flex items-center justify-between border-b p-4 bg-muted/20">
              <h4 className="font-semibold text-sm">Thông báo</h4>
              <Link 
                href="/dashboard/notifications" 
                className="text-xs text-primary hover:underline font-medium"
              >
                Xem tất cả
              </Link>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Bell className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  Không có thông báo mới
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {notifications.slice(0, 5).map((n) => (
                    <div key={n.id} className="p-4 hover:bg-muted/50 transition-colors cursor-default">
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <span className="text-xs font-bold text-primary truncate max-w-[150px]">
                          {n.sender || 'Hệ thống'}
                        </span>
                        <span className="text-[10px] text-muted-foreground shrink-0 mt-0.5">
                          {new Date(n.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed text-foreground/80 line-clamp-2">
                        {n.message}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {notifications.length > 0 && (
              <Link
                href="/dashboard/notifications"
                className="block p-3 text-center text-xs border-t font-semibold hover:bg-muted transition-colors text-muted-foreground"
              >
                Xem tất cả thông báo
              </Link>
            )}
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                <AvatarFallback className="text-xs">
                  {user?.fullName ? getInitials(user.fullName) : 'U'}
                </AvatarFallback>
              </Avatar>
              <span className="hidden md:block font-medium">{user?.fullName}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <div className="flex items-center gap-3 p-2">
              <Avatar className="h-10 w-10">
                <AvatarImage src={getAvatarUrl(user?.avatarPath)} />
                <AvatarFallback>{user?.fullName ? getInitials(user.fullName) : 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{user?.fullName}</p>
                <p className="text-xs text-muted-foreground">{user?.role}</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/dashboard/settings" className="cursor-pointer">
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