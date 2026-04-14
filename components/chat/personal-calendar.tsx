'use client'

import { useState, useEffect } from 'react'
import { schedulesApi, WorkScheduleResponse } from '@/lib/api'
import { getAvatarUrl, cn } from '@/lib/utils'
import { 
  format, isSameDay, parseISO, isPast, 
  addDays, addWeeks, addMonths, 
  subDays, subWeeks, subMonths, 
  isSameWeek, isSameMonth 
} from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSignalR } from '@/hooks/use-signalr'
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, MapPin, Video } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PersonalCalendarProps {
  token: string
  userRole?: string
}

// Vietnamese 2026 public holidays
const vn2026Holidays = [
  { date: new Date(2026, 0, 1),  label: 'Tết Dương Lịch' },
  { date: new Date(2026, 1, 16), label: 'Giao thừa' },
  { date: new Date(2026, 1, 17), label: 'Mùng 1 Tết Bính Ngọ' },
  { date: new Date(2026, 1, 18), label: 'Mùng 2 Tết Bính Ngọ' },
  { date: new Date(2026, 1, 19), label: 'Mùng 3 Tết Bính Ngọ' },
  { date: new Date(2026, 3, 26), label: 'Giỗ Tổ Hùng Vương' },
  { date: new Date(2026, 3, 30), label: 'Giải phóng miền Nam' },
  { date: new Date(2026, 4, 1),  label: 'Quốc tế Lao động' },
  { date: new Date(2026, 8, 2),  label: 'Quốc khánh' },
]

