'use client'

import { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from '@/lib/auth-context'

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
  isSystem?: boolean
}

export interface SignalRHookReturn {
  isConnected: boolean
  sendMessage: (conversationId:number, encryptedMessage:string, iv:string, parentMessageId?: number) => Promise<void>
  sendNotification: (message:string) => Promise<void>
  messages: ChatMessage[]
  notifications: ChatMessage[]
  onlineUsers: Set<number>
  incomingCall: { meetingId: number; callerName: string; callType: string; convName: string } | null
  clearIncomingCall: () => void
  callDeclined: { meetingId: number; declinerName: string } | null
  clearCallDeclined: () => void
  markAsRead: (conversationId: number) => Promise<void>
}

const SignalRContext = createContext<SignalRHookReturn | null>(null)

export function SignalRProvider({ children }: { children: React.ReactNode }) {

  const { token, user } = useAuth()

  const connectionRef = useRef<signalR.HubConnection | null>(null)

  const [isConnected,setIsConnected] = useState(false)
  const [messages,setMessages] = useState<ChatMessage[]>([])
  const [notifications,setNotifications] = useState<ChatMessage[]>([])
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set())
  const [incomingCall, setIncomingCall] = useState<{ meetingId: number; callerName: string; callType: string; convName: string } | null>(null)
  const [callDeclined, setCallDeclined] = useState<{ meetingId: number; declinerName: string } | null>(null)

  useEffect(() => {
    if (!token) return

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL,{
        accessTokenFactory:()=>token,
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build()

    connection.on('ReceiveMessage', (data: any) => {
      const { id, conversationId, senderId, senderName, content, iv, messageType, createdAt, attachments } = data;
      
      setMessages(prev => [
        ...prev,
        {
          id,
          conversationId,
          senderId,
          sender: senderName,
          message: content,
          iv,
          messageType,
          time: new Date(createdAt),
          attachments: attachments || [],
          isSystem: false
        }
      ])
    })

    connection.on('InitialOnlineUsers', (userIds: number[]) => {
      setOnlineUsers(new Set(userIds))
    })

    connection.on('ReceiveNotification', (data: any) => {
      const { id, sender, message, createdAt, isSystem } = data;
      setNotifications(prev => [
        ...prev,
        {
          id: id || Date.now(),
          conversationId: 0,
          senderId: 0,
          sender: sender || 'System',
          message: message,
          time: new Date(createdAt),
          isSystem: isSystem || true
        }
      ])
    })

    connection.on('UserStatusChanged', (userId: number, isOnline: boolean) => {
      setOnlineUsers(prev => {
        const next = new Set(prev)
        if (isOnline) {
          next.add(userId)
        } else {
          next.delete(userId)
        }
        return next
      })
    })

    connection.on('IncomingCall', (meetingId: number, callerId: number, callerName: string, callType: string, convName: string) => {
      console.log('SIGNALR: IncomingCall event received!', { meetingId, callerId, callerName, callType, convName })
      // Ignore if we are the caller
      if (user && callerId === user.id) {
        console.log('SIGNALR: Ignoring call invitation from ourselves.')
        return
      }
      setIncomingCall({ meetingId, callerName, callType, convName })
    })

    connection.on('CallDeclined', (meetingId: number, declinerName: string) => {
      console.log('SIGNALR: CallDeclined event received!', { meetingId, declinerName })
      setCallDeclined({ meetingId, declinerName })
    })

    connection.on('MeetingEnded', (data: any) => {
      console.log('SIGNALR: MeetingEnded event received!', data)
      const endedMeetingId = typeof data === 'object' ? data.meetingId : data
      setIncomingCall(prev => {
        if (prev?.meetingId === endedMeetingId) return null
        return prev
      })
    })

    connection.start()
      .then(()=>setIsConnected(true))
      .catch(err=>console.error(err))

    connectionRef.current = connection

    return ()=>{

      connection.stop()

    }

  },[token])

  const sendMessage = useCallback(async(conversationId:number,encryptedMessage:string,iv:string)=>{

    if(connectionRef.current?.state===signalR.HubConnectionState.Connected){

      await connectionRef.current.invoke(
        'SendMessage',
        conversationId,
        encryptedMessage,
        iv
      )

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

  return (
    <SignalRContext.Provider
      value={{
        isConnected,
        sendMessage,
        sendNotification,
        messages,
        notifications,
        onlineUsers,
        incomingCall,
        clearIncomingCall: () => setIncomingCall(null),
        callDeclined,
        clearCallDeclined: () => setCallDeclined(null),
        markAsRead,
      }}
    >

      {children}

    </SignalRContext.Provider>

  )

}

export function useSignalR(){

  const ctx = useContext(SignalRContext)

  if(!ctx){

    throw new Error('useSignalR must be used within SignalRProvider')

  }

  return ctx

}