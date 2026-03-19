'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { adminApi, conversationsApi } from '@/lib/api'
import { toast } from 'sonner'
import { useSearch } from '@/components/admin/search-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Search,
  Plus,
  MoreHorizontal,
  Edit,
  Trash2,
  Users,
  UserPlus,
  Hash,
  MessageSquare,
} from 'lucide-react'

interface GroupData {
  id: number
  name: string
  type: string
  lastMessage: string | null
}

export default function GroupsPage() {
  const { token, user } = useAuth()
  const { searchQuery, setSearchQuery } = useSearch()
  const [groups, setGroups] = useState<GroupData[]>([])
  const [filteredGroups, setFilteredGroups] = useState<GroupData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [selectedGroup, setSelectedGroup] = useState<GroupData | null>(null)
  const [isAddMemberDialogOpen, setIsAddMemberDialogOpen] = useState(false)
  const [allUsers, setAllUsers] = useState<Array<{ id: number; fullName: string }>>([])
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null)
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false)
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameInput, setRenameInput] = useState('')
  const [isViewMembersDialogOpen, setIsViewMembersDialogOpen] = useState(false)
  const [groupMembers, setGroupMembers] = useState<Array<{ id: number; fullName: string; avatarPath: string; isActive: boolean }>>([])
  const [isLoadingMembers, setIsLoadingMembers] = useState(false)

  useEffect(() => {
    loadGroups()
    loadUsers()
  }, [token])

  useEffect(() => {
    const query = (searchQuery || '').toLowerCase();
    const filtered = groups.filter((g) =>
      (g.name || '').toLowerCase().includes(query)
    )
    setFilteredGroups(filtered)
  }, [groups, searchQuery])

  const loadGroups = async () => {
    if (!token) return
    try {
      const data = await adminApi.getMyConversations(token)
      // Tương thích với PascalCase nếu backend trả về Id, Name thay vì id, name
      const mappedData = data.map((g: any) => ({
        id: g.id || g.Id,
        name: g.name || g.Name,
        type: g.type || g.Type,
        lastMessage: g.lastMessage || g.LastMessage,
      }))
      setGroups(mappedData)
      setFilteredGroups(mappedData)
    } catch (error) {
      console.error('Failed to load groups:', error)
      toast.error('Failed to load groups')
    } finally {
      setIsLoading(false)
    }
  }

  const loadUsers = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAllUsers(token)
      setAllUsers(data.map((u) => ({ id: u.id, fullName: u.fullName })))
    } catch (error) {
      console.error('Failed to load users:', error)
    }
  }

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !newGroupName.trim()) return

    setIsCreating(true)
    try {
      await adminApi.createGroup(token, newGroupName)
      toast.success('Group created successfully')
      setIsCreateDialogOpen(false)
      setNewGroupName('')
      loadGroups()
    } catch (error) {
      console.error('Failed to create group:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to create group')
    } finally {
      setIsCreating(false)
    }
  }

  const handleAddMember = async () => {
    if (!token || !selectedGroup || !selectedUserId) return

    try {
      await adminApi.addMemberToGroup(token, selectedGroup.id, selectedUserId)
      toast.success('Member added successfully')
      setIsAddMemberDialogOpen(false)
      setSelectedUserId(null)
    } catch (error) {
      console.error('Failed to add member:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to add member')
    }
  }

  const handleDeleteGroup = async (group: GroupData) => {
    if (!token) return
    if (!window.confirm(`Delete group "${group.name}"? This cannot be undone.`)) return

    try {
      await adminApi.deleteGroup(token, group.id)
      toast.success('Group deleted successfully')
      setGroups((prev) => prev.filter((g) => g.id !== group.id))
      setFilteredGroups((prev) => prev.filter((g) => g.id !== group.id))
    } catch (error) {
      console.error('Failed to delete group:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to delete group')
    }
  }

  const handleRenameGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token || !selectedGroup || !renameInput.trim()) return

    setIsRenaming(true)
    try {
      await conversationsApi.renameConversation(token, selectedGroup.id, renameInput)
      toast.success('Group renamed successfully')
      setIsRenameDialogOpen(false)
      loadGroups()
    } catch (error) {
      console.error('Failed to rename group:', error)
      toast.error(error instanceof Error ? error.message : 'Failed to rename group')
    } finally {
      setIsRenaming(false)
    }
  }

  const loadGroupMembers = async (groupId: number) => {
    if (!token) return
    setIsLoadingMembers(true)
    try {
      const data = await adminApi.getGroupMembers(token, groupId)
      setGroupMembers(data)
    } catch (error) {
      console.error('Failed to load group members:', error)
      toast.error('Failed to load group members')
    } finally {
      setIsLoadingMembers(false)
    }
  }

  useEffect(() => {
    if ((isViewMembersDialogOpen || isAddMemberDialogOpen) && selectedGroup) {
      loadGroupMembers(selectedGroup.id)
    }
  }, [isViewMembersDialogOpen, isAddMemberDialogOpen, selectedGroup])

  const isAdmin = user?.role === 'Admin'
  const isManager = user?.role === 'Manager'
  const canManageGroups = isAdmin || isManager

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Group Management</h2>
          <p className="text-muted-foreground">
            Create and manage chat groups
          </p>
        </div>
        {canManageGroups && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="mr-2 h-4 w-4" />
                Create Group
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Group</DialogTitle>
                <DialogDescription>
                  Create a new chat group for team communication
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateGroup} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="groupName">Group Name</Label>
                  <Input
                    id="groupName"
                    placeholder="e.g., Marketing Team"
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                    required
                  />
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCreateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={isCreating || !newGroupName.trim()}>
                    {isCreating ? 'Creating...' : 'Create Group'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Search card removed and merged into top search */}

      {/* Groups grid */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : filteredGroups.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
            <p className="text-lg font-medium">No groups found</p>
            <p className="text-sm">Create a new group to get started</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredGroups.map((group) => (
            <Card key={group.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Hash className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{group.name}</CardTitle>
                      <CardDescription>
                        <Badge variant="outline" className="text-xs">
                          {group.type}
                        </Badge>
                      </CardDescription>
                    </div>
                  </div>
                  {canManageGroups && (
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                        <DropdownMenuItem
                          onClick={() => {
                            setSelectedGroup(group)
                            setIsAddMemberDialogOpen(true)
                          }}
                        >
                          <UserPlus className="mr-2 h-4 w-4" />
                          Add Member
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedGroup(group)
                          setIsViewMembersDialogOpen(true)
                        }}>
                          <Users className="mr-2 h-4 w-4" />
                          View Members
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => {
                          setSelectedGroup(group)
                          setRenameInput(group.name)
                          setIsRenameDialogOpen(true)
                        }}>
                          <Edit className="mr-2 h-4 w-4" />
                          Rename
                        </DropdownMenuItem>
                        {isAdmin && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDeleteGroup(group)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {group.lastMessage ? (
                  <p className="text-sm text-muted-foreground truncate">
                    {(group.lastMessage as any).encryptedContent || (group.lastMessage as any)}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">
                    No messages yet
                  </p>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add member dialog */}
      <Dialog open={isAddMemberDialogOpen} onOpenChange={setIsAddMemberDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Member</DialogTitle>
            <DialogDescription>
              Add a user to {selectedGroup?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Select User</Label>
              <ScrollArea className="h-64 rounded-md border">
                <div className="p-2 space-y-1">
                  {allUsers
                    .filter((u) => !groupMembers.some((m) => m.id === u.id))
                    .map((u) => (
                      <button
                        key={u.id}
                        onClick={() => setSelectedUserId(u.id)}
                        className={`w-full flex items-center gap-3 p-2 rounded-lg transition-colors ${selectedUserId === u.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                          }`}
                      >
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">
                            {u.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-sm">{u.fullName}</span>
                      </button>
                    ))}
                </div>
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddMemberDialogOpen(false)
                setSelectedUserId(null)
              }}
            >
              Cancel
            </Button>
            <Button onClick={handleAddMember} disabled={!selectedUserId}>
              Add Member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename dialog */}
      <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Group</DialogTitle>
            <DialogDescription>
              Change the name of {selectedGroup?.name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleRenameGroup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="renameInput">New Name</Label>
              <Input
                id="renameInput"
                placeholder="e.g., Development Team"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsRenameDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isRenaming || !renameInput.trim() || renameInput === selectedGroup?.name}>
                {isRenaming ? 'Renaming...' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* View Members dialog */}
      <Dialog open={isViewMembersDialogOpen} onOpenChange={setIsViewMembersDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Group Members</DialogTitle>
            <DialogDescription>
              Members of {selectedGroup?.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <ScrollArea className="h-64 rounded-md border">
              {isLoadingMembers ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                </div>
              ) : groupMembers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                  <p className="text-sm">No members found</p>
                </div>
              ) : (
                <div className="p-2 space-y-1">
                  {groupMembers.map((m, idx) => (
                    <div key={idx} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                      <div className="relative">
                        <Avatar className="h-9 w-9">
                          <AvatarFallback className="text-xs bg-secondary">
                            {m.fullName
                              .split(' ')
                              .map((n) => n[0])
                              .join('')
                              .toUpperCase()
                              .slice(0, 2)}
                          </AvatarFallback>
                        </Avatar>
                        <span
                          className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card ${m.isActive ? 'bg-green-500' : 'bg-muted-foreground'
                            }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{m.fullName}</p>
                        <p className="text-xs text-muted-foreground">
                          {m.isActive ? 'Online' : 'Offline'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
          <DialogFooter>
            <Button onClick={() => setIsViewMembersDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
