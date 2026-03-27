'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { adminApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Bell, Send, Megaphone, Clock, CheckCircle } from 'lucide-react'

interface Announcement {
  id: number
  sender: string
  message: string
  isSystem: boolean
  time: string
}

export default function NotificationsPage() {
  const { token, user } = useAuth()
  const { sendNotification, isConnected, notifications: realtimeNotifications } = useSignalR()
  const [announcements, setAnnouncements] = useState<Announcement[]>([])
  const [newAnnouncement, setNewAnnouncement] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [targetType, setTargetType] = useState<'all' | 'specific'>('all')
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([])
  const [allUsers, setAllUsers] = useState<any[]>([])

  useEffect(() => {
    loadAnnouncements()
    loadUsers()
  }, [token])

  const loadUsers = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAllUsers(token)
      setAllUsers(data)
    } catch (e) {}
  }

  const loadAnnouncements = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAnnouncements(token)
      const mapped = data.map(a => ({
        id: a.id,
        sender: a.senderName || '📢 HỆ THỐNG',
        message: a.message,
        isSystem: true,
        time: a.timestamp
      }))
      setAnnouncements(mapped)
    } catch (error) {
      console.error('Failed to load announcements:', error)
      toast.error('Failed to load announcements')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendAnnouncement = async () => {
    if (!newAnnouncement.trim() || isSending || !token) return

    setIsSending(true)
    try {
      await adminApi.sendAnnouncement(
        token, 
        newAnnouncement, 
        targetType === 'all' ? undefined : selectedUserIds
      );
      toast.success('Announcement sent successfully')
      setNewAnnouncement('')
      setSelectedUserIds([])
      // Reload announcements to show the new one
      await loadAnnouncements()
    } catch (error) {
      console.error('Failed to send announcement:', error)
      toast.error('Failed to send announcement')
    } finally {
      setIsSending(false)
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diff = now.getTime() - date.getTime()
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const days = Math.floor(diff / (1000 * 60 * 60 * 24))

    if (hours < 1) {
      const minutes = Math.floor(diff / (1000 * 60))
      return `${minutes}m ago`
    } else if (hours < 24) {
      return `${hours}h ago`
    } else if (days < 7) {
      return `${days}d ago`
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  const isAdmin = user?.role === 'Admin'
  const isManager = user?.role === 'Manager'
  const canSendAnnouncements = isAdmin || isManager

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Notifications</h2>
        <p className="text-muted-foreground">
          Send company-wide announcements and view notification history
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Send announcement */}
        {canSendAnnouncements && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Megaphone className="h-5 w-5 text-primary" />
                Send Announcement
              </CardTitle>
              <CardDescription>
                Broadcast a message to all users in the system
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4 pt-1">
                <div className="flex bg-muted p-1 rounded-lg">
                  <button 
                    onClick={() => setTargetType('all')}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all",
                      targetType === 'all' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Send to All
                  </button>
                  <button 
                    onClick={() => setTargetType('specific')}
                    className={cn(
                      "flex-1 px-3 py-1.5 text-xs font-bold uppercase tracking-widest rounded-md transition-all",
                      targetType === 'specific' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Specific Users
                  </button>
                </div>

                {targetType === 'specific' && (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <Label className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Chọn người nhận ({selectedUserIds.length})</Label>
                    <ScrollArea className="h-40 border rounded-lg p-2 bg-muted/20">
                      <div className="grid grid-cols-2 gap-1">
                        {allUsers.map((u) => (
                          <div 
                            key={u.id}
                            onClick={() => {
                              setSelectedUserIds(prev => 
                                prev.includes(u.id) ? prev.filter(id => id !== u.id) : [...prev, u.id]
                              )
                            }}
                            className={cn(
                              "flex items-center gap-2 p-2 rounded-md cursor-pointer transition-all border",
                              selectedUserIds.includes(u.id) 
                                ? "bg-primary/10 border-primary text-primary" 
                                : "bg-card border-transparent hover:bg-muted"
                            )}
                          >
                            <Avatar className="h-6 w-6">
                              <AvatarFallback className="text-[10px] font-bold">
                                {u.fullName?.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium truncate">{u.fullName}</span>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="announcement" className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Message</Label>
                  <Textarea
                    id="announcement"
                    placeholder="Loa loa loa! Nhập nội dung thông báo..."
                    value={newAnnouncement}
                    onChange={(e) => setNewAnnouncement(e.target.value)}
                    rows={4}
                    className="resize-none font-medium text-sm border-2 focus-visible:ring-primary h-[80px]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                  {isConnected ? (
                    <>
                      <CheckCircle className="h-3 w-3 text-online" />
                      <span>Live Connection</span>
                    </>
                  ) : (
                    <>
                      <Clock className="h-3 w-3 text-destructive" />
                      <span>Disconnected</span>
                    </>
                  )}
                </div>
                <Button
                  onClick={handleSendAnnouncement}
                  disabled={!newAnnouncement.trim() || isSending || !isConnected || (targetType === 'specific' && selectedUserIds.length === 0)}
                  className="bg-primary hover:bg-primary/90 text-white font-bold h-11 px-6 shadow-lg shadow-primary/20"
                >
                  {isSending ? (
                    <span className="flex items-center gap-2">
                      <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Loađing...
                    </span>
                  ) : (
                    <>
                      <Send className="h-4 w-4 mr-2" />
                      BẮT ĐẦU GỬI
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Announcement history */}
        <Card className={!canSendAnnouncements ? 'lg:col-span-2' : ''}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Announcement History
            </CardTitle>
            <CardDescription>
              Recent announcements sent to the organization
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : [...realtimeNotifications.map(n => ({ sender: n.sender || '📢 HỆ THỐNG', message: n.message, isSystem: n.isSystem || true, time: n.time.toISOString() })).reverse(), ...announcements].length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Bell className="h-12 w-12 mb-4 opacity-20" />
                <p className="text-center">No announcements yet</p>
              </div>
            ) : (
              <ScrollArea className="h-100 pr-4">
                <div className="space-y-4">
                  {(() => {
                    const all = [...realtimeNotifications.map(n => ({ 
                      id: n.id,
                      sender: n.sender || '📢 HỆ THỐNG', 
                      message: n.message, 
                      isSystem: n.isSystem || true, 
                      time: n.time.toISOString() 
                    })).reverse(), ...announcements];
                    
                    // Deduplicate by ID and Message to be sure
                    const unique = Array.from(new Map(all.map(item => [`${item.id}_${item.message}`, item])).values());
                    return unique;
                  })().map((announcement, idx) => (
                    <div
                      key={idx}
                      className="flex gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                    >
                      <Avatar className="h-10 w-10 shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary">
                          <Megaphone className="h-4 w-4" />
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">
                            {announcement.sender}
                          </span>
                          {announcement.isSystem && (
                            <Badge variant="secondary" className="text-xs">
                              System
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatTime(announcement.time)}
                          </span>
                        </div>
                        <p className="text-sm text-foreground/80">
                          {announcement.message}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
