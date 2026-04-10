'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Phone, PhoneOff, Video } from 'lucide-react'
import { useSignalR } from '@/hooks/use-signalr'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi } from '@/lib/api'
import { cn } from '@/lib/utils'

import { CallLobby } from '@/components/chat/call-lobby'

export function IncomingCallOverlay() {
  const router = useRouter()
  const { token } = useAuth()
  const { incomingCall, clearIncomingCall, callDeclined, clearCallDeclined } = useSignalR()
  const [isAnimating, setIsAnimating] = useState(false)
  const [showLobby, setShowLobby] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Play ringtone when incoming call arrives
  useEffect(() => {
    if (incomingCall) {
      setIsAnimating(true)
      // Auto dismiss after 30 seconds if not answered
      timeoutRef.current = setTimeout(() => {
        clearIncomingCall()
      }, 30000)
    } else {
      setIsAnimating(false)
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [incomingCall])

  // Show "call declined" toast briefly
  useEffect(() => {
    if (callDeclined) {
      const t = setTimeout(() => clearCallDeclined(), 4000)
      return () => clearTimeout(t)
    }
  }, [callDeclined])

  const handleAccept = () => {
    if (!incomingCall) return
    setShowLobby(true)
  }

  const handleDecline = async () => {
    if (!incomingCall || !token) return
    try {
      await meetingsApi.declineCall(token, incomingCall.meetingId)
    } catch (e) {
      console.error('Decline call error', e)
    }
    clearIncomingCall()
  }

  const isVideo = incomingCall?.callType === 'video'

  return (
    <>
      {/* Incoming call overlay */}
      {incomingCall && (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center sm:justify-end p-4 sm:p-6 pointer-events-none">
          <div className={cn(
            "bg-[#1E1E2E] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 p-5 w-full max-w-sm pointer-events-auto",
            "animate-in slide-in-from-bottom-4 sm:slide-in-from-right-4 duration-500"
          )}>
            {/* Pulse ring animation */}
            <div className="relative flex items-center gap-4 mb-5">
              <div className="relative">
                <span className="absolute -inset-2 rounded-full bg-indigo-500/20 animate-ping" />
                <Avatar className="h-14 w-14 ring-2 ring-indigo-500 relative">
                  <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-600 text-white text-xl font-bold">
                    {incomingCall.callerName.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </div>
              <div>
                <p className="text-xs text-indigo-400 font-medium mb-0.5">
                  {isVideo ? '📹 Cuộc gọi video đến' : '📞 Cuộc gọi thoại đến'}
                </p>
                <p className="text-white font-semibold text-lg leading-tight">{incomingCall.callerName}</p>
                <p className="text-gray-400 text-sm">{incomingCall.convName}</p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-3">
              <Button
                onClick={handleDecline}
                className="flex-1 h-12 rounded-xl bg-red-500/15 hover:bg-red-500/25 text-red-400 border border-red-500/20 gap-2"
                variant="ghost"
              >
                <PhoneOff className="h-5 w-5" />
                Từ chối
              </Button>
              <Button
                onClick={handleAccept}
                className="flex-1 h-12 rounded-xl bg-green-500 hover:bg-green-600 text-white shadow-lg shadow-green-500/30 gap-2"
              >
                {isVideo ? <Video className="h-5 w-5" /> : <Phone className="h-5 w-5" />}
                Chấp nhận
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Call declined toast */}
      {callDeclined && (
        <div className="fixed bottom-6 right-6 z-[9999] animate-in slide-in-from-bottom-2 duration-300">
          <div className="bg-[#1E1E2E] border border-red-500/20 rounded-xl px-4 py-3 shadow-2xl flex items-center gap-3">
            <PhoneOff className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-sm text-gray-200">
              <span className="font-medium">{callDeclined.declinerName}</span> đã từ chối cuộc gọi
            </p>
          </div>
        </div>
      )}
 
      {/* Call Lobby for Recipient */}
      {showLobby && incomingCall && (
        <CallLobby 
          meetingId={incomingCall.meetingId}
          type={incomingCall.callType as any}
          title={incomingCall.convName || `Cuộc gọi từ ${incomingCall.callerName}`}
          conversationId={0} // Not needed for redirection
          onJoin={() => {
            router.push(`/call/${incomingCall.meetingId}?type=${incomingCall.callType}`)
            setShowLobby(false)
            clearIncomingCall()
          }}
          onCancel={() => {
            setShowLobby(false)
            clearIncomingCall()
          }}
        />
      )}
    </>
  )
}
