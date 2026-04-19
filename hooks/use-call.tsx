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
  conversationId: number | null
  setConversationId: (val: number | null) => void
  localStream: MediaStream | null
  remotePeers: UserPeer[]
  isMuted: boolean
  setIsMuted: (val: boolean) => void
  isCameraOn: boolean
  setIsCameraOn: (val: boolean) => void
  isMinimized: boolean
  setIsMinimized: (val: boolean) => void
  isScreenSharing: boolean
  joinCall: (callId: string, type: 'video' | 'voice') => Promise<void>
  endCall: () => void
  toggleScreenShare: () => Promise<void>
  signalR: CallSignalR | null
}

const CallContext = createContext<CallContextType | undefined>(undefined)

export function CallProvider({ children }: { children: React.ReactNode }) {
  const { user, token } = useAuth()
  
  const [activeCallId, setActiveCallId] = useState<string | null>(null)
  const [conversationId, setConversationId] = useState<number | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remotePeers, setRemotePeers] = useState<UserPeer[]>([])
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(true)
  const [isMinimized, setIsMinimized] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [recordings, setRecordings] = useState<any[]>([])

  const signalRRef = useRef<CallSignalR | null>(null)
  const peersRef = useRef<Map<number, PeerState>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const recordedChunksRef = useRef<Blob[]>([])
  const iceServersRef = useRef<RTCIceServer[]>(RTC_CONFIG.iceServers || [])
  const lastEndedCallIdRef = useRef<string | null>(null)

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
    const pc = new RTCPeerConnection({
      ...RTC_CONFIG,
      iceServers: iceServersRef.current
    })
    const peerState: PeerState = {
      userId: targetUserId,
      userName: targetUserName,
      stream: null,
      connection: pc,
      isPolite,
      makingOffer: false,
      ignoreOffer: false
    }

    const currentStream = screenStreamRef.current || localStreamRef.current
    if (currentStream) {
      currentStream.getTracks().forEach(track => {
        pc.addTrack(track, currentStream!)
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
    if (activeCallId === callId) return // Already in this call
    if (lastEndedCallIdRef.current === callId) return // Just ended this call, prevent zombie re-join

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
        onMeetingMemberList: () => {}
      })

      signalRRef.current = signalR
      await signalR.connect(token)
      
      // Fetch ICE Servers from BE
      const servers = await signalR.getIceServers()
      if (servers && servers.length > 0) {
        iceServersRef.current = servers
      }

      await signalR.joinCall(callId)
      
    } catch (err) {
      console.error("Join call failed", err)
      throw err
    }
  }, [token, user, activeCallId, createPeerConnection, removePeer])

  const endCall = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach(t => t.stop())
      screenStreamRef.current?.getTracks().forEach(t => t.stop())
      peersRef.current.forEach(p => p.connection.close())
      peersRef.current.clear()
      signalRRef.current?.disconnect()
    } catch (e) { console.error("Error cleaning up call", e) }
    
    // Anti-zombie: Store the ended call ID and clear it after 2s
    if (activeCallId) {
        lastEndedCallIdRef.current = activeCallId;
        setTimeout(() => { lastEndedCallIdRef.current = null; }, 2000);
    }

    // Force clear all state synchronously
    setActiveCallId(null)
    setConversationId(null)
    setLocalStream(null)
    setRemotePeers([])
    setIsMinimized(false)
    setIsScreenSharing(false)
  }, [activeCallId])

  const toggleScreenShare = useCallback(async () => {
    if (!isScreenSharing) {
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({ video: true })
            screenStreamRef.current = stream
            const track = stream.getVideoTracks()[0]
            
            peersRef.current.forEach(peer => {
                const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video')
                if (sender) sender.replaceTrack(track)
            })
            
            track.onended = () => {
                setIsScreenSharing(false)
                if (localStreamRef.current) {
                    const localTrack = localStreamRef.current.getVideoTracks()[0]
                    peersRef.current.forEach(peer => {
                        const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video')
                        if (sender) sender.replaceTrack(localTrack)
                    })
                }
            }
            setIsScreenSharing(true)
        } catch (e) { console.error(e) }
    } else {
        screenStreamRef.current?.getTracks().forEach(t => t.stop())
        setIsScreenSharing(false)
        if (localStreamRef.current) {
            const localTrack = localStreamRef.current.getVideoTracks()[0]
            peersRef.current.forEach(peer => {
                const sender = peer.connection.getSenders().find(s => s.track?.kind === 'video')
                if (sender) sender.replaceTrack(localTrack)
            })
        }
    }
  }, [isScreenSharing])

  const startRecording = useCallback(() => {
    if (!localStream) return
    
    // In a real app, you might want to combine local and remote streams
    // For simplicity, we'll record the local stream for now, but a professional
    // version would use a canvas or specialized WebAudio to merge tracks.
    const streamToRecord = localStream
    
    const recorder = new MediaRecorder(streamToRecord, { mimeType: 'video/webm;codecs=vp9' })
    recordedChunksRef.current = []
    
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data)
    }
    
    recorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
      // Logic to upload blob to backend would go here using recordingsApi
      toast.success("Recording saved locally. Uploading...")
    }
    
    recorder.start()
    mediaRecorderRef.current = recorder
    setIsRecording(true)
  }, [localStream])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
    
    // Finalize upload
    if (activeCallId && token) {
        try {
            // Find meeting numeric ID if possible, for now use activeCallId (guid)
            // Backend might need to be updated to accept GUID for recordings or FE needs numeric ID
            // Assuming activeCallId is the GUID and we have a way to get the meeting object
        } catch (e) {
            console.error("Recording upload failed", e)
        }
    }
  }, [activeCallId, token])

  useEffect(() => {
    if (localStreamRef.current) {
        localStreamRef.current.getAudioTracks().forEach(t => t.enabled = !isMuted)
        localStreamRef.current.getVideoTracks().forEach(t => t.enabled = isCameraOn)
    }
  }, [isMuted, isCameraOn])

  return (
    <CallContext.Provider value={{
      activeCallId, conversationId, setConversationId, localStream, remotePeers,
      isMuted, setIsMuted, isCameraOn, setIsCameraOn,
      isMinimized, setIsMinimized, isScreenSharing,
      isRecording, startRecording, stopRecording,
      joinCall, endCall, toggleScreenShare,
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
