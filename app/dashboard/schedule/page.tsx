'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { getAvatarUrl, cn } from '@/lib/utils'
import { schedulesApi, WorkScheduleResponse } from '@/lib/api'
import { adminApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Users, 
  Plus, 
  Check, 
  X, 
  Trash2, 
  Video, 
  ChevronLeft, 
  ChevronRight,
  Search,
  MoreVertical
} from 'lucide-react'
import { toast } from 'sonner'
import { format, isSameDay, isSameWeek, isSameMonth, addMonths, subMonths, addDays, subDays, addWeeks, subWeeks, parseISO, isPast } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

export default function SchedulePage() {
  const { token, user } = useAuth()
  const [schedules, setSchedules] = useState<WorkScheduleResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [view, setView] = useState<'day' | 'week' | 'month'>('week')

  // New Schedule states
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')
  
  // Participant picking
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([])
  const [showVNHolidays, setShowVNHolidays] = useState(true)

  const vn2026Holidays = [
    { date: new Date(2026, 0, 1), label: 'Tết Dương Lịch' },
    { date: new Date(2026, 1, 16), label: 'Giao thừa' },
    { date: new Date(2026, 1, 17), label: 'Mùng 1 Tết Bính Ngọ' },
    { date: new Date(2026, 1, 18), label: 'Mùng 2 Tết Bính Ngọ' },
    { date: new Date(2026, 1, 19), label: 'Mùng 3 Tết Bính Ngọ' },
    { date: new Date(2026, 3, 26), label: 'Giỗ tổ Hùng Vương' },
    { date: new Date(2026, 3, 30), label: 'Giải phóng miền Nam' },
    { date: new Date(2026, 4, 1), label: 'Quốc tế Lao động' },
    { date: new Date(2026, 8, 2), label: 'Quốc khánh' },
  ]

  const { lastScheduleUpdate } = useSignalR()

  useEffect(() => {
    if (lastScheduleUpdate) {
      loadData()
    }
  }, [lastScheduleUpdate])

  useEffect(() => {
    if (token) {
      loadData()
    }
  }, [token])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const sch = await schedulesApi.getMySchedules(token!)
      setSchedules(sch.filter(s => !isNaN(new Date(s.startTime).getTime())))
      
      const usersData = await adminApi.getAllUsers(token!)
      // Show all users but allow excluding current user if needed, or keeping it for verification
      setAllUsers(usersData)
    } catch (e) {
      console.error(e)
      toast.error('Không thể tải dữ liệu lịch trình')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!title || !startDate || !startTime || !endDate || !endTime) {
      toast.error('Vui lòng điền các trường bắt buộc (Tiêu đề, Thời gian)')
      return
    }

    try {
      const startIso = new Date(`${startDate}T${startTime}`).toISOString()
      const endIso = new Date(`${endDate}T${endTime}`).toISOString()

      await schedulesApi.create(token!, {
        title,
        description,
        startTime: startIso,
        endTime: endIso,
        location,
        participantIds: selectedParticipants
      })

      toast.success('Đã tạo lịch hẹn thành công!')
      setIsAddOpen(false)
      loadData()
      // reset
      setTitle('')
      setDescription('')
      setLocation('')
      setSelectedParticipants([])
    } catch (e) {
      toast.error('Lỗi khi tạo lịch trình')
    }
  }

  const handleResponse = async (id: number, status: 'Accepted' | 'Declined') => {
    try {
      await schedulesApi.updateStatus(token!, id, status)
      toast.success(status === 'Accepted' ? 'Đã chấp nhận lời mời' : 'Đã từ chối lời mời')
      loadData()
    } catch {
      toast.error('Không thể cập nhật trạng thái')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Xóa lịch trình này?')) return
    try {
      await schedulesApi.delete(token!, id)
      toast.success('Đã xóa thành công')
      loadData()
    } catch {
      toast.error('Lỗi khi xóa')
    }
  }

  const handleNavigate = (direction: 'next' | 'prev') => {
    let newDate = new Date(selectedDate);
    if (view === 'day') {
      newDate = direction === 'next' ? addDays(newDate, 1) : subDays(newDate, 1);
    } else if (view === 'week') {
      newDate = direction === 'next' ? addWeeks(newDate, 1) : subWeeks(newDate, 1);
    } else if (view === 'month') {
      newDate = direction === 'next' ? addMonths(newDate, 1) : subMonths(newDate, 1);
    }
    setSelectedDate(newDate);
    setCurrentMonth(newDate);
  }

  const filteredByDate = schedules.filter(sch => {
    const schDate = parseISO(sch.startTime)
    if (view === 'day') {
      return isSameDay(schDate, selectedDate)
    } else if (view === 'week') {
      return isSameWeek(schDate, selectedDate, { weekStartsOn: 1, locale: vi })
    } else if (view === 'month') {
      return isSameMonth(schDate, selectedDate)
    }
    return isSameDay(schDate, selectedDate)
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const currentHolidays = vn2026Holidays.filter(h => {
    if (view === 'day') return isSameDay(h.date, selectedDate);
    if (view === 'week') return isSameWeek(h.date, selectedDate, { weekStartsOn: 1, locale: vi });
    if (view === 'month') return isSameMonth(h.date, selectedDate);
    return false;
  })

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6 overflow-hidden">
      {/* Sidebar - Mini Calendar */}
      <div className="w-80 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold">Lịch</h2>
          </div>
          
          <div className="bg-card rounded-2xl border p-2 shadow-sm">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={(date) => {
                if (date) {
                  setSelectedDate(date);
                  setCurrentMonth(date);
                }
              }}
              month={currentMonth}
              onMonthChange={setCurrentMonth}
              className="w-full"
              locale={vi}
              modifiers={{
                hasEvent: (date) => schedules.some(s => isSameDay(parseISO(s.startTime), date)),
                unfinished: (date) => schedules.some(s => isSameDay(parseISO(s.startTime), date) && !isPast(new Date(s.endTime))),
                ongoing: (date) => schedules.some(s => {
                   const start = new Date(s.startTime);
                   const end = new Date(s.endTime);
                   const now = new Date();
                   return isSameDay(start, date) && now >= start && now <= end;
                }),
                completed: (date) => schedules.every(s => isSameDay(parseISO(s.startTime), date) ? isPast(new Date(s.endTime)) : true) && schedules.some(s => isSameDay(parseISO(s.startTime), date)),
                holiday: (date) => showVNHolidays && vn2026Holidays.some(h => isSameDay(h.date, date)),
                viewHighlight: (date) => {
                   if (view === 'week') return isSameWeek(date, selectedDate, { weekStartsOn: 1 });
                   if (view === 'month') return isSameMonth(date, selectedDate);
                   return false;
                }
              }}
              modifiersStyles={{
                hasEvent: { fontWeight: 'bold', color: 'hsl(var(--primary))' },
                unfinished: { borderBottom: '2px solid #ef4444' }, // Red dot/line
                ongoing: { borderBottom: '2px solid #eab308' },    // Yellow dot/line
                completed: { borderBottom: '2px solid #22c55e' },  // Green dot/line
                holiday: { color: '#3b82f6', backgroundColor: '#eff6ff', borderRadius: '50%' },
                viewHighlight: { backgroundColor: 'hsl(var(--primary) / 0.1)', color: 'hsl(var(--primary))', borderRadius: '4px' }
              }}
            />
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-1">Lịch của tôi</h3>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary cursor-pointer transition-all">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span className="text-sm font-medium">Sự kiện chính</span>
            </div>
            <div 
              onClick={() => setShowVNHolidays(!showVNHolidays)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all",
                showVNHolidays ? "bg-blue-500/10 text-blue-600" : "hover:bg-muted text-muted-foreground"
              )}
            >
              <div className={cn("h-3 w-3 rounded-full", showVNHolidays ? "bg-blue-600" : "bg-blue-500")} />
              <span className="text-sm font-medium">Ngày lễ VN</span>
            </div>
          </div>
        </div>

        <div className="mt-auto p-4 bg-muted/30 rounded-2xl border border-dashed text-center">
          <Video className="h-8 w-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">Tích hợp cuộc họp E2EE bảo mật</p>
        </div>
      </div>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-w-0 bg-card rounded-2xl border shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 border-b flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-muted/10">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold tracking-tight shrink-0">
              {format(selectedDate, 'eeee, dd MMMM', { locale: vi })}
            </h1>
            <div className="flex items-center gap-1 bg-background border rounded-lg p-1">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleNavigate('prev')}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 px-3 font-medium" onClick={() => {
                const now = new Date();
                setSelectedDate(now);
                setCurrentMonth(now);
              }}>
                Hôm nay
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleNavigate('next')}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">

            <div className="flex items-center gap-1 bg-background border rounded-lg p-1">
              <Button 
                variant={view === 'day' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 px-3 text-xs"
                onClick={() => setView('day')}
              >
                Ngày
              </Button>
              <Button 
                variant={view === 'week' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 px-3 text-xs"
                onClick={() => setView('week')}
              >
                Tuần
              </Button>
              <Button 
                variant={view === 'month' ? 'secondary' : 'ghost'} 
                size="sm" 
                className="h-8 px-3 text-xs"
                onClick={() => setView('month')}
              >
                Tháng
              </Button>
            </div>

            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <DialogTrigger asChild>
                <Button className="h-9 gap-2 shadow-lg">
                  <Plus className="h-4 w-4" />
                  Sự kiện mới
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden max-h-[95vh] flex flex-col">
                <DialogDescription className="sr-only">
                    Tạo một lịch hẹn hoặc sự kiện mới và mời các thành viên tham gia thảo luận.
                </DialogDescription>
                <div className="bg-primary p-6 text-primary-foreground shrink-0">
                   <DialogTitle className="text-2xl font-bold flex items-center gap-2">
                    <CalendarIcon className="h-6 w-6" />
                    Tạo sự kiện mới
                   </DialogTitle>
                </div>
                
                <ScrollArea className="flex-1 overflow-y-auto">
                  <div className="p-8 space-y-6">
                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Tên sự kiện <span className="text-destructive">*</span></Label>
                      <Input 
                        value={title} 
                        onChange={e => setTitle(e.target.value)} 
                        placeholder="Ví dụ: Họp Stand-up hàng ngày" 
                        className="h-11 rounded-xl"
                      />
                    </div>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Bắt đầu <span className="text-destructive">*</span></Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-11 rounded-xl" />
                          <Input type="time" lang="en-GB" value={startTime} onChange={e => setStartTime(e.target.value)} className="h-11 rounded-xl sm:w-32" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-semibold">Kết thúc <span className="text-destructive">*</span></Label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-11 rounded-xl" />
                          <Input type="time" lang="en-GB" value={endTime} onChange={e => setEndTime(e.target.value)} className="h-11 rounded-xl sm:w-32" />
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Địa điểm / Link phòng họp</Label>
                      <Input 
                        value={location} 
                        onChange={e => setLocation(e.target.value)} 
                        placeholder="Phòng họp A hoặc Link E2EE" 
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label className="text-sm font-semibold">Mô tả sự kiện</Label>
                      <Input 
                        value={description} 
                        onChange={e => setDescription(e.target.value)} 
                        placeholder="Nội dung chính của cuộc họp..." 
                        className="h-11 rounded-xl"
                      />
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-semibold">Thành phần tham dự</Label>
                      <div className="border rounded-2xl p-4 bg-muted/20">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {allUsers.map(u => (
                            <label key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted cursor-pointer transition-all">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 rounded border-gray-300 text-primary"
                                checked={selectedParticipants.includes(u.id)}
                                onChange={(e) => {
                                  if (e.target.checked) setSelectedParticipants([...selectedParticipants, u.id])
                                  else setSelectedParticipants(selectedParticipants.filter(id => id !== u.id))
                                }}
                              />
                              <div className="flex items-center gap-2">
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={getAvatarUrl(u.avatarPath)} />
                                  <AvatarFallback className="text-[10px]">{u.fullName.charAt(0)}</AvatarFallback>
                                </Avatar>
                                <span className="text-xs font-medium">{u.fullName}</span>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>

                <div className="p-6 bg-muted/10 border-t flex justify-end gap-3 shrink-0">
                  <Button variant="ghost" onClick={() => setIsAddOpen(false)} className="rounded-xl">Hủy</Button>
                  <Button onClick={handleCreate} className="rounded-xl px-8 shadow-md">Tạo lịch</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Content Area */}
        <ScrollArea className="flex-1 p-6 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center p-20 animate-pulse">
              <CalendarIcon className="h-12 w-12 text-muted-foreground/30 mb-4" />
              <p className="text-muted-foreground">Đang tải lịch trình...</p>
            </div>
          ) : (filteredByDate.length === 0 && (!showVNHolidays || currentHolidays.length === 0)) ? (
            <div className="h-[400px] flex flex-col items-center justify-center text-center space-y-4">
              <div className="h-20 w-20 bg-muted/30 rounded-full flex items-center justify-center mb-2">
                <CalendarIcon className="h-10 w-10 text-muted-foreground/20" />
              </div>
              <div>
                <h3 className="text-lg font-bold">Không có sự kiện nào</h3>
                <p className="text-sm text-muted-foreground max-w-[250px] mx-auto">
                  Bạn không có sự kiện nào trong {view === 'day' ? 'ngày này' : view === 'week' ? 'tuần này' : 'tháng này'}.
                </p>
              </div>
              <Button variant="outline" className="rounded-xl" onClick={() => setIsAddOpen(true)}>
                Tạo sự kiện mới
              </Button>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
              {showVNHolidays && currentHolidays.map((holiday, i) => (
                <div key={i} className="bg-blue-50 border border-blue-100 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-4 animate-in fade-in slide-in-from-top-4 duration-500">
                  <div className="h-12 w-12 rounded-full bg-blue-500 text-white flex items-center justify-center shrink-0 shadow-lg shadow-blue-200">
                    <CalendarIcon className="h-6 w-6" />
                  </div>
                  <div className="flex-1 text-center md:text-left">
                    <h4 className="text-blue-700 font-bold text-lg">{holiday.label}</h4>
                    <p className="text-blue-600/80 text-sm font-medium">Hệ thống gợi nhắc: Ngày {format(holiday.date, 'dd/MM/yyyy')} là ngày lễ quốc gia.</p>
                  </div>
                  <Badge className="bg-blue-600 text-white border-none px-4 py-1.5 rounded-xl uppercase text-[10px] font-bold">Ngày lễ</Badge>
                </div>
              ))}
              {filteredByDate.map(sch => {
                const isCreator = sch.userRole === 'Creator';
                const meParticipant = sch.participants.find(p => p.userId === user?.id);
                const myStatus = meParticipant?.status;
                const now = new Date();
                const start = new Date(sch.startTime);
                const end = new Date(sch.endTime);
                
                const isFinished = isPast(end);
                const isOngoing = now >= start && now <= end;
                const isUpcoming = now < start;

                let statusColor = "bg-primary"; // Default
                if (isFinished) statusColor = "bg-green-500";
                else if (isOngoing) statusColor = "bg-yellow-500";
                else if (isUpcoming) statusColor = "bg-red-500";

                return (
                  <Card key={sch.id} className={cn(
                    "group relative overflow-hidden transition-all duration-300 border hover:shadow-lg",
                    isFinished ? "opacity-60 bg-muted/5" : "bg-card shadow-sm"
                  )}>
                    <div className={cn(
                      "absolute left-0 top-0 bottom-0 w-1",
                      statusColor
                    )} />
                    
                    <CardContent className="p-0">
                      <div className="flex flex-col md:flex-row">
                        {/* Time Column */}
                        <div className="w-40 p-6 flex flex-col justify-center items-center bg-muted/5 border-r shrink-0">
                          <span className="text-xl font-bold tracking-tight">
                            {format(new Date(sch.startTime), 'HH:mm')}
                          </span>
                          <span className="text-[10px] text-muted-foreground mt-1 uppercase font-semibold">Kết thúc {format(new Date(sch.endTime), 'HH:mm')}</span>
                        </div>

                        {/* Info Column */}
                        <div className="flex-1 p-6 flex flex-col justify-between">
                          <div className="flex justify-between items-start gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-bold text-lg group-hover:text-primary transition-colors">
                                  {sch.title}
                                </h3>
                                {isFinished && <Badge className="bg-green-500/10 text-green-500 hover:bg-green-500/20 text-[8px] font-bold border-none uppercase">Hoàn thành</Badge>}
                                {isOngoing && <Badge className="bg-yellow-500/10 text-yellow-500 hover:bg-yellow-500/20 text-[8px] font-bold border-none uppercase animate-pulse">Đang diễn ra</Badge>}
                                {isUpcoming && <Badge className="bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[8px] font-bold border-none uppercase">Sắp diễn ra</Badge>}
                              </div>
                              {sch.description && (
                                <p className="text-sm text-muted-foreground line-clamp-1 mt-1 font-medium">
                                  {sch.description}
                                </p>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-all">
                              {isCreator && (
                                <Button 
                                  variant="ghost" 
                                  size="icon" 
                                  className="h-8 w-8 rounded-lg text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(sch.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                              <Button variant="outline" size="icon" className="h-8 w-8 rounded-lg">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          
                          <div className="mt-4 flex flex-wrap items-center gap-y-3 gap-x-6">
                            {sch.location && (
                              <div className="flex items-center text-xs gap-2 text-muted-foreground font-semibold bg-muted/40 px-2 py-1 rounded">
                                {sch.location.toLowerCase().includes('http') ? <Video className="h-3 w-3 text-primary" /> : <MapPin className="h-3 w-3" />}
                                <span className="truncate max-w-[150px]">{sch.location}</span>
                              </div>
                            )}

                            <div className="flex items-center gap-2">
                              <div className="flex -space-x-1.5">
                                {sch.participants.slice(0, 3).map(p => (
                                  <Avatar key={p.userId} className="h-6 w-6 border-2 border-card shadow-sm">
                                    <AvatarImage src={getAvatarUrl(p.avatarPath)} />
                                    <AvatarFallback className="text-[8px] bg-muted">{p.fullName.charAt(0)}</AvatarFallback>
                                  </Avatar>
                                ))}
                                {sch.participants.length > 3 && (
                                  <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[8px] font-bold text-muted-foreground">
                                    +{sch.participants.length - 3}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Action Column */}
                        <div className="w-full md:w-52 p-6 flex flex-col justify-center gap-3 border-t md:border-t-0 md:border-l bg-muted/5">
                          {sch.location && sch.location.toLowerCase().includes('http') && (
                            <Button 
                              className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-2 rounded-xl h-10 font-bold shadow-lg shadow-blue-200 dark:shadow-none"
                              onClick={() => window.open(sch.location, '_blank')}
                            >
                              <Video className="h-4 w-4" /> Tham gia trực tiếp
                            </Button>
                          )}

                          {!isCreator ? (
                            myStatus === 'Pending' ? (
                              <div className="flex flex-col gap-2">
                                <Button 
                                  className="w-full bg-green-500 hover:bg-green-600 border-none gap-2 text-white shadow-md rounded-xl" 
                                  onClick={() => handleResponse(sch.id, 'Accepted')}
                                  size="sm"
                                >
                                  <Check className="h-3 w-3" /> Chấp nhận
                                </Button>
                                <Button 
                                  variant="outline" 
                                  className="w-full gap-2 rounded-xl" 
                                  onClick={() => handleResponse(sch.id, 'Declined')}
                                  size="sm"
                                >
                                  <X className="h-3 w-3" /> Từ chối
                                </Button>
                              </div>
                            ) : (
                              <div className="text-center py-2">
                                <Badge variant={myStatus === 'Accepted' ? 'default' : 'destructive'} className="bg-opacity-10 text-xs px-4 py-1.5 rounded-lg border-none font-bold">
                                  {myStatus === 'Accepted' ? '✓ Đã tham gia' : '✕ Đã từ chối'}
                                </Badge>
                              </div>
                            )
                          ) : (
                            <div className="flex flex-col items-center justify-center text-center gap-1.5 bg-background/50 p-3 rounded-2xl border border-dashed">
                               <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">PHẢN HỒI</p>
                               <div className="flex items-center gap-4 mt-1">
                                 <div className="text-center">
                                    <p className="text-sm font-bold text-green-500 leading-none">{sch.participants.filter(p => p.status === 'Accepted').length}</p>
                                    <p className="text-[9px] text-muted-foreground font-bold mt-1">Có</p>
                                 </div>
                                 <Separator orientation="vertical" className="h-6" />
                                 <div className="text-center">
                                    <p className="text-sm font-bold text-destructive leading-none">{sch.participants.filter(p => p.status === 'Declined').length}</p>
                                    <p className="text-[9px] text-muted-foreground font-bold mt-1">Không</p>
                                 </div>
                               </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  )
}
