'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useSignalR } from '@/hooks/use-signalr'
import { adminApi } from '@/lib/api'
import { getAvatarUrl } from '@/lib/utils'
import { toast } from 'sonner'
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useSearch } from '@/features/admin/search-context'
import {
  Search,
  UserPlus,
  MoreHorizontal,
  Edit,
  Trash2,
  Shield,
  User,
  Mail,
  Phone,
  Check,
  X,
} from 'lucide-react'

interface UserData {
  id: number
  username: string
  fullName: string
  email: string
  employeeCode: string
  phone: string
  isActive: boolean
  avatarPath: string
  roleName: string
}

export default function UsersPage() {
  const { token, user } = useAuth()
  const { searchQuery, setSearchQuery } = useSearch()
  const { lastUserUpdate } = useSignalR()
  const [users, setUsers] = useState<UserData[]>([])
  const [filteredUsers, setFilteredUsers] = useState<UserData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // New user form state
  const [newUser, setNewUser] = useState({
    employeeCode: '',
    username: '',
    password: '',
    fullName: '',
    email: '',
    phone: '',
    roleId: 3, // Default to Employee
  })

  useEffect(() => {
    loadUsers()
  }, [token])

  useEffect(() => {
    if (lastUserUpdate) {
      setUsers(prev => prev.map(u => {
        if (u.id === lastUserUpdate.userId) {
          return { ...u, avatarPath: lastUserUpdate.avatarPath }
        }
        return u
      }))
    }
  }, [lastUserUpdate])

  useEffect(() => {
    const filtered = users.filter((u) => {
      const query = (searchQuery || '').toLowerCase();
      return (
        (u.fullName || '').toLowerCase().includes(query) ||
        (u.email || '').toLowerCase().includes(query) ||
        (u.username || '').toLowerCase().includes(query) ||
        (u.employeeCode || '').toLowerCase().includes(query)
      );
    })
    setFilteredUsers(filtered)
  }, [users, searchQuery])

  const loadUsers = async () => {
    if (!token) return
    try {
      const data = await adminApi.getAllUsers(token)
      setUsers(data)
      setFilteredUsers(data)
    } catch (error) {
      console.error('Failed to load users:', error)
      toast.error('Không thể tải danh sách người dùng')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return

    setIsCreating(true)
    try {
      await adminApi.createUser(token, {
        employeeCode: newUser.employeeCode,
        username: newUser.username,
        password: newUser.password,
        fullName: newUser.fullName,
        email: newUser.email,
        phone: newUser.phone,
        roleId: newUser.roleId,
      })
      toast.success('Đã tạo người dùng thành công')
      setIsCreateDialogOpen(false)
      setNewUser({
        employeeCode: '',
        username: '',
        password: '',
        fullName: '',
        email: '',
        phone: '',
        roleId: 3,
      })
      loadUsers()
    } catch (error) {
      console.error('Failed to create user:', error)
      toast.error(error instanceof Error ? error.message : 'Tạo người dùng thất bại')
    } finally {
      setIsCreating(false)
    }
  }

  const handleDeleteUser = async (id: number) => {
    if (!token) return
    if (!window.confirm("Bạn có chắc chắn muốn vô hiệu hóa người dùng này không?")) return
    try {
      await adminApi.deleteUser(token, id)
      toast.success("Đã vô hiệu hóa người dùng thành công")
      loadUsers()
    } catch (error) {
      console.error('Failed to delete user:', error)
      toast.error('Vô hiệu hóa người dùng thất bại')
    }
  }

  const handleChangeRole = async (id: number, currentRole: string) => {
    if (!token) return
    const roles: Record<string, number> = { 'Admin': 1, 'Manager': 2, 'Employee': 3 }
    const nextRoleName = currentRole === 'Admin' ? 'Manager' : currentRole === 'Manager' ? 'Employee' : 'Admin'
    const nextRoleDisplayName = nextRoleName === 'Admin' ? 'Quản trị viên' : nextRoleName === 'Manager' ? 'Quản lý' : 'Nhân viên'
    const newRoleId = roles[nextRoleName]
    if (!window.confirm(`Thay đổi vai trò của người dùng này thành ${nextRoleDisplayName}?`)) return
    
    try {
      await adminApi.changeRole(token, id, newRoleId)
      toast.success("Đã thay đổi vai trò thành công")
      loadUsers()
    } catch (error) {
      console.error('Failed to change role:', error)
      toast.error('Thay đổi vai trò thất bại')
    }
  }

  const handleEditUser = (user: UserData) => {
    toast('Chức năng Edit User đang được phát triển!')
  }

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2)
  }

  const getRoleBadgeVariant = (role: string) => {
    switch (role) {
      case 'Admin':
        return 'default'
      case 'Manager':
        return 'secondary'
      default:
        return 'outline'
    }
  }

  const isAdmin = user?.role === 'Admin'

  if (!isAdmin) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-16">
          <Shield className="h-12 w-12 text-muted-foreground mb-4" />
          <h2 className="text-xl font-semibold mb-2">Truy cập bị từ chối</h2>
          <p className="text-muted-foreground">Chỉ quản trị viên mới có thể quản lý người dùng.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Quản lý người dùng</h2>
          <p className="text-muted-foreground">
            Tạo, chỉnh sửa và quản lý tài khoản nhân viên
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <UserPlus className="mr-2 h-4 w-4" />
              Thêm người dùng
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md" aria-describedby={undefined}>
            <DialogHeader>
              <DialogTitle>Tạo người dùng mới</DialogTitle>
              <DialogDescription>
                Thêm một tài khoản nhân viên mới vào hệ thống
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateUser} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="employeeCode">Mã nhân viên</Label>
                  <Input
                    id="employeeCode"
                    placeholder="EMP001"
                    value={newUser.employeeCode}
                    onChange={(e) =>
                      setNewUser({ ...newUser, employeeCode: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="username">Tên đăng nhập</Label>
                  <Input
                    id="username"
                    placeholder="johndoe"
                    value={newUser.username}
                    onChange={(e) =>
                      setNewUser({ ...newUser, username: e.target.value })
                    }
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="fullName">Họ và tên</Label>
                <Input
                  id="fullName"
                  placeholder="John Doe"
                  value={newUser.fullName}
                  onChange={(e) =>
                    setNewUser({ ...newUser, fullName: e.target.value })
                  }
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="john@company.com"
                  value={newUser.email}
                  onChange={(e) =>
                    setNewUser({ ...newUser, email: e.target.value })
                  }
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="phone">Số điện thoại</Label>
                  <Input
                    id="phone"
                    placeholder="+1234567890"
                    value={newUser.phone}
                    onChange={(e) =>
                      setNewUser({ ...newUser, phone: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="role">Vai trò</Label>
                  <Select
                    value={newUser.roleId.toString()}
                    onValueChange={(value) =>
                      setNewUser({ ...newUser, roleId: parseInt(value) })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">Quản trị viên</SelectItem>
                      <SelectItem value="2">Quản lý</SelectItem>
                      <SelectItem value="3">Nhân viên</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Mật khẩu</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Tối thiểu 8 ký tự"
                  value={newUser.password}
                  onChange={(e) =>
                    setNewUser({ ...newUser, password: e.target.value })
                  }
                   pattern="^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$"
                  title="Tối thiểu 8 ký tự, bao gồm chữ hoa, chữ thường, số, ký tự đặc biệt."
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Phải bao gồm chữ hoa, chữ thường, số và ký tự đặc biệt
                </p>
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Hủy
                </Button>
                <Button type="submit" disabled={isCreating}>
                  {isCreating ? 'Đang tạo...' : 'Tạo người dùng'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters card removed and merged into top search */}

      {/* Users table */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <User className="h-12 w-12 mb-4 opacity-20" />
              <p>Không tìm thấy người dùng nào</p>
            </div>
          ) : (
            <ScrollArea className="h-125">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Người dùng</TableHead>
                    <TableHead className="hidden md:table-cell">Mã nhân viên</TableHead>
                    <TableHead className="hidden sm:table-cell">Vai trò</TableHead>
                    <TableHead className="hidden lg:table-cell">Liên hệ</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead className="w-12.5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((userData) => (
                    <TableRow key={userData.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9">
                            <AvatarImage src={getAvatarUrl(userData.avatarPath)} />
                            <AvatarFallback className="text-xs">
                              {getInitials(userData.fullName)}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="font-medium">{userData.fullName}</p>
                            <p className="text-xs text-muted-foreground">
                              @{userData.username}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {userData.employeeCode}
                        </code>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant={getRoleBadgeVariant(userData.roleName)}>
                          {userData.roleName === 'Admin' ? 'Quản trị viên' : userData.roleName === 'Manager' ? 'Quản lý' : 'Nhân viên'}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Mail className="h-3 w-3 text-muted-foreground" />
                            <span className="truncate max-w-45">{userData.email}</span>
                          </div>
                          {userData.phone && (
                            <div className="flex items-center gap-1.5 text-xs">
                              <Phone className="h-3 w-3 text-muted-foreground" />
                              <span>{userData.phone}</span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {userData.isActive ? (
                            <>
                              <span className="h-2 w-2 rounded-full bg-online" />
                              <span className="text-xs">Đang hoạt động</span>
                            </>
                          ) : (
                            <>
                              <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                              <span className="text-xs">Ngừng hoạt động</span>
                            </>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
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
                            <DropdownMenuItem onClick={() => handleEditUser(userData)}>
                              <Edit className="mr-2 h-4 w-4" />
                              Chỉnh sửa
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleChangeRole(userData.id, userData.roleName)}>
                              <Shield className="mr-2 h-4 w-4" />
                              Thay đổi vai trò
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive" onClick={() => handleDeleteUser(userData.id)}>
                              <Trash2 className="mr-2 h-4 w-4" />
                              Xóa
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

