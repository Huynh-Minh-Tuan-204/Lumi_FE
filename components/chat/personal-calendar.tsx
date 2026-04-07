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
import { Calendar as CalendarIcon, Clock, MapPin, Video, User } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface PersonalCalendarProps {
  token: string
}

export function PersonalCalendar({ token }: PersonalCalendarProps) {
  const [schedules, setSchedules] = useState<WorkScheduleResponse[]>([])
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      try {
        const data = await schedulesApi.getMySchedules(token)
        setSchedules(data.filter(s => !isNaN(new Date(s.startTime).getTime())))
      } catch (error) {
        console.error('Failed to load personal schedules:', error)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [token])

  const filtered = schedules.filter(s => isSameDay(parseISO(s.startTime), selectedDate))
                   .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())

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
                hasEvent: (date) => schedules.some(s => isSameDay(parseISO(s.startTime), date)),
                unfinished: (date) => schedules.some(s => isSameDay(parseISO(s.startTime), date) && !isPast(new Date(s.endTime))),
                ongoing: (date) => schedules.some(s => {
                   const start = new Date(s.startTime);
                   const end = new Date(s.endTime);
                   const now = new Date();
                   return isSameDay(start, date) && now >= start && now <= end;
                }),
                completed: (date) => schedules.every(s => isSameDay(parseISO(s.startTime), date) ? isPast(new Date(s.endTime)) : true) && schedules.some(s => isSameDay(parseISO(s.startTime), date))
              }}
              modifiersStyles={{
                hasEvent: { fontWeight: 'black', color: 'hsl(var(--primary))' },
                unfinished: { borderBottom: '2px solid #ef4444' }, 
                ongoing: { borderBottom: '2px solid #eab308' },    
                completed: { borderBottom: '2px solid #22c55e' }   
              }}
          />
        </div>

        <div className="p-4 bg-primary/5 rounded-2xl border border-primary/10">
           <p className="text-[10px] font-black uppercase text-primary tracking-widest mb-3">Chú thích màu sắc</p>
           <div className="space-y-2">
              <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-red-500" />
                 <span className="text-[10px] font-bold uppercase opacity-60">Sắp diễn ra / Chưa xong</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-yellow-500" />
                 <span className="text-[10px] font-bold uppercase opacity-60">Đang diễn ra</span>
              </div>
              <div className="flex items-center gap-2">
                 <div className="h-2 w-2 rounded-full bg-green-500" />
                 <span className="text-[10px] font-bold uppercase opacity-60">Đã hoàn thành</span>
              </div>
           </div>
        </div>
      </div>

      {/* Schedule Detail Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="mb-6">
           <h3 className="text-2xl font-black uppercase tracking-tighter">
             {format(selectedDate, 'eeee, dd MMMM', { locale: vi })}
           </h3>
           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary opacity-60">Lịch trình công tác được phân công</p>
        </header>

        <ScrollArea className="flex-1 pr-4">
           {isLoading ? (
             <div className="h-40 flex items-center justify-center animate-pulse flex-col gap-3">
                <CalendarIcon className="h-8 w-8 opacity-20" />
                <span className="text-[10px] font-bold uppercase tracking-widest opacity-20">Đang đồng bộ...</span>
             </div>
           ) : filtered.length === 0 ? (
             <div className="h-60 flex flex-col items-center justify-center opacity-20 text-center gap-4 border-2 border-dashed rounded-3xl">
                <CalendarIcon className="h-12 w-12" />
                <p className="text-xs font-bold uppercase tracking-widest">Không có dữ liệu cho ngày này</p>
             </div>
           ) : (
             <div className="space-y-4">
                {filtered.map(s => {
                  const now = new Date();
                  const start = new Date(s.startTime);
                  const end = new Date(s.endTime);
                  const isFinished = isPast(end);
                  const isOngoing = now >= start && now <= end;
                  const isUpcoming = now < start;

                  let statusColor = "bg-primary";
                  if (isFinished) statusColor = "bg-green-500";
                  else if (isOngoing) statusColor = "bg-yellow-500";
                  else if (isUpcoming) statusColor = "bg-red-500";

                  return (
                    <Card key={s.id} className={cn(
                      "bg-muted/5 border-white/5 overflow-hidden transition-all hover:bg-muted/10",
                      isFinished && "opacity-50"
                    )}>
                      <CardContent className="p-0">
                        <div className="flex">
                           <div className={cn("w-1.5 shrink-0", statusColor)} />
                           <div className="flex-1 p-5 space-y-4">
                              <div className="flex justify-between items-start gap-4">
                                 <div>
                                    <h4 className="font-black uppercase text-sm tracking-tight mb-1">{s.title}</h4>
                                    <p className="text-xs opacity-60 line-clamp-1">{s.description || "Không có mô tả"}</p>
                                 </div>
                                 <Badge className={cn(
                                   "border-none text-[8px] font-black tracking-widest uppercase py-1 px-3 rounded-full",
                                   isFinished ? "bg-green-500/20 text-green-500" : 
                                   isOngoing ? "bg-yellow-500/20 text-yellow-500 animate-pulse" : 
                                   "bg-red-500/20 text-red-500"
                                 )}>
                                   {isFinished ? "Hoàn thành" : isOngoing ? "Đang diễn ra" : "Sắp tới"}
                                 </Badge>
                              </div>

                              <div className="flex flex-wrap gap-x-6 gap-y-3">
                                 <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight opacity-70">
                                    <Clock className="h-3 w-3 text-primary" />
                                    {format(start, 'HH:mm')} - {format(end, 'HH:mm')}
                                 </div>
                                 {s.location && (
                                   <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-tight opacity-70">
                                      {s.location.includes('http') ? <Video className="h-3 w-3 text-primary" /> : <MapPin className="h-3 w-3" />}
                                      <span className="truncate max-w-[150px]">{s.location}</span>
                                   </div>
                                 )}
                                 <div className="flex items-center gap-2">
                                    <div className="flex -space-x-2">
                                       {s.participants.slice(0, 3).map(p => (
                                         <Avatar key={p.userId} className="h-5 w-5 border-2 border-[#1a1c1e]">
                                            <AvatarImage src={getAvatarUrl(p.avatarPath)} />
                                            <AvatarFallback className="text-[7px] font-black">{p.fullName[0]}</AvatarFallback>
                                         </Avatar>
                                       ))}
                                    </div>
                                    <span className="text-[9px] font-bold opacity-40 uppercase">+{s.participants.length} người tham gia</span>
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
        </ScrollArea>
      </div>
    </div>
  )
}
