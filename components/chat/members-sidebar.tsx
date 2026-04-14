'use client'

import { useState, useEffect } from 'react'
import { cn, getAvatarUrl } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { useSignalR } from '@/hooks/use-signalr'
import { adminApi, conversationsApi } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Search, UserPlus, MoreHorizontal, Crown, Shield, Image as ImageIcon, ImagePlus, MessageSquare } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface Member {
  userId?: number // We need userId to remove member
  fullName: string
  avatarPath: string
  isActive: boolean
  isOnline?: boolean
}


interface MembersSidebarProps {
  conversationId: number
  conversationName: string
  isMobile?: boolean
  onBack?: () => void
  onlineUsers: Set<number>
  onClose?: () => void
}

export function MembersSidebar({
  conversationId,
  conversationName,
  isMobile = false,
  onBack,
  onlineUsers,
  onClose,
}: MembersSidebarProps) {
  const { token, user } = useAuth()
  const { lastUserUpdate } = useSignalR()
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)




  const loadMembers = async () => {
    if (!token) return
    setIsLoading(true)
    try {
      const data = await adminApi.getGroupMembers(token, conversationId)
      const mappedData = data.map((m: any) => ({
        userId: m.id,
        fullName: m.fullName,
        avatarPath: m.avatarPath,
        isActive: m.isActive
      }))
      setMembers(mappedData)
    } catch (error) {
      console.error('Failed to load members:', error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadMembers()
  }, [token, conversationId])

  useEffect(() => {
    if (lastUserUpdate) {
      setMembers(prev => prev.map(m => {
        if (m.userId === lastUserUpdate.userId) {
          return { ...m, avatarPath: lastUserUpdate.avatarPath }
        }
        return m
      }))
    }
  }, [lastUserUpdate])



  const handleRemoveMember = async (userId: number) => {
    if (!token) return
    if (!confirm('Bạn có chắc chắn muốn xóa thành viên này không?')) return
    try {
      await conversationsApi.removeMember(token, conversationId, userId)
      toast.success('Đã xóa thành viên thành công')
      loadMembers()
    } catch (error) {
      console.error('Failed to remove member:', error)
      toast.error('Xóa thành viên thất bại')
    }
  }

  const filteredMembers = members.filter((member) =>
    member.fullName.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const onlineMembers = filteredMembers.filter((m) => m.userId && (onlineUsers.has(Number(m.userId)) || Number(m.userId) === user?.id))
  const offlineMembers = filteredMembers.filter((m) => !m.userId || (!onlineUsers.has(Number(m.userId)) && Number(m.userId) !== user?.id))
  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const isAdmin = user?.role === 'Admin'
  const isManager = user?.role === 'Manager'
  const canManageMembers = isAdmin || isManager

  return (
    <div
      className={cn(
        'flex flex-col bg-card border-l h-full',
        isMobile ? 'w-full' : 'w-full'
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b">
        {isMobile && onBack && (
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1">
          <h2 className="font-semibold">Thành viên</h2>
          <p className="text-xs text-muted-foreground">
            {members.length} thành viên
          </p>
        </div>

      </div>

      {/* Group Assets Section */}
      {canManageMembers && (
        <div className="p-4 border-b space-y-3 bg-muted/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tài nguyên nhóm</h3>
          <div className="flex">
            <div className="flex-1">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-2 p-3 border-2 border-dashed rounded-lg hover:bg-muted transition-colors">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-center">Cập nhật Ảnh đại diện</span>
                </div>
                <Input 
                  id="avatar-upload" 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={async (e) => {
                    if (e.target.files?.[0] && token) {
                      try {
                        await conversationsApi.uploadGroupAvatar(token, conversationId, e.target.files[0])
                        toast.success('Đã cập nhật ảnh đại diện nhóm thành công!')
                      } catch (error) {
                        toast.error('Cập nhật ảnh đại diện thất bại')
                      }
                    }
                  }}
                />
              </Label>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Tìm kiếm thành viên..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Members list */}
      <ScrollArea className="flex-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : (
          <div className="p-2 space-y-4">
            {/* Online members */}
            {onlineMembers.length > 0 && (
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Trực tuyến - {onlineMembers.length}
                </p>
                <div className="space-y-1">
                  {onlineMembers.map((member, idx) => (
                      <MemberItem
                      key={idx}
                      member={member}
                      isOnline={true}
                      getInitials={getInitials}
                      canManage={canManageMembers}
                      onRemove={() => member.userId && handleRemoveMember(member.userId)}
                      currentUserId={user?.id}
                      onPrivateMessage={async (targetId) => {
                        try {
                          await conversationsApi.createPrivate(token!, targetId)
                          window.location.reload()
                        } catch (e) {
                          toast.error('Failed to start private chat')
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Offline members */}
            {offlineMembers.length > 0 && (
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Ngoại tuyến - {offlineMembers.length}
                </p>
                <div className="space-y-1">
                  {offlineMembers.map((member, idx) => (
                    <MemberItem
                      key={idx}
                      member={member}
                      isOnline={false}
                      getInitials={getInitials}
                      canManage={canManageMembers}
                      onRemove={() => member.userId && handleRemoveMember(member.userId)}
                      currentUserId={user?.id}
                      onPrivateMessage={async (targetId) => {
                        try {
                          await conversationsApi.createPrivate(token!, targetId)
                          window.location.reload()
                        } catch (e) {
                          toast.error('Failed to start private chat')
                        }
                      }}
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredMembers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Không tìm thấy thành viên
              </p>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface MemberItemProps {
  member: Member
  isOnline: boolean
  getInitials: (name: string) => string
  canManage: boolean
  onRemove?: () => void
  onPrivateMessage?: (userId: number) => void
  currentUserId?: number
}

function MemberItem({ member, isOnline, getInitials, canManage, onRemove, onPrivateMessage, currentUserId }: MemberItemProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarImage src={getAvatarUrl(member.avatarPath)} />
          <AvatarFallback className="text-xs bg-secondary">
            {getInitials(member.fullName)}
          </AvatarFallback>
        </Avatar>
        {/* Online indicator */}
        <span
          className={cn(
            'absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card',
            isOnline ? 'bg-online' : 'bg-muted-foreground'
          )}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{member.fullName}</p>
        <p className="text-xs text-muted-foreground">
          {isOnline ? 'Trực tuyến' : 'Ngoại tuyến'}
        </p>
      </div>

      <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {member.userId !== currentUserId && (
              <DropdownMenuItem onClick={() => onPrivateMessage?.(Number(member.userId))}>
                <MessageSquare className="mr-2 h-4 w-4" />
                Nhắn riêng
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => toast('Tính năng xem hồ sơ đang được phát triển')}>Xem hồ sơ</DropdownMenuItem>
            {canManage && onRemove && (
              <DropdownMenuItem className="text-destructive" onClick={onRemove}>
                Xóa khỏi nhóm
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
    </div>
  )
}
