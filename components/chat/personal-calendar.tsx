'use client'

import { useState, useEffect } from 'react'
import { schedulesApi, WorkScheduleResponse } from '@/lib/api'
import { getAvatarUrl, cn } from '@/lib/utils'
import { format, isSameDay, parseISO, isPast } from 'date-fns'
import { vi } from 'date-fns/locale'
import { Calendar } from '@/components/ui/calendar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { useSignalR } from '@/hooks/use-signalr'
import { parseISO, addDays, addWeeks, addMonths, subDays, subWeeks, subMonths, startOfWeek, endOfWeek, startOfMonth, endOfMonth, isSameWeek, isSameMonth } from 'date-fns'
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, Clock, MapPin, Video, User } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PersonalCalendarProps {
  token: string
}

export function PersonalCalendar({ token }: PersonalCalendarProps) {
  const [view, setView] = useState<'day' | 'week' | 'month'>('day')
  const { lastScheduleUpdate } = useSignalR()

  useEffect(() => {
    load()
  }, [token, lastScheduleUpdate])

  const load = async () => {
    setIsLoading(true)
    try {
      const data = await schedulesApi.getMySchedules(token)
      setSchedules(data.filter(s => !isNaN(new Date(s.startTime).getTime())))
    } catch (error) {
      console.error('Failed to load personal schedules:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const parseTime = (dateStr: string) => {
    if (!dateStr) return new Date();
    const cleaned = (dateStr.includes('Z') || dateStr.includes('+')) ? dateStr : dateStr + 'Z';
    return new Date(cleaned);
  }

  const handleNavigate = (direction: 'next' | 'prev') => {
    let newDate = new Date(selectedDate);
    if (view === 'day') {
      newDate = direction === 'next' ? addDays(newDate, 1) : subDays(newDate, 1);
    } else if (view === 'week') {
      newDate = direction === 'next' ? addWeeks(newDate, 1) : subWeeks(newDate, 1);
    } else {
      newDate = direction === 'next' ? addMonths(newDate, 1) : subMonths(newDate, 1);
    }
    setSelectedDate(newDate);
  }

  const filtered = schedules.filter(sch => {
    const schDate = parseTime(sch.startTime)
    if (view === 'day') return isSameDay(schDate, selectedDate)
    if (view === 'week') return isSameWeek(schDate, selectedDate, { weekStartsOn: 1, locale: vi })
    if (view === 'month') return isSameMonth(schDate, selectedDate)
    return isSameDay(schDate, selectedDate)
  }).sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

  return (
    <div className="flex h-full gap-6 p-6">
      {/* Mini Calendar Sidebar */}
      <div className="w-72 flex-shrink-0 space-y-6">
        <div className="bg-muted/10 rounded-3xl border border-white/5 p-3 shadow-inner">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(date) => date && setSelectedDate(date)}
            className="w-full"
            locale={vi}
            modifiers={{
                hasEvent: (date) => schedules.some(s => {
                   const start = parseISO(s.startTime);
                   const end = parseISO(s.endTime);
                   const d = new Date(date); d.setHours(0,0,0,0);
                   const sD = new Date(start); sD.setHours(0,0,0,0);
                   const eD = new Date(end); eD.setHours(0,0,0,0);
                   return d >= sD && d <= eD;
                }),
                unfinished: (date) => schedules.some(s => {
                   const start = parseISO(s.startTime);
                   const end = parseISO(s.endTime);
                   const d = new Date(date); d.setHours(0,0,0,0);
                   const sD = new Date(start); sD.setHours(0,0,0,0);
                   const eD = new Date(end); eD.setHours(0,0,0,0);
                   return d >= sD && d <= eD && !isPast(new Date(s.endTime));
                }),
                ongoing: (date) => schedules.some(s => {
                   const start = new Date(s.startTime);
                   const end = new Date(s.endTime);
                   const now = new Date();
                   const d = new Date(date); d.setHours(0,0,0,0);
                   const sD = new Date(start); sD.setHours(0,0,0,0);
                   const eD = new Date(end); eD.setHours(0,0,0,0);
                   return d >= sD && d <= eD && now >= start && now <= end;
                }),
                completed: (date) => {
                   const d = new Date(date); d.setHours(0,0,0,0);
                   const dayEvents = schedules.filter(s => {
                      const sD = new Date(parseISO(s.startTime)); sD.setHours(0,0,0,0);
                      const eD = new Date(parseISO(s.endTime)); eD.setHours(0,0,0,0);
                      return d >= sD && d <= eD;
                   });
                   return dayEvents.length > 0 && dayEvents.every(s => isPast(new Date(s.endTime)));
                }
              }}
              modifiersStyles={{
                hasEvent: { fontWeight: 'black', color: 'hsl(var(--primary))' },
                unfinished: { borderBottom: '2px solid #ef4444' }, 
                ongoing: { borderBottom: '2px solid #eab308' },    
                completed: { borderBottom: '2px solid #22c55e' }   
              }}
          />
        </div>

        <div className="p-3 bg-primary/5 rounded-2xl border border-primary/10">
           <p className="text-[9px] font-black uppercase text-primary tracking-widest mb-2">Chú thích màu sắc</p>
           <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-red-500" />
                 <span className="text-[9px] font-bold uppercase opacity-60 leading-none">Chưa hoàn thành</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-yellow-500" />
                 <span className="text-[9px] font-bold uppercase opacity-60 leading-none">Đang diễn ra</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
                 <span className="text-[9px] font-bold uppercase opacity-60 leading-none">Đã hoàn thành</span>
              </div>
           </div>
        </div>
      </div>

      {/* Schedule Detail Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h3 className="text-3xl font-black uppercase tracking-tighter">
              {view === 'day' 
                ? format(selectedDate, 'eeee, dd MMMM', { locale: vi })
                : view === 'week'
                  ? `Tuần ${format(startOfWeek(selectedDate, { weekStartsOn: 1 }), 'dd/MM')} - ${format(endOfWeek(selectedDate, { weekStartsOn: 1 }), 'dd/MM')}`
                  : `Tháng ${format(selectedDate, 'MM, yyyy', { locale: vi })}`
              }
            </h3>
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">Lịch trình công tác được phân công</p>
          </div>

          <div className="flex items-center gap-3">
             <div className="flex items-center bg-muted/20 border-white/5 border p-1 rounded-xl shadow-inner">
                <Button variant="ghost" size="icon" onClick={() => handleNavigate('prev')} className="h-8 w-8 rounded-lg hover:bg-background/50">
                   <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedDate(new Date())} className="h-8 px-4 text-[10px] font-black uppercase tracking-widest hover:bg-background/50">
                   Hôm nay
                </Button>
                <Button variant="ghost" size="icon" onClick={() => handleNavigate('next')} className="h-8 w-8 rounded-lg hover:bg-background/50">
                   <ChevronRight className="h-4 w-4" />
                </Button>
             </div>

             <div className="flex items-center bg-muted/20 border-white/5 border p-1 rounded-xl shadow-inner">
                {['day', 'week', 'month'].map((v) => (
                  <Button
                    key={v}
                    variant={view === v ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setView(v as any)}
                    className={cn(
                      "h-8 px-4 text-[10px] font-black uppercase tracking-widest rounded-lg",
                      view === v ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-background/50"
                    )}
                  >
                    {v === 'day' ? 'Ngày' : v === 'week' ? 'Tuần' : 'Tháng'}
                  </Button>
                ))}
             </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar relative">
           {isLoading ? (
             <div className="h-40 flex items-center justify-center animate-pulse flex-col gap-3">
                <CalendarIcon className="h-8 w-8 opacity-20" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-20">Đang đồng bộ...</span>
             </div>
           ) : filtered.length === 0 ? (
             <div className="h-60 flex flex-col items-center justify-center opacity-20 text-center gap-4 border-2 border-dashed rounded-3xl">
                <CalendarIcon className="h-12 w-12" />
                <p className="text-xs font-bold uppercase tracking-widest">Không có dữ liệu cho {view === 'day' ? 'ngày' : view === 'week' ? 'tuần' : 'tháng'} này</p>
             </div>
           ) : (
             <div className="space-y-4 max-w-4xl mx-auto w-full">
                {filtered.map(sch => {
                  const now = new Date();
                  const start = parseTime(sch.startTime);
                  const end = parseTime(sch.endTime);
                  const isFinished = isPast(end);
                  const isOngoing = now >= start && now <= end;
                  const isUpcoming = now < start;

                  let statusColor = "bg-primary";
                  if (isFinished) statusColor = "bg-green-500";
                  else if (isOngoing) statusColor = "bg-yellow-500";
                  else if (isUpcoming) statusColor = "bg-red-500";

                  return (
                    <Card key={sch.id} className={cn(
                      "group relative overflow-hidden transition-all duration-300 border hover:shadow-lg bg-card/50",
                      isFinished ? "opacity-60 grayscale-[0.5]" : "shadow-sm"
                    )}>
                      <div className={cn("absolute left-0 top-0 bottom-0 w-1", statusColor)} />
                      <CardContent className="p-0">
                        <div className="flex flex-col md:flex-row">
                          <div className="w-32 p-5 flex flex-col justify-center items-center bg-muted/5 border-r shrink-0">
                             <span className="text-xl font-black tracking-tighter">
                                {format(start, 'HH:mm')}
                             </span>
                             <span className="text-[9px] font-black text-muted-foreground mt-1 uppercase opacity-60">Kết thúc {format(end, 'HH:mm')}</span>
                          </div>

                          <div className="flex-1 p-5 space-y-4">
                             <div className="flex justify-between items-start gap-4">
                                <div>
                                   <div className="flex items-center gap-2 mb-1">
                                      <h4 className="font-black uppercase text-sm tracking-tight">{sch.title}</h4>
                                      {isFinished && <Badge className="bg-green-500/10 text-green-500 text-[8px] font-black border-none uppercase py-0.5 px-2">Hoàn thành</Badge>}
                                      {isOngoing && <Badge className="bg-yellow-500/10 text-yellow-500 text-[8px] font-black border-none uppercase py-0.5 px-2 animate-pulse">Đang diễn ra</Badge>}
                                      {isUpcoming && <Badge className="bg-red-500/10 text-red-500 text-[8px] font-black border-none uppercase py-0.5 px-2">Sắp diễn ra</Badge>}
                                   </div>
                                   <p className="text-xs font-medium text-muted-foreground line-clamp-1">{sch.description || "Không có mô tả"}</p>
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
                })}
             </div>
           )}
        </div>
      </div>
    </div>
  )
}
