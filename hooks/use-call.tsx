'use client'

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { CallSignalR } from '@/lib/call-signalr'

interface UserPeer {
  userId: number
  userName: string
  stream: MediaStream | null
}

interface PeerState {
  userId: number
  userName: string
  stream: MediaStream | null
  connection: RTCPeerConnection
  isPolite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
}

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
}

interface CallContextType {
  activeCallId: string | null
  localStream: MediaStream | null
  remotePeers: UserPeer[]
  isMuted: boolean
  setIsMuted: (val: boolean) => void
  isCameraOn: boolean
  setIsCameraOn: (val: boolean) => void
  isMinimized: boolean
  setIsMinimized: (val: boolean) => void
  joinCall: (callId: string, type: 'video' | 'voice') => Promise<void>
  endCall: () => void
  signalR: CallSignalR | null
}

const CallContext = createContext<CallContextType | undefined>(undefined)

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth()
  
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<UserPeer[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)

  const signalRRef = useRef<CallSignalR | null>(null)
  const peersRef = useRef<Map<number, PeerState>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  const updatePeerUI = useCallback(() => {
    const list: UserPeer[] = Array.from(peersRef.current.values()).map(p => ({
      userId: p.userId,
      userName: p.userName,
      stream: p.stream
    }))
    setRemotePeers(list)
  }, [])

  const removePeer = useCallback((userId: number) => {
    const peer = peersRef.current.get(userId)
    if (peer) {
      peer.connection.close()
      peersRef.current.delete(userId)
      updatePeerUI()
    }
  }, [updatePeerUI])

  const createPeerConnection = useCallback((callId: string, targetUserId: number, targetUserName: string, isPolite: boolean) => {
    const pc = new RTCPeerConnection(RTC_CONFIG)
    const peerState: PeerState = {
      userId: targetUserId,
      userName: targetUserName,
      stream: null,
      connection: pc,
      isPolite,
      makingOffer: false,
      ignoreOffer: false
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    pc.onicecandidate = ({ candidate }) => {
      if (candidate && signalRRef.current?.isConnected) {
        signalRRef.current.sendIceCandidate(callId, targetUserId, candidate.toJSON())
      }
    }

    pc.ontrack = ({ streams }) => {
      if (streams[0]) {
        peerState.stream = streams[0]
        updatePeerUI()
      }
    }

    pc.onnegotiationneeded = async () => {
      try {
        peerState.makingOffer = true
        await pc.setLocalDescription()
        if (signalRRef.current?.isConnected) {
          await signalRRef.current.sendOffer(callId, targetUserId, pc.localDescription!)
        }
      } catch (err) {
        console.error(`WebRTC error with ${targetUserName}`, err)
      } finally {
        peerState.makingOffer = false
      }
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        removePeer(targetUserId)
      }
    }

    peersRef.current.set(targetUserId, peerState)
    updatePeerUI()
    return peerState
  }, [removePeer, updatePeerUI])

  const joinCall = useCallback(async (callId: string, type: 'video' | 'voice') => {
    if (!token || !user) return
    
    // Clean up previous if any
    if (activeCallId && activeCallId !== callId) {
        // ... cleanup
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: type === 'video'
      })
      
      localStreamRef.current = stream
      setLocalStream(stream)
      setActiveCallId(callId)
      setIsCameraOn(type === 'video')

      const signalR = new CallSignalR({
        onUserJoined: async (_connId, remoteUserId, displayName) => {
          if (remoteUserId === user.id) return
          const isPolite = user.id > remoteUserId
          if (!peersRef.current.has(remoteUserId)) {
            createPeerConnection(callId, remoteUserId, displayName, isPolite)
          }
        },
        onUserLeft: (_connId, remoteUserId, displayName) => {
          toast.info(`${displayName} đã rời cuộc họp`)
          removePeer(remoteUserId)
        },
        onReceiveOffer: async (offer, fromUserId) => {
          let peer = peersRef.current.get(fromUserId)
          if (!peer) {
            peer = createPeerConnection(callId, fromUserId, "User", user.id > fromUserId)
          }
          const pc = peer.connection
          const offerCollision = offer.type === "offer" && (peer.makingOffer || pc.signalingState !== "stable")
          peer.ignoreOffer = !peer.isPolite && offerCollision
          if (peer.ignoreOffer) return
          
          if (offerCollision) {
            await Promise.all([pc.setLocalDescription({ type: "rollback" }), pc.setRemoteDescription(offer)])
          } else {
            await pc.setRemoteDescription(offer)
          }
          
          if (offer.type === "offer") {
            await pc.setLocalDescription()
            await signalR.sendAnswer(callId, fromUserId, pc.localDescription!)
          }
        },
        onReceiveAnswer: async (answer, fromUserId) => {
          const peer = peersRef.current.get(fromUserId)
          if (peer) await peer.connection.setRemoteDescription(answer)
        },
        onReceiveIceCandidate: async (candidate, fromUserId) => {
          const peer = peersRef.current.get(fromUserId)
          if (peer && !peer.ignoreOffer) {
            await peer.connection.addIceCandidate(candidate).catch(() => {})
          }
        },
        onMeetingMemberList: () => {
            // Can be handled by UI via event
        }
      })

      signalRRef.current = signalR
      await signalR.connect(token)
      await signalR.joinCall(callId)
      
    } catch (err) {
      console.error("Join call failed", err)
      throw err
    }
  }, [token, user, createPeerConnection, removePeer])

  const endCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach(t => t.stop())
    peersRef.current.forEach(p => p.connection.close())
    peersRef.current.clear()
    signalRRef.current?.disconnect()
    
    setActiveCallId(null)
    setLocalStream(null)
    setRemotePeers([])
    setIsMinimized(false)
  }, [])

  // Sync states
  useEffect(() => {
    if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted)
        localStreamRef.current.getVideoTracks().forEach(t => t.enabled = isCameraOn)
    }
  }, [isMuted, isCameraOn])

  return (
    <CallContext.Provider value={{
      activeCallId, localStream, remotePeers,
      isMuted, setIsMuted, isCameraOn, setIsCameraOn,
      isMinimized, setIsMinimized,
      joinCall, endCall,
      signalR: signalRRef.current
    }}>
      {children}
    </CallContext.Provider>
  )
}

export function useCall() {
  const context = useContext(CallContext)
  if (context === undefined) {
    throw new Error('useCall must be used within a CallProvider')
  }
  return context
}
