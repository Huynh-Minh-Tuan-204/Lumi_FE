'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useAuth } from '@/lib/auth-context'
import { adminApi, conversationsApi } from '@/lib/api'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Search, UserPlus, MoreHorizontal, Crown, Shield, Image as ImageIcon, ImagePlus } from 'lucide-react'
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
}

export function MembersSidebar({
  conversationId,
  conversationName,
  isMobile = false,
  onBack,
  onlineUsers,
}: MembersSidebarProps) {
  const { token, user } = useAuth()
  const [members, setMembers] = useState<Member[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false)
  const [newMemberId, setNewMemberId] = useState('')
  const [isAddingMember, setIsAddingMember] = useState(false)


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

  const handleAddMember = async () => {
    if (!token || !newMemberId.trim()) return
    setIsAddingMember(true)
    try {
      await conversationsApi.addMember(token, conversationId, parseInt(newMemberId, 10))
      toast.success('Member added successfully')
      setIsAddMemberOpen(false)
      setNewMemberId('')
      loadMembers() // Reload members
    } catch (error) {
      console.error('Failed to add member:', error)
      toast.error('Failed to add member')
    } finally {
      setIsAddingMember(false)
    }
  }

  const handleRemoveMember = async (userId: number) => {
    if (!token) return
    if (!confirm('Are you sure you want to remove this member?')) return
    try {
      await conversationsApi.removeMember(token, conversationId, userId)
      toast.success('Member removed successfully')
      loadMembers()
    } catch (error) {
      console.error('Failed to remove member:', error)
      toast.error('Failed to remove member')
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
        'flex flex-col bg-card border-l',
        isMobile ? 'w-full h-full' : 'w-72'
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
          <h2 className="font-semibold">Members</h2>
          <p className="text-xs text-muted-foreground">
            {members.length} member{members.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canManageMembers && (
          <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="icon">
                <UserPlus className="h-4 w-4" />
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-106.25">
              <DialogHeader>
                <DialogTitle>Add Member</DialogTitle>
                <DialogDescription>
                  Enter the User ID of the member you want to add to the group.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="userId" className="text-right">
                    User ID
                  </Label>
                  <Input
                    id="userId"
                    value={newMemberId}
                    onChange={(e) => setNewMemberId(e.target.value)}
                    className="col-span-3"
                    placeholder="Enter user ID..."
                    type="number"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={handleAddMember} disabled={isAddingMember || !newMemberId.trim()}>
                  {isAddingMember ? 'Adding...' : 'Add Member'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Group Assets Section */}
      {canManageMembers && (
        <div className="p-4 border-b space-y-3 bg-muted/30">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Group Assets</h3>
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="avatar-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-2 p-3 border-2 border-dashed rounded-lg hover:bg-muted transition-colors">
                  <ImagePlus className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-center">Update Avatar</span>
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
                        toast.success('Avatar updated! Please refresh.')
                      } catch (error) {
                        toast.error('Failed to update avatar')
                      }
                    }
                  }}
                />
              </Label>
            </div>
            <div className="flex-1">
              <Label htmlFor="bg-upload" className="cursor-pointer">
                <div className="flex flex-col items-center gap-2 p-3 border-2 border-dashed rounded-lg hover:bg-muted transition-colors">
                  <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  <span className="text-xs font-medium text-center">Update Background</span>
                </div>
                <Input 
                  id="bg-upload" 
                  type="file" 
                  accept="image/*" 
                  className="hidden" 
                  onChange={async (e) => {
                    if (e.target.files?.[0] && token) {
                      try {
                        await conversationsApi.uploadGroupBackground(token, conversationId, e.target.files[0])
                        toast.success('Background updated! Please refresh.')
                      } catch (error) {
                        toast.error('Failed to update background')
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
            placeholder="Search members..."
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
                  Online - {onlineMembers.length}
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
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Offline members */}
            {offlineMembers.length > 0 && (
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  Offline - {offlineMembers.length}
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
                    />
                  ))}
                </div>
              </div>
            )}

            {filteredMembers.length === 0 && (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No members found
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
}

function MemberItem({ member, isOnline, getInitials, canManage, onRemove }: MemberItemProps) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 group">
      <div className="relative">
        <Avatar className="h-9 w-9">
          <AvatarImage src={member.avatarPath} />
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
          {isOnline ? 'Online' : 'Offline'}
        </p>
      </div>
      {canManage && (
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
            <DropdownMenuItem onClick={() => toast('Tính năng xem hồ sơ đang được phát triển')}>View profile</DropdownMenuItem>
            <DropdownMenuItem onClick={() => toast('Tính năng gửi tin nhắn đang được phát triển')}>Send message</DropdownMenuItem>
            <DropdownMenuItem className="text-destructive" onClick={onRemove}>
              Remove from group
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )
}
