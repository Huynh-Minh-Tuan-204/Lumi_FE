'use client'

import { cn, formatMessageTime } from '@/lib/utils'
import { DecryptedText } from './decrypted-text'
import { Pin, PinOff, Reply, MoreVertical } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'

interface MessageItemProps {
  message: any
  isOwn: boolean
  user: any
  mySenderKey: any
  mySenderKeys: Map<number, any>
  peerSenderKeys: Map<number, any>
  peerIdentityKeys: Map<number, any>
  identityKeys: any
  initiateHandshake: (cid: number) => Promise<void>
  onJoinMeeting: (meetingId: string) => void
  togglePinMessage: (messageId: number) => void
  setReplyingTo: (message: any) => void
  attachmentsRenderer: (m: any) => React.ReactNode
  keyVersion?: number
}

export function MessageItem({
  message,
  isOwn,
  user,
  mySenderKey,
  mySenderKeys,
  peerSenderKeys,
  peerIdentityKeys,
  identityKeys,
  initiateHandshake,
  onJoinMeeting,
  togglePinMessage,
  setReplyingTo,
  attachmentsRenderer,
  keyVersion
}: MessageItemProps) {
  return (
    <div id={`message-${message.id}`} className={cn("flex gap-3 animate-in slide-in-from-bottom-2", isOwn ? "flex-row-reverse" : "flex-row")}>
      <div className={cn("max-w-[75%] space-y-1.5 flex flex-col", isOwn ? "items-end" : "items-start")}>
        {!isOwn && <p className="text-[10px] font-black uppercase opacity-40 ml-1">{message.senderName}</p>}
        {attachmentsRenderer(message)}
        {message.encryptedContent?.trim() !== "[Attachment]" && message.encryptedContent?.trim() !== "" && (
          <div className={cn("px-4 py-2.5 rounded-2xl shadow-sm text-sm break-words border relative group/msg transition-all duration-300", isOwn ? "bg-primary text-primary-foreground border-transparent" : "bg-card")}>
            <DecryptedText 
              message={message} 
              user={user} 
              mySenderKey={mySenderKey}
              mySenderKeys={mySenderKeys}
              peerSenderKeys={peerSenderKeys} 
              peerIdentityKeys={peerIdentityKeys} 
              identityKeys={identityKeys} 
              initiateHandshake={initiateHandshake} 
              onJoinMeeting={onJoinMeeting} 
              isOwn={isOwn} 
              keyVersion={keyVersion}
            />
            <div className={cn("absolute bottom-0 opacity-0 group-hover/msg:opacity-100 flex items-center gap-1 transition-opacity", isOwn ? "-left-20" : "-right-20")}>
              <button 
                onClick={() => togglePinMessage(message.id)} 
                className={cn("p-1.5 rounded-full bg-background border", message.isPinned ? "text-primary" : "text-muted-foreground")}
              >
                {message.isPinned ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="p-1.5 rounded-full bg-background border text-muted-foreground">
                    <MoreVertical className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align={isOwn ? "end" : "start"} className="w-48 p-1 rounded-xl">
                  <DropdownMenuItem onClick={() => setReplyingTo(message)} className="p-2 gap-2 text-xs font-black uppercase">
                    <Reply className="h-3.5 w-3.5" /> Trả lời
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => { navigator.clipboard.writeText(message.encryptedContent); toast.success('Đã sao chép'); }} className="p-2 gap-2 text-xs font-black uppercase">
                    <MoreVertical className="h-3.5 w-3.5" /> Sao chép
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}
        <span className="text-[9px] opacity-20 font-black px-1 uppercase tracking-widest">{formatMessageTime(message.createdAt)}</span>
      </div>
    </div>
  )
}

