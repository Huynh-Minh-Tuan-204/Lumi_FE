'use client'

import { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { announcementsApi } from '@/lib/api'

const HUB_URL = process.env.NEXT_PUBLIC_SIGNALR_HUB_URL || 'https://mintuan-001-site1.ktempurl.com/chatHub';

export interface ChatMessage {
  id: number
  conversationId: number
  senderId: number
  sender: string
  message: string
  time: Date
  iv?: string
  messageType?: string
  attachments?: any[]
  avatarPath?: string
  stickerUrl?: string
  isPinned?: boolean
  isSystem?: boolean
  isRead?: boolean
  parentMessageId?: number
}

export interface SignalRHookReturn {
  isConnected: boolean
  isReconnecting: boolean
  sendMessage: (conversationId:number, encryptedMessage:string, iv:string, parentMessageId?: number) => Promise<void>
  sendNotification: (message:string) => Promise<void>
  lastMessage: ChatMessage | null
  lastReadUpdate: { conversationId: number, userId: number } | null
  onTriggeredReminder: (callback: (data: { conversationId: number, content: string }) => void) => void
  notifications: ChatMessage[]
  onlineUsers: Set<number>
  incomingCall: { meetingId: number; callerName: string; callType: string; convName: string } | null
  clearIncomingCall: () => void
  callDeclined: { meetingId: number; declinerName: string } | null
  clearCallDeclined: () => void
  markAsRead: (conversationId: number) => Promise<void>
  lastGroupUpdate: { conversationId: number, avatarPath?: string, backgroundPath?: string } | null
  sendTyping: (conversationId: number) => Promise<void>
  typingUsers: { conversationId: number, userId: number, userName: string }[]
  lastUserUpdate: { userId: number, avatarPath: string } | null
  sendSticker: (conversationId: number, stickerUrl: string) => Promise<void>
  togglePinMessage: (messageId: number) => Promise<void>
  sendReminder: (conversationId: number, content: string, remindAtIso: string) => Promise<void>
  pinnedMessages: { messageId: number, isPinned: boolean, pinnedBy?: number, conversationId: number } | null
  lastDeletedMessage: { conversationId: number, messageId: number } | null
  markAllNotificationsRead: () => Promise<void>
  lastScheduleUpdate: { type: 'created' | 'status' | 'deleted', data: any } | null
  lastUserLeft: number | null
}

const SignalRContext = createContext<SignalRHookReturn | null>(null)

export function SignalRProvider({ children }: { children: React.ReactNode }) {

  const { token, user, updateUser } = useAuth()

  const connectionRef = useRef<signalR.HubConnection | null>(null)

  const [isConnected,setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastMessage,setLastMessage] = useState<ChatMessage | null>(null)
  const [notifications,setNotifications] = useState<ChatMessage[]>([])
  const [lastReadUpdate, setLastReadUpdate] = useState<{ conversationId: number, userId: number } | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set())
  const [incomingCall, setIncomingCall] = useState<{ meetingId: number; callerName: string; callType: string; convName: string } | null>(null)
  const [callDeclined, setCallDeclined] = useState<{ meetingId: number; declinerName: string } | null>(null)
  const [lastGroupUpdate, setLastGroupUpdate] = useState<{ conversationId: number, avatarPath?: string, backgroundPath?: string } | null>(null)
  const [typingUsers, setTypingUsers] = useState<{ conversationId: number, userId: number, userName: string }[]>([])
  const [lastUserUpdate, setLastUserUpdate] = useState<{ userId: number, avatarPath: string } | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<{ messageId: number, isPinned: boolean, pinnedBy?: number, conversationId: number } | null>(null)
  const [lastDeletedMessage, setLastDeletedMessage] = useState<{ conversationId: number, messageId: number } | null>(null)
  const [lastScheduleUpdate, setLastScheduleUpdate] = useState<{ type: 'created' | 'status' | 'deleted', data: any } | null>(null)
  const [lastUserLeft, setLastUserLeft] = useState<number | null>(null)

  useEffect(() => {
    if (!token) {
        setNotifications([]);
        setOnlineUsers(new Set());
        setLastMessage(null);
        setLastReadUpdate(null);
        setIncomingCall(null);
        setCallDeclined(null);
        setLastGroupUpdate(null);
        setTypingUsers([]);
        setLastUserUpdate(null);
        setPinnedMessages(null);
        setLastDeletedMessage(null);
        setLastScheduleUpdate(null);
        setIsConnected(false);
        setIsReconnecting(false);
        return
    }

    const fetchHistory = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
        const response = await fetch(`${url}/Announcements`, {
          headers: { 
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const mapped = data.map((n: any) => ({
            id: n.Id || n.id || Math.random(),
            sender: n.SenderName || n.senderName || 'System',
            message: n.Message || n.message || '',
            time: new Date(n.Timestamp || n.timestamp || Date.now()),
            isSystem: true,
            isRead: n.IsRead || n.isRead || false
          }));
          setNotifications(mapped);
        }
      } catch (e) {
        console.error("Failed to fetch notification history", e);
      }
    }

    fetchHistory();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL,{
        accessTokenFactory:()=>token,
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build()

    connection.on('ReceiveMessage', (data: any) => {
      const { id, conversationId, senderId, senderName, content, iv, messageType, stickerUrl, isPinned, createdAt, attachments, avatarPath, parentMessageId } = data;
      setLastMessage({
          id,
          conversationId,
          senderId,
          sender: senderName,
          message: content,
          iv,
          messageType,
          stickerUrl,
          isPinned,
          time: new Date(createdAt),
          attachments: attachments || [],
          isSystem: false,
          avatarPath: avatarPath,
          parentMessageId: parentMessageId
        }
      )
    })

    connection.on('InitialOnlineUsers', (userIds: number[]) => {
      setOnlineUsers(new Set(userIds))
    })

    connection.on('ReceiveNotification', (data: any) => {
      const { id, title, sender, message, category, forceConfirmed, createdAt, isSystem } = data;
      
      // Hiển thị toast cho tất cả thông báo
      if (category === "Security" && forceConfirmed) {
        toast.error(`🚨 CẢNH BÁO: ${title || "Security Alert"}`, {
          description: message,
          duration: 30000, // Cảnh báo bảo mật hiển thị lâu hơn
        });
      } else {
        toast.info(`📢 THÔNG BÁO: ${message}`, {
          description: `Từ: ${sender || 'Admin'}`,
          duration: 10000,
        });
      }

      setNotifications(prev => [
        {
          id: id || Date.now(),
          conversationId: 0,
          senderId: 0,
          sender: sender || 'System',
          message: message,
          time: new Date(createdAt || Date.now()),
          isSystem: isSystem || true,
          isRead: false
        },
        ...prev
      ])
    })

    // --- XỬ LÝ 1: Nhận tin BẢO MẬT KHẨN CẤP (Popup) ---
    connection.on("receiveSecurityAlert", (data: any) => {
      console.log('SIGNALR: receiveSecurityAlert received!', data)
      toast.error(`🚨 BẢO MẬT: ${data.title}`, {
        description: data.message,
        duration: 0, // Click to close
      });
      // (Optional: trigger a global modal state if needed, but toast.error is a good start)
    })

    // --- XỬ LÝ 2: Nhận tin THƯỜNG (Chỉ hiện chấm đỏ/toast) ---
    connection.on("receiveGeneralAnnouncement", (data: any) => {
      console.log('SIGNALR: receiveGeneralAnnouncement received!', data)
      toast.info(`📢 ${data.title || "Thông báo"}`, {
        description: data.message,
      });
    })

    connection.on('UserStatusChanged', (userId: number, isOnline: boolean) => {
      setOnlineUsers(prev => {
        const next = new Set(prev)
        if (isOnline) next.add(userId)
        else next.delete(userId)
        return next
      })
    })

    connection.on('IncomingCall', (meetingId: number, callerId: number, callerName: string, callType: string, convName: string) => {
      if (user && callerId === user.id) return
      setIncomingCall({ meetingId, callerName, callType, convName })
    })

    connection.on('CallDeclined', (meetingId: number, declinerName: string) => {
      setCallDeclined({ meetingId, declinerName })
    })

    connection.on('MeetingEnded', (data: any) => {
      const endedMeetingId = typeof data === 'object' ? data.meetingId : data
      setIncomingCall(prev => (prev?.meetingId === endedMeetingId ? null : prev))
    })

    connection.on('ReceiveGroupUpdate', (conversationId: number, avatarPath: string, backgroundPath: string) => {
      const avatarWithCache = avatarPath ? `${avatarPath}?v=${Date.now()}` : avatarPath;
      const bgWithCache = backgroundPath ? `${backgroundPath}?v=${Date.now()}` : backgroundPath;
      setLastGroupUpdate({ conversationId, avatarPath: avatarWithCache, backgroundPath: bgWithCache })
    })

    connection.on('UserUpdated', (userId: number, avatarPath: string) => {
      const pathWithTime = `${avatarPath}?v=${Date.now()}`
      setLastUserUpdate({ userId, avatarPath: pathWithTime })
      if (user && userId === user.id) updateUser({ avatarPath: pathWithTime })
    })

    connection.on('UserTyping', (conversationId: number, userId: number, userName: string) => {
      setTypingUsers(prev => {
        const existing = prev.filter(t => t.userId !== userId || t.conversationId !== conversationId)
        return [...existing, { conversationId, userId, userName }]
      })
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(t => t.userId !== userId || t.conversationId !== conversationId))
      }, 3000)
    })

    connection.on('MessagePinned', (data: any) => {
      const { messageId, isPinned, pinnedBy, conversationId } = data
      setPinnedMessages({ messageId, isPinned, pinnedBy, conversationId })
    })

    connection.on('MessageDeleted', (conversationId: number, messageId: number) => {
      setLastDeletedMessage({ conversationId, messageId })
    })

    connection.on("UserReadConversation", (conversationId: number, userId: number) => {
      setLastReadUpdate({ conversationId, userId })
    })

    connection.on("ReminderTriggered", (data: { conversationId: number, content: string }) => {
      toast.info(`🔔 NHẮC NHỞ: ${data.content}`, {
        duration: 10000,
      })
    })

    connection.on('ScheduleCreated', (data: any) => {
      toast.info(`📅 Lịch mời mới: ${data.title}`, {
        description: `Bởi: ${data.createdBy} | Bắt đầu: ${new Date(data.startTime).toLocaleString('vi-VN', { hour12: false })}`,
        duration: 8000,
      });
      setLastScheduleUpdate({ type: 'created', data })
    })

    connection.on('ScheduleStatusUpdated', (data: any) => {
      setLastScheduleUpdate({ type: 'status', data })
    })

    connection.on('ScheduleDeleted', (scheduleId: number) => {
      setLastScheduleUpdate({ type: 'deleted', data: scheduleId })
    })

    connection.on('UserLeft', (userId: number) => {
      setLastUserLeft(userId)
      // Also remove from onlineUsers
      setOnlineUsers(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    })

    connection.onreconnecting(() => {
      setIsConnected(false)
      setIsReconnecting(true)
    })

    connection.onreconnected(() => {
      setIsConnected(true)
      setIsReconnecting(false)
    })

    connection.start()
      .then(()=>setIsConnected(true))
      .catch(err=>{
        console.error("SignalR Start Error:", err)
        setTimeout(() => {
          if (!isConnected) {
            connection.start().then(() => setIsConnected(true)).catch(() => {})
          }
        }, 5000)
      })

    connectionRef.current = connection

    return ()=>{
      connection.stop()
    }

  },[token])

  const sendMessage = useCallback(async(conversationId:number,encryptedMessage:string,iv:string)=>{
    if(connectionRef.current?.state===signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('SendMessage', conversationId, encryptedMessage, iv)
    }
  },[])

  const markAsRead = useCallback(async(conversationId: number) => {
    if(connectionRef.current?.state === signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('MarkAsRead', conversationId)
    }
  }, [])

  const sendNotification = useCallback(async(message:string)=>{
    if(connectionRef.current?.state===signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('SendNotification', message)
    }
  },[])

  const sendTyping = useCallback(async(conversationId: number) => {
    if(connectionRef.current?.state === signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('SendTyping', conversationId)
    }
  }, [])

  const sendSticker = useCallback(async(conversationId: number, stickerUrl: string) => {
    if(connectionRef.current?.state === signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('SendSticker', conversationId, stickerUrl)
    }
  }, [])

  const togglePinMessage = useCallback(async(messageId: number) => {
    if(connectionRef.current?.state === signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('TogglePinMessage', messageId)
    }
  }, [])

  const sendReminder = useCallback(async(conversationId: number, content: string, remindAtIso: string) => {
    if(connectionRef.current?.state === signalR.HubConnectionState.Connected){
      await connectionRef.current.invoke('SendReminder', conversationId, content, remindAtIso)
    }
  }, [])

  return (
    <SignalRContext.Provider
      value={{
        isConnected,
        isReconnecting,
        sendMessage,
        sendNotification,
        lastMessage,
        lastReadUpdate,
        notifications,
        onlineUsers,
        incomingCall,
        clearIncomingCall: () => setIncomingCall(null),
        callDeclined,
        clearCallDeclined: () => setCallDeclined(null),
        markAsRead,
        lastGroupUpdate,
        sendTyping,
        typingUsers,
        lastUserUpdate,
        sendSticker,
        togglePinMessage,
        sendReminder,
        markAllNotificationsRead: async () => {
          if (!token) return;
          try {
            await announcementsApi.markAllRead(token);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
          } catch (e) {}
        },
        pinnedMessages,
        lastDeletedMessage,
        lastScheduleUpdate,
        lastUserLeft,
        onTriggeredReminder: (cb: any) => {}, 
      }}
    >
      {children}
    </SignalRContext.Provider>
  )
}

export function useSignalR(){
  const ctx = useContext(SignalRContext)
  if(!ctx) throw new Error('useSignalR must be used within SignalRProvider')
  return ctx
}