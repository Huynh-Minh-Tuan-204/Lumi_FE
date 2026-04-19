'use client'

import { useState, useEffect } from 'react'
import { adminApi, schedulesApi } from '@/lib/api'
import { getAvatarUrl, cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Calendar as CalendarIcon, Download, Plus, Users, X, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

interface CreateEventModalProps {
  token: string
  isOpen: boolean
  onClose: () => void
  initialParticipants?: number[] // Pre-select users from chat
  conversationName?: string
}

export function CreateEventModal({ token, isOpen, onClose, initialParticipants = [], conversationName }: CreateEventModalProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [startTime, setStartTime] = useState('09:00')
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [endTime, setEndTime] = useState('10:00')
  const [location, setLocation] = useState('')
  
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (isOpen) {
      loadUsers()
      if (initialParticipants.length > 0) {
        setSelectedParticipants(initialParticipants)
      }
      if (conversationName) {
        setTitle(`Họp nhóm: ${conversationName}`)
      }
    }
  }, [isOpen, initialParticipants, conversationName])

  const loadUsers = async () => {
    try {
      const users = await adminApi.getAllUsers(token)
      setAllUsers(users.filter(u => u.isActive))
    } catch (e) {
      console.error(e)
    }
  }

  const handleCreate = async () => {
    if (!title || !startDate || !startTime || !endDate || !endTime) {
      toast.error('Vui lòng điền đủ Tiêu đề và Thời gian')
      return
    }

    const startIso = new Date(`${startDate}T${startTime}`)
    const endIso = new Date(`${endDate}T${endTime}`)

    if (endIso <= startIso) {
      toast.error('Thời gian kết thúc phải lớn hơn thời gian bắt đầu')
      return
    }

    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      await schedulesApi.create(token, {
        title,
        description,
        startTime: startIso.toISOString(),
        endTime: endIso.toISOString(),
        location,
        participantIds: selectedParticipants
      })

      toast.success('Đã tạo sự kiện và thông báo cho các thành viên!')
      onClose()
      // reset
      setTitle('')
      setDescription('')
      setLocation('')
      setSelectedParticipants([])
    } catch (e) {
      toast.error('Lỗi khi tạo sự kiện')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleStartTimeChange = (newTime: string) => {
    setStartTime(newTime);
    // Auto set end time to start + 30 mins
    const [h, m] = newTime.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m + 30);
    setEndTime(`${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`);
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-[550px] rounded-3xl p-0 overflow-hidden bg-background border-white/5">
        <DialogDescription className="sr-only">
          Tạo lịch hẹn và mời thành viên trong hội thoại tham gia thảo luận.
        </DialogDescription>
        <div className="bg-primary p-6 text-primary-foreground">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 uppercase tracking-tight">
            <CalendarIcon className="h-6 w-6" />
            Tạo sự kiện thảo luận
          </DialogTitle>
          <p className="text-[10px] uppercase font-black tracking-widest opacity-60 mt-1">Lên lịch trình chuyên nghiệp cho Lumi Chat</p>
        </div>
        
        <div className="p-8 space-y-6">
          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-40">Tên sự kiện <span className="text-destructive">*</span></Label>
            <Input 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="Tiêu đề cuộc họp..." 
              className="h-11 rounded-xl bg-muted/20 border-white/5"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-40">Bắt đầu <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input type="date" lang="vi-VN" value={startDate} onChange={e => setStartDate(e.target.value)} className="h-11 rounded-xl bg-muted/20 border-white/5" />
                <div className="flex items-center bg-muted/20 border-white/5 border rounded-xl h-11 px-3 gap-1 w-32 group focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <select 
                    value={startTime.split(':')[0]} 
                    onChange={e => handleStartTimeChange(`${e.target.value}:${startTime.split(':')[1]}`)}
                    className="bg-transparent outline-none cursor-pointer appearance-none text-sm w-6 text-foreground"
                  >
                    {Array.from({length: 24}).map((_, i) => (
                      <option key={i} value={i.toString().padStart(2, '0')} className="bg-[#121212] text-white">{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground/50 font-bold">:</span>
                  <select 
                    value={startTime.split(':')[1]} 
                    onChange={e => handleStartTimeChange(`${startTime.split(':')[0]}:${e.target.value}`)}
                    className="bg-transparent outline-none cursor-pointer appearance-none text-sm w-6 text-foreground"
                  >
                    {Array.from({length: 60}).map((_, i) => (
                      <option key={i} value={i.toString().padStart(2, '0')} className="bg-[#121212] text-white">{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <Clock className="h-3 w-3 ml-auto text-muted-foreground/30" />
                </div>
              </div>
            </div>
            <div className="space-y-2">
              <Label className="text-[10px] font-black uppercase tracking-widest opacity-40">Kết thúc <span className="text-destructive">*</span></Label>
              <div className="flex gap-2">
                <Input type="date" lang="vi-VN" value={endDate} onChange={e => setEndDate(e.target.value)} className="h-11 rounded-xl bg-muted/20 border-white/5" />
                <div className="flex items-center bg-muted/20 border-white/5 border rounded-xl h-11 px-3 gap-1 w-32 group focus-within:ring-2 focus-within:ring-primary/20 transition-all">
                  <select 
                    value={endTime.split(':')[0]} 
                    onChange={e => setEndTime(`${e.target.value}:${endTime.split(':')[1]}`)}
                    className="bg-transparent outline-none cursor-pointer appearance-none text-sm w-6 text-foreground"
                  >
                    {Array.from({length: 24}).map((_, i) => (
                      <option key={i} value={i.toString().padStart(2, '0')} className="bg-[#121212] text-white">{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <span className="text-muted-foreground/50 font-bold">:</span>
                  <select 
                    value={endTime.split(':')[1]} 
                    onChange={e => setEndTime(`${endTime.split(':')[0]}:${e.target.value}`)}
                    className="bg-transparent outline-none cursor-pointer appearance-none text-sm w-6 text-foreground"
                  >
                    {Array.from({length: 60}).map((_, i) => (
                      <option key={i} value={i.toString().padStart(2, '0')} className="bg-[#121212] text-white">{i.toString().padStart(2, '0')}</option>
                    ))}
                  </select>
                  <Clock className="h-3 w-3 ml-auto text-muted-foreground/30" />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-[10px] font-black uppercase tracking-widest opacity-40">Mô tả & Địa điểm</Label>
            <div className="flex flex-col gap-3">
               <Input 
                 value={location} 
                 onChange={e => setLocation(e.target.value)} 
                 placeholder="Địa điểm hoặc link phòng họp trực tuyến..." 
                 className="h-11 rounded-xl bg-muted/20 border-white/5"
               />
               <Input 
                 value={description} 
                 onChange={e => setDescription(e.target.value)} 
                 placeholder="Nội dung tóm tắt..." 
                 className="h-11 rounded-xl bg-muted/20 border-white/5"
               />
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
               <Label className="text-[10px] font-black uppercase tracking-widest opacity-40">Mời thành viên tham dự</Label>
               <span className="text-[10px] font-bold text-primary italic">Đã chọn: {selectedParticipants.length}</span>
            </div>
            <ScrollArea className="h-40 border border-white/5 rounded-2xl p-4 bg-muted/10">
              <div className="grid grid-cols-2 gap-2">
                {allUsers.map(u => (
                  <label key={u.id} className={cn(
                    "flex items-center gap-3 p-2 rounded-xl transition-all cursor-pointer",
                    selectedParticipants.includes(u.id) ? "bg-primary/10 border border-primary/20" : "hover:bg-white/5 border border-transparent"
                  )}>
                    <input 
                      type="checkbox" 
                      className="w-4 h-4 rounded border-white/10 text-primary bg-transparent focus:ring-0"
                      checked={selectedParticipants.includes(u.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedParticipants([...selectedParticipants, u.id])
                        else setSelectedParticipants(selectedParticipants.filter(id => id !== u.id))
                      }}
                    />
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={getAvatarUrl(u.avatarPath)} />
                        <AvatarFallback className="text-[10px] font-black">{u.fullName.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <span className="text-[11px] font-bold truncate max-w-[100px]">{u.fullName}</span>
                    </div>
                  </label>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
        <div className="p-6 bg-white/5 border-t border-white/5 flex justify-end gap-3">
          <Button variant="ghost" onClick={onClose} className="rounded-xl px-6 font-bold uppercase text-[10px] tracking-widest">Hủy bỏ</Button>
          <Button onClick={handleCreate} disabled={isSubmitting} className="rounded-xl px-10 shadow-lg shadow-primary/20 font-black uppercase text-[10px] tracking-widest">
            {isSubmitting ? 'Đang tạo...' : 'Lưu sự kiện'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

