'use client'

import { useState, useEffect } from 'react'
import { 
  X, 
  Plus, 
  Trash2, 
  Search, 
  StickyNote, 
  Clock, 
  LayoutGrid, 
  List,
  Pin,
  Palette,
  NotebookText
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface Note {
  id: string
  title: string
  content: string
  color?: string
  createdAt: string
  isPinned: boolean
}

interface ProjectNotesProps {
  onClose: () => void
}

export function ProjectNotes({ onClose }: ProjectNotesProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [isAdding, setIsAdding] = useState(false)
  const [newNote, setNewNote] = useState({ title: '', content: '' })
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  // Load notes from local storage or initialize
  useEffect(() => {
    const savedNotes = localStorage.getItem('lumi-project-notes')
    if (savedNotes) {
      setNotes(JSON.parse(savedNotes))
    } else {
      // Mock initial notes
      const initial = [
        { 
          id: '1', 
          title: 'Ý tưởng Sprint tiếp theo', 
          content: 'Phát triển module quản lý tài liệu tập trung. Tích hợp AI để tóm tắt nội dung.', 
          color: 'bg-primary/10', 
          createdAt: new Date().toISOString(),
          isPinned: true
        },
        { 
          id: '2', 
          title: 'Deadline Đồ án', 
          content: 'Báo cáo trung hạn: 15/04. Hoàn thiện Frontend: 20/04.', 
          color: 'bg-orange-500/10', 
          createdAt: new Date().toISOString(),
          isPinned: false
        }
      ]
      setNotes(initial)
      localStorage.setItem('lumi-project-notes', JSON.stringify(initial))
    }
  }, [])

  const saveNotes = (updatedNotes: Note[]) => {
    setNotes(updatedNotes)
    localStorage.setItem('lumi-project-notes', JSON.stringify(updatedNotes))
  }

  const addNote = () => {
    if (!newNote.title.trim() && !newNote.content.trim()) return
    const note: Note = {
      id: Date.now().toString(),
      title: newNote.title || 'Ghi chú không tiêu đề',
      content: newNote.content,
      createdAt: new Date().toISOString(),
      isPinned: false,
      color: 'bg-muted/50'
    }
    saveNotes([note, ...notes])
    setNewNote({ title: '', content: '' })
    setIsAdding(false)
  }

  const deleteNote = (id: string) => {
    saveNotes(notes.filter(n => n.id !== id))
  }

  const togglePin = (id: string) => {
    saveNotes(notes.map(n => n.id === id ? { ...n, isPinned: !n.isPinned } : n))
  }

  const filteredNotes = notes.filter(n => 
    n.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    n.content.toLowerCase().includes(searchQuery.toLowerCase())
  ).sort((a, b) => {
    if (a.isPinned === b.isPinned) return 0
    return a.isPinned ? -1 : 1
  })

  return (
    <div className="flex flex-col h-full bg-background border-l shadow-2xl animate-in slide-in-from-right duration-300">
      <header className="p-4 border-b flex items-center justify-between bg-background/50 backdrop-blur-md sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <NotebookText className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h3 className="font-black text-xs uppercase tracking-widest text-primary">Ghi chú dự án</h3>
            <p className="text-[10px] text-muted-foreground font-bold opacity-60">Lumi Keep</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full h-8 w-8">
           <X className="h-5 w-5" />
        </Button>
      </header>

      <div className="p-4 space-y-4">
        {/* Search Bar */}
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground opacity-40 group-focus-within:text-primary transition-colors" />
          <Input 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm ghi chú..."
            className="pl-10 h-10 rounded-xl bg-muted/20 border-transparent focus:bg-background transition-all font-medium text-xs"
          />
        </div>

        {/* Add Note Button or Form */}
        {!isAdding ? (
          <Button 
            onClick={() => setIsAdding(true)}
            className="w-full h-12 rounded-2xl border-2 border-dashed border-primary/20 hover:border-primary/50 hover:bg-primary/5 text-primary/60 font-black uppercase tracking-widest text-[10px] transition-all gap-2"
            variant="ghost"
          >
            <Plus className="h-4 w-4" /> Thêm ghi chú mới
          </Button>
        ) : (
          <div className="bg-muted/30 p-4 rounded-2xl border-2 border-primary/20 animate-in zoom-in-95 duration-200 shadow-lg">
             <input 
               autoFocus
               value={newNote.title}
               onChange={(e) => setNewNote({...newNote, title: e.target.value})}
               placeholder="Tiêu đề" 
               className="bg-transparent w-full border-none focus:ring-0 font-black text-sm uppercase tracking-tight mb-2 outline-none" 
             />
             <textarea 
               value={newNote.content}
               onChange={(e) => setNewNote({...newNote, content: e.target.value})}
               placeholder="Nội dung ghi chú..." 
               rows={3}
               className="bg-transparent w-full border-none focus:ring-0 text-xs resize-none outline-none font-medium opacity-80" 
             />
             <div className="flex justify-end gap-2 mt-2">
                <Button variant="ghost" size="sm" onClick={() => setIsAdding(false)} className="rounded-lg text-[10px] uppercase font-black tracking-widest">Hủy</Button>
                <Button size="sm" onClick={addNote} className="rounded-lg text-[10px] uppercase font-black tracking-widest px-4">Lưu</Button>
             </div>
          </div>
        )}

        <div className="flex items-center justify-between px-1">
           <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-30">Tất cả ghi chú ({notes.length})</p>
           <div className="flex items-center bg-muted/30 rounded-lg p-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-6 w-6 rounded-md", viewMode === 'grid' && "bg-background shadow-sm")} 
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="h-3 w-3" />
              </Button>
              <Button 
                variant="ghost" 
                size="icon" 
                className={cn("h-6 w-6 rounded-md", viewMode === 'list' && "bg-background shadow-sm")} 
                onClick={() => setViewMode('list')}
              >
                <List className="h-3 w-3" />
              </Button>
           </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className={cn(
          "p-4 gap-4 pb-20",
          viewMode === 'grid' ? "grid grid-cols-2" : "flex flex-col"
        )}>
          {filteredNotes.length > 0 ? (
            filteredNotes.map((note) => (
              <div 
                key={note.id} 
                className={cn(
                  "p-4 rounded-2xl border transition-all hover:shadow-xl hover:scale-[1.02] group relative flex flex-col",
                  note.color || 'bg-card',
                  note.isPinned ? "border-primary/30 shadow-lg shadow-primary/5" : "border-primary/5"
                )}
              >
                <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <Button variant="ghost" size="icon" className="h-6 w-6 rounded-full hover:bg-red-500/10 hover:text-red-500" onClick={() => deleteNote(note.id)}>
                      <Trash2 className="h-3 w-3" />
                   </Button>
                   <Button variant="ghost" size="icon" className={cn("h-6 w-6 rounded-full hover:text-primary", note.isPinned && "text-primary opacity-100")} onClick={() => togglePin(note.id)}>
                      <Pin className={cn("h-3 w-3", note.isPinned && "fill-primary")} />
                   </Button>
                </div>

                <h4 className="font-black text-[11px] uppercase tracking-tight mb-2 pr-10 line-clamp-2">{note.title}</h4>
                <p className="text-[11px] font-medium opacity-70 leading-relaxed mb-4 flex-1 line-clamp-4">{note.content}</p>
                
                <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-widest opacity-20">
                   <div className="flex items-center gap-1">
                      <Clock className="h-2.5 w-2.5" />
                      {new Date(note.createdAt).toLocaleDateString()}
                   </div>
                   <Palette className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 cursor-pointer hover:text-primary transition-all" />
                </div>
              </div>
            ))
          ) : (
            <div className="col-span-2 flex flex-col items-center justify-center py-20 opacity-20 italic">
               <StickyNote className="h-16 w-16 mb-4 stroke-[1px]" />
               <p className="font-black uppercase tracking-widest text-[10px]">Chưa có ghi chú nào</p>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}


