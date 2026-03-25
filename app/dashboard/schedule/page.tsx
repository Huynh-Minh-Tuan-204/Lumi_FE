'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { schedulesApi, WorkScheduleResponse } from '@/lib/api'
import { adminApi } from '@/lib/api'
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
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Clock, MapPin, Users, Plus, Check, X, CalendarIcon, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { format } from 'date-fns'

export default function SchedulePage() {
  const { token, user } = useAuth()
  const [schedules, setSchedules] = useState<WorkScheduleResponse[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddOpen, setIsAddOpen] = useState(false)

  // New Schedule states
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState('')
  const [startTime, setStartTime] = useState('')
  const [endDate, setEndDate] = useState('')
  const [endTime, setEndTime] = useState('')
  const [location, setLocation] = useState('')
  
  // Participant picking
  const [allUsers, setAllUsers] = useState<any[]>([])
  const [selectedParticipants, setSelectedParticipants] = useState<number[]>([])

  useEffect(() => {
    if (token) {
      loadData()
    }
  }, [token])

  const loadData = async () => {
    setIsLoading(true)
    try {
      const sch = await schedulesApi.getMySchedules(token!)
      setSchedules(sch)
      
      const usersData = await adminApi.getAllUsers(token!)
      setAllUsers(usersData.filter((u: any) => u.id !== user?.id))
    } catch (e) {
      console.error(e)
    } finally {
      setIsLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!title || !startDate || !startTime || !endDate || !endTime) {
      toast.error('Please fill required fields (Title, Start/End time)')
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

      toast.success('Schedule created!')
      setIsAddOpen(false)
      loadData()
      // reset
      setTitle('')
      setDescription('')
      setLocation('')
      setSelectedParticipants([])
    } catch (e) {
      toast.error('Failed to create schedule')
    }
  }

  const handleResponse = async (id: number, status: 'Accepted' | 'Declined') => {
    try {
      await schedulesApi.updateStatus(token!, id, status)
      toast.success(`Schedule ${status.toLowerCase()}`)
      loadData()
    } catch {
      toast.error('Failed to update status')
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this schedule?')) return
    try {
      await schedulesApi.delete(token!, id)
      toast.success('Deleted successfully')
      loadData()
    } catch {
      toast.error('Failed to delete')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Work Schedule</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Manage your meetings and task schedules.
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              New Schedule
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>Create Schedule</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Meeting name..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Start Time</Label>
                  <Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Time</Label>
                  <Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Location / Meeting Link</Label>
                <Input value={location} onChange={e => setLocation(e.target.value)} placeholder="Room 1 or Zoom Link" />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Agenda..." />
              </div>
              <div className="space-y-2">
                <Label>Participants</Label>
                <ScrollArea className="h-32 border rounded-md p-2">
                  {allUsers.map(u => (
                    <label key={u.id} className="flex items-center gap-2 p-1 hover:bg-muted/50 rounded cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={selectedParticipants.includes(u.id)}
                        onChange={(e) => {
                          if (e.target.checked) setSelectedParticipants([...selectedParticipants, u.id])
                          else setSelectedParticipants(selectedParticipants.filter(id => id !== u.id))
                        }}
                      />
                      <span className="text-sm">{u.fullName}</span>
                    </label>
                  ))}
                </ScrollArea>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div></div>
      ) : schedules.length === 0 ? (
        <div className="text-center p-12 bg-card rounded-lg border">
          <CalendarIcon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium">No schedules found</h3>
          <p className="text-muted-foreground text-sm mt-1">You have no upcoming meetings or work schedules.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {schedules.map(sch => {
            const isCreator = sch.userRole === 'Creator';
            const meParticipant = sch.participants.find(p => p.userId === user?.id);
            const myStatus = meParticipant?.status;

            return (
              <div key={sch.id} className="bg-card rounded-xl border overflow-hidden shadow-sm flex flex-col relative group">
                {isCreator && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 text-destructive"
                    onClick={() => handleDelete(sch.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
                <div className="p-5 border-b flex-1">
                  <h3 className="font-semibold text-lg line-clamp-1">{sch.title}</h3>
                  {sch.description && <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{sch.description}</p>}
                  
                  <div className="mt-4 space-y-2">
                    <div className="flex items-center text-sm gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      <span>{format(new Date(sch.startTime), 'MMM dd, yyyy')}</span>
                    </div>
                    <div className="flex items-center text-sm gap-2 text-muted-foreground">
                      <Clock className="h-4 w-4" />
                      <span>{format(new Date(sch.startTime), 'HH:mm')} - {format(new Date(sch.endTime), 'HH:mm')}</span>
                    </div>
                    {sch.location && (
                      <div className="flex items-center text-sm gap-2 text-muted-foreground">
                        <MapPin className="h-4 w-4" />
                        <span className="truncate">{sch.location}</span>
                      </div>
                    )}
                  </div>

                  {sch.participants.length > 0 && (
                    <div className="mt-4 pt-4 border-t">
                      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mb-2">
                        <Users className="h-3 w-3" />
                        PARTICIPANTS ({sch.participants.length})
                      </div>
                      <div className="flex -space-x-2">
                        {sch.participants.slice(0, 5).map(p => (
                          <Avatar key={p.userId} className={`h-6 w-6 border-2 border-card ${p.status === 'Accepted' ? 'ring-2 ring-green-500' : p.status === 'Declined' ? 'ring-2 ring-destructive' : ''}`}>
                            <AvatarImage src={p.avatarPath} />
                            <AvatarFallback className="text-[9px]">{p.fullName.charAt(0)}</AvatarFallback>
                          </Avatar>
                        ))}
                        {sch.participants.length > 5 && (
                          <div className="h-6 w-6 rounded-full bg-muted border-2 border-card flex items-center justify-center text-[10px]">
                            +{sch.participants.length - 5}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {!isCreator && myStatus === 'Pending' && (
                  <div className="p-3 bg-muted/50 border-t flex gap-2">
                    <Button 
                      className="flex-1 bg-green-500 hover:bg-green-600 border-none gap-2 text-white" 
                      onClick={() => handleResponse(sch.id, 'Accepted')}
                      size="sm"
                    >
                      <Check className="h-4 w-4" /> Accept
                    </Button>
                    <Button 
                      variant="destructive" 
                      className="flex-1 gap-2" 
                      onClick={() => handleResponse(sch.id, 'Declined')}
                      size="sm"
                    >
                      <X className="h-4 w-4" /> Decline
                    </Button>
                  </div>
                )}
                {!isCreator && myStatus !== 'Pending' && (
                  <div className={`p-3 border-t text-center text-sm font-medium ${myStatus === 'Accepted' ? 'text-green-500 bg-green-500/10' : 'text-destructive bg-destructive/10'}`}>
                    You {myStatus?.toLowerCase()} this schedule
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