export function PersonalCalendar({ token, userRole }: PersonalCalendarProps) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const [schedules, setSchedules] = useState<WorkScheduleResponse[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(true)
  const [showVNHolidays, setShowVNHolidays] = useState(true)
  const { lastScheduleUpdate } = useSignalR()

  useEffect(() => { load() }, [token, lastScheduleUpdate])

  const load = async () => {
    setIsLoading(true)
    try {
      const data = userRole === 'Admin'
        ? await schedulesApi.getAllSchedules(token)
        : await schedulesApi.getMySchedules(token)
      // Deduplicate by ID, filter invalid dates
      const map = new Map()
      data.forEach((s: WorkScheduleResponse) => map.set(s.id, s))
      setSchedules(Array.from(map.values()).filter((s: WorkScheduleResponse) => !isNaN(new Date(s.startTime).getTime())))
    } catch {
      try {
        const data = await schedulesApi.getMySchedules(token)
        setSchedules(data.filter((s: WorkScheduleResponse) => !isNaN(new Date(s.startTime).getTime())))
      } catch { /* ignore */ }
    } finally {
      setIsLoading(false)
    }
  }

  const parseTime = (dateStr: string) => {
    if (!dateStr) return new Date()
    const cleaned = (dateStr.includes('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z'
    return new Date(cleaned)
  }

  const handleNavigate = (direction: 'next' | 'prev') => {
    let d = new Date(selectedDate)
    if (view === 'day') d = direction === 'next' ? addDays(d, 1) : subDays(d, 1)
    else if (view === 'week') d = direction === 'next' ? addWeeks(d, 1) : subWeeks(d, 1)
    else d = direction === 'next' ? addMonths(d, 1) : subMonths(d, 1)
    setSelectedDate(d)
    setCurrentMonth(d)
  }

  const filtered = schedules.filter(sch => {
    const schDate = parseISO(sch.startTime)
    if (view === 'day') return isSameDay(schDate, selectedDate)
    if (view === 'week') return isSameWeek(schDate, selectedDate, { weekStartsOn: 1, locale: vi })
    if (view === 'month') return isSameMonth(schDate, selectedDate)
    return isSameDay(schDate, selectedDate)
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  const currentHolidays = showVNHolidays ? vn2026Holidays.filter(h => {
    if (view === 'day') return isSameDay(h.date, selectedDate)
    if (view === 'week') return isSameWeek(h.date, selectedDate, { weekStartsOn: 1, locale: vi })
    if (view === 'month') return isSameMonth(h.date, selectedDate)
    return false
  }) : []

  const viewLabel = view === 'day'
    ? format(selectedDate, 'eeee, dd MMMM', { locale: vi })
    : view === 'week'
    ? `Tuần ${format(selectedDate, 'dd/MM', { locale: vi })}`
    : `Tháng ${format(selectedDate, 'MM, yyyy', { locale: vi })}`

  return (
    <div className="flex h-full gap-6 p-6 overflow-hidden">
      {/* Mini Calendar Sidebar */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
        <div className="bg-muted/10 rounded-3xl border border-white/5 p-3 shadow-inner">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => {
              if (date) { setSelectedDate(date); setCurrentMonth(date) }
            }}
            month={currentMonth}
            onMonthChange={setCurrentMonth}
            className="w-full"
            locale={vi}
            modifiers={{
              hasEvent: (date) => schedules.some(s => isSameDay(parseISO(s.startTime), date)),
              // Only show red on dates with a future-starting event (not yet started)
              unfinished: (date) => schedules.some(s =>
                isSameDay(parseISO(s.startTime), date) && !isPast(new Date(s.endTime))
              ),
              // Only show yellow on dates where event is CURRENTLY in progress
              ongoing: (date) => schedules.some(s => {
                const start = new Date(s.startTime)
                const end = new Date(s.endTime)
                const now = new Date()
                return isSameDay(start, date) && now >= start && now <= end
              }),
              // Green on days where ALL events that day are finished
              completed: (date) =>
                schedules.some(s => isSameDay(parseISO(s.startTime), date)) &&
                schedules.every(s => isSameDay(parseISO(s.startTime), date) ? isPast(new Date(s.endTime)) : true),
              holiday: (date) => showVNHolidays && vn2026Holidays.some(h => isSameDay(h.date, date)),
              weekHighlightStart: (date) => view === 'week' && isSameWeek(date, selectedDate, { weekStartsOn: 1 }) && date.getDay() === 1,
              weekHighlightEnd:   (date) => view === 'week' && isSameWeek(date, selectedDate, { weekStartsOn: 1 }) && date.getDay() === 0,
              weekHighlightMiddle:(date) => view === 'week' && isSameWeek(date, selectedDate, { weekStartsOn: 1 }) && date.getDay() !== 1 && date.getDay() !== 0,
              monthHighlight:     (date) => view === 'month' && isSameMonth(date, selectedDate),
            }}
            modifiersClassNames={{
              weekHighlightStart:  'bg-primary/20 text-primary rounded-l-md rounded-r-none',
              weekHighlightEnd:    'bg-primary/20 text-primary rounded-r-md rounded-l-none',
              weekHighlightMiddle: 'bg-primary/20 text-primary rounded-none',
              monthHighlight:      'bg-primary/10 text-primary rounded-md',
              holiday:             'text-blue-400',
            }}
            modifiersStyles={{
              hasEvent:   { fontWeight: 'bold' },
              unfinished: { borderBottom: '2px solid #ef4444' },
              ongoing:    { borderBottom: '2px solid #eab308' },
              completed:  { borderBottom: '2px solid #22c55e' },
            }}
          />
        </div>

        {/* Legend */}
        <div className="space-y-3">
          <p className="text-[9px] font-black uppercase text-primary tracking-widest px-1">Lịch của tôi</p>
          <div className="space-y-1">
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary">
              <div className="h-3 w-3 rounded-full bg-primary" />
              <span className="text-xs font-medium">Sự kiện chính</span>
            </div>
            <div
              onClick={() => setShowVNHolidays(!showVNHolidays)}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all',
                showVNHolidays ? 'bg-blue-500/10 text-blue-400' : 'hover:bg-muted/30 text-muted-foreground'
              )}
            >
              <div className={cn('h-3 w-3 rounded-full', showVNHolidays ? 'bg-blue-400' : 'bg-blue-500/40')} />
              <span className="text-xs font-medium">Ngày lễ VN</span>
            </div>
          </div>

          <div className="p-3 bg-muted/10 rounded-2xl border border-white/5 space-y-1.5">
            <p className="text-[9px] font-black uppercase text-primary/60 tracking-widest mb-2">Chú thích màu sắc</p>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
              <span className="text-[9px] font-bold uppercase opacity-60">Chưa hoàn thành</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
              <span className="text-[9px] font-bold uppercase opacity-60">Đang diễn ra</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
              <span className="text-[9px] font-bold uppercase opacity-60">Đã hoàn thành</span>
            </div>
          </div>
        </div>
      </div>

      {/* Schedule Detail Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h3 className="text-3xl font-black uppercase tracking-tighter">{viewLabel}</h3>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">
              {userRole === 'Admin' ? 'Toàn bộ lịch hệ thống' : 'Lịch trình công tác được phân công'}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-muted/20 border border-white/5 p-1 rounded-xl shadow-inner">
              <Button variant="ghost" size="icon" onClick={() => handleNavigate('prev')} className="h-8 w-8 rounded-lg hover:bg-background/50">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => { const n = new Date(); setSelectedDate(n); setCurrentMonth(n) }} className="h-8 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-background/50">
                Hôm nay
              </Button>
              <Button variant="ghost" size="icon" onClick={() => handleNavigate('next')} className="h-8 w-8 rounded-lg hover:bg-background/50">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center bg-muted/20 border border-white/5 p-1 rounded-xl shadow-inner">
              {(['day', 'week', 'month'] as const).map(v => (
                <Button
                  key={v}
                  variant={view === v ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setView(v)}
                  className={cn(
                    'h-8 px-4 text-[10px] font-black uppercase tracking-widest rounded-lg',
                    view === v ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-background/50'
                  )}
                >
                  {v === 'day' ? 'Ngày' : v === 'week' ? 'Tuần' : 'Tháng'}
                </Button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center flex-col gap-3 animate-pulse">
              <CalendarIcon className="h-8 w-8 opacity-20" />
              <span className="text-[10px] font-bold uppercase tracking-widest opacity-20">Đang đồng bộ...</span>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto w-full">
              {/* VN Holidays banner */}
              {currentHolidays.map((h, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl">
                  <div className="h-2 w-2 rounded-full bg-blue-400 shrink-0" />
                  <p className="text-xs font-black text-blue-400 uppercase tracking-wider">{h.label}</p>
                </div>
              ))}

              {filtered.length === 0 && currentHolidays.length === 0 ? (
                <div className="h-60 flex flex-col items-center justify-center opacity-20 text-center gap-4 border-2 border-dashed rounded-3xl">
                  <CalendarIcon className="h-12 w-12" />
                  <p className="text-xs font-bold uppercase tracking-widest">
                    Không có dữ liệu cho {view === 'day' ? 'ngày' : view === 'week' ? 'tuần' : 'tháng'} này
                  </p>
                </div>
              ) : (
                filtered.map(sch => {
                  const now = new Date()
                  const start = parseTime(sch.startTime)
                  const end = parseTime(sch.endTime)
                  const isFinished = isPast(end)
                  const isOngoing = now >= start && now <= end
                  const isUpcoming = now < start

                  const statusColor = isFinished ? 'bg-green-500' : isOngoing ? 'bg-yellow-500' : 'bg-red-500'

                  return (
                    <Card key={sch.id} className={cn(
                      'group relative overflow-hidden transition-all duration-300 border hover:shadow-lg bg-card/50',
                      isFinished ? 'opacity-60 grayscale-[0.5]' : 'shadow-sm'
                    )}>
                      <div className={cn('absolute left-0 top-0 bottom-0 w-1', statusColor)} />
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div className="w-32 p-5 flex flex-col justify-center items-center bg-muted/5 border-r shrink-0">
                            <span className="text-xl font-black tracking-tighter">{format(start, 'HH:mm')}</span>
                            <span className="text-[9px] font-black text-muted-foreground mt-1 uppercase opacity-60">
                              Kết thúc {format(end, 'HH:mm')}
                            </span>
                          </div>

                          <div className="flex-1 p-5 space-y-4">
                            <div className="flex justify-between items-start gap-4">
                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <h4 className="font-black uppercase text-sm tracking-tight">{sch.title}</h4>
                                  {isFinished && <Badge className="bg-green-500/10 text-green-500 text-[8px] font-black border-none uppercase py-0.5 px-2">Hoàn thành</Badge>}
                                  {isOngoing  && <Badge className="bg-yellow-500/10 text-yellow-500 text-[8px] font-black border-none uppercase py-0.5 px-2 animate-pulse">Đang diễn ra</Badge>}
                                  {isUpcoming && <Badge className="bg-red-500/10 text-red-500 text-[8px] font-black border-none uppercase py-0.5 px-2">Sắp diễn ra</Badge>}
                                </div>
                                <p className="text-xs font-medium text-muted-foreground line-clamp-1">{sch.description || 'Không có mô tả'}</p>
                              </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-y-3 gap-x-6">
                              {sch.location && (
                                <div className="flex items-center text-[10px] gap-2 text-muted-foreground font-black uppercase bg-muted/40 px-2 py-1 rounded">
                                  {sch.location.toLowerCase().includes('http') ? <Video className="h-3 w-3 text-primary" /> : <MapPin className="h-3 w-3" />}
                                  <span className="truncate max-w-[120px]">{sch.location}</span>
                                </div>
                              )}
                              <div className="flex items-center gap-2">
                                <div className="flex -space-x-1.5">
                                  {sch.participants.slice(0, 3).map(p => (
                                    <Avatar key={p.userId} className="h-5 w-5 border-2 border-[#1a1c1e]">
                                      <AvatarImage src={getAvatarUrl(p.avatarPath)} />
                                      <AvatarFallback className="text-[7px] font-black">{p.fullName[0]}</AvatarFallback>
                                    </Avatar>
                                  ))}
                                </div>
                                <span className="text-[9px] font-black opacity-40 uppercase">+{sch.participants.length} người tham gia</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
