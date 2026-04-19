'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { VideoCallUI } from '@/features/call/video-call-ui'

export default function CallPage() {
  const { id } = useParams()
  const router = useRouter()
  const { isAuthenticated, isLoading, user } = useAuth()
  const searchParams = useSearchParams()
  const urlType = searchParams.get('type')
  const initialMic = searchParams.get('mic') !== 'false'
  const initialCam = searchParams.get('cam') !== 'false'
  const [callType, setCallType] = useState<'video' | 'voice'>(
    urlType === 'voice' ? 'voice' : 'video'
  )

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/')
    }
  }, [isAuthenticated, isLoading, router])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
          <p className="text-muted-foreground">Connecting to call...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return null
  }

  const handleEndCall = () => {
    router.push('/chat')
  }

  return (
    <VideoCallUI
      callId={id as string}
      callType={callType}
      participantName={user?.fullName || 'User'}
      onEndCall={handleEndCall}
      initialMic={initialMic}
      initialCam={initialCam}
    />
  )
}
