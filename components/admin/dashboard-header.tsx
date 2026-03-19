'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
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

const pageTitles: Record<string, string> = {
  '/dashboard': 'Overview',
  '/dashboard/users': 'User Management',
  '/dashboard/groups': 'Group Management',
  '/dashboard/notifications': 'Notifications',
  '/dashboard/online': 'Online Monitor',
  '/dashboard/settings': 'Settings',
}

const adminNavItems = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Overview', exact: true },
  { href: '/dashboard/users', icon: Users, label: 'User Management' },
  { href: '/dashboard/groups', icon: MessageSquare, label: 'Group Management' },
  { href: '/dashboard/notifications', icon: Bell, label: 'Notifications' },
  { href: '/dashboard/online', icon: Activity, label: 'Online Monitor' },
]

export function DashboardHeader() {
  const pathname = usePathname()
  const { user, logout } = useAuth()
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
              <SheetTitle className="text-sidebar-foreground text-left">Admin Panel</SheetTitle>
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
                <span className="font-medium">Back to Chat</span>
              </Link>
            </nav>
          </SheetContent>
        </Sheet>

        <div>
          <h1 className="text-lg font-semibold md:text-xl">{pageTitle}</h1>
          <p className="text-xs text-muted-foreground hidden sm:block">
            Manage your organization
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        {/* Search */}
        <div className="relative hidden md:block" title="Search users and groups">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search..."
            className="w-64 pl-9"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {/* Theme Toggle */}
        <ThemeToggle />

        {/* Notifications Popover - ĐÃ SỬA TẠI ĐÂY */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-destructive" />
              <span className="sr-only">Toggle notifications</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-0">
            <div className="flex items-center justify-between border-b p-4">
              <h4 className="font-semibold">Notifications</h4>
              <Link 
                href="/dashboard/notifications" 
                className="text-xs text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            <div className="max-h-100 overflow-y-auto p-4 text-center text-sm text-muted-foreground">
              {/* Bạn có thể thay đoạn này bằng <NotificationList /> của bạn */}
              No new notifications
            </div>
          </PopoverContent>
        </Popover>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 pl-2 pr-3">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user?.avatarPath} />
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
                <AvatarImage src={user?.avatarPath} />
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
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}