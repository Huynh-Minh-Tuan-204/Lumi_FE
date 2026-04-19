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
  isRecording: boolean
  startRecording: () => void
  stopRecording: () => Promise<void>
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
      // Thử lấy stream với cấu hình đầy đủ (audio + video nếu video call)
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: type === 'video'
        })
      } catch (deviceErr: any) {
        const isNotFound = deviceErr?.name === 'NotFoundError' || deviceErr?.name === 'DevicesNotFoundError'
        const isNotAllowed = deviceErr?.name === 'NotAllowedError' || deviceErr?.name === 'PermissionDeniedError'

        if (isNotAllowed) {
          // User từ chối quyền → không có cách fix tự động
          toast.error('Trình duyệt bị từ chối quyền camera/microphone. Vui lòng cấp quyền trong cài đặt trình duyệt.')
          throw deviceErr
        }

        if (isNotFound && type === 'video') {
          // Không có camera → thử lại với audio only
          console.warn('[Call] Không tìm thấy camera, thử tham gia bằng audio only...')
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              audio: true,
              video: false
            })
            // Thông báo cho user biết đang ở chế độ audio only
            toast.warning('Không tìm thấy camera. Tham gia bằng audio only.')
            // Force camera state = off vì không có video track
            setIsCameraOn(false)
          } catch (audioErr: any) {
            // Không có cả microphone
            toast.error('Không thể truy cập microphone. Kiểm tra quyền trình duyệt và kết nối thiết bị.')
            throw audioErr
          }
        } else {
          // Lỗi khác (NotReadableError - thiết bị đang bị dùng bởi app khác)
          const isInUse = deviceErr?.name === 'NotReadableError'
          if (isInUse) {
            toast.error('Camera/Microphone đang được sử dụng bởi ứng dụng khác. Vui lòng đóng ứng dụng đó và thử lại.')
          } else {
            toast.error(`Lỗi thiết bị media: ${deviceErr?.message || 'Unknown error'}`)
          }
          throw deviceErr
        }
      }
      
      localStreamRef.current = stream
      setLocalStream(stream)
      setActiveCallId(callId)
      const hasVideo = stream.getVideoTracks().length > 0
      setIsCameraOn(hasVideo)

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
      
      // CRITICAL: Fetch ICE Servers TRƯỚC KHI joinCall để đảm bảo
      // tất cả peer connections được tạo với TURN server đầy đủ.
      // Nếu fetch fail → giữ nguyên STUN default, vẫn join được (chỉ không qua TURN).
      try {
        const servers = await signalR.getIceServers()
        if (servers && servers.length > 0) {
          iceServersRef.current = servers
          console.log('[WebRTC] ICE Servers loaded:', servers.map((s: any) => s.urls))
        }
      } catch (iceErr) {
        console.warn('[WebRTC] Could not fetch ICE servers from BE, using defaults:', iceErr)
      }

      // Join AFTER ICE servers are ready
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
    if (!localStreamRef.current) {
      console.warn('[Recording] No local stream available')
      return
    }
    
    try {
      // Mix audio của tất cả participants (local + remote peers)
      const audioContext = new AudioContext()
      const mixedDestination = audioContext.createMediaStreamDestination()

      // Add local audio
      const localAudioTracks = localStreamRef.current.getAudioTracks()
      if (localAudioTracks.length > 0) {
        const localSource = audioContext.createMediaStreamSource(localStreamRef.current)
        localSource.connect(mixedDestination)
      }

      // Add remote peer audio
      peersRef.current.forEach((peer) => {
        if (peer.stream) {
          try {
            const remoteSource = audioContext.createMediaStreamSource(peer.stream)
            remoteSource.connect(mixedDestination)
          } catch (e) {
            console.warn('[Recording] Could not add peer audio:', e)
          }
        }
      })

      // Composite stream: local video + mixed audio từ tất cả
      const videoTracks = localStreamRef.current.getVideoTracks()
      const compositeStream = new MediaStream([
        ...videoTracks,
        ...mixedDestination.stream.getAudioTracks()
      ])

      // Fallback nếu vp9 không được support
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : MediaRecorder.isTypeSupported('video/webm')
        ? 'video/webm'
        : ''

      const recorder = new MediaRecorder(compositeStream, mimeType ? { mimeType } : undefined)
      recordedChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' })
        console.log('[Recording] Recording stopped, blob size:', blob.size)
        toast.success('Đang tải bản ghi lên...')

        // Upload lên BE nếu có meetingId
        if (activeCallId && token) {
          try {
            // Resolve meeting numeric ID từ activeCallId (GUID)
            const meetingRes = await fetch(
              `${process.env.NEXT_PUBLIC_API_URL || ''}/api/Meetings/${activeCallId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            )
            if (meetingRes.ok) {
              const meetingData = await meetingRes.json()
              const numericId = meetingData.id || meetingData.Id

              if (numericId) {
                const formData = new FormData()
                formData.append('file', blob, `recording_${Date.now()}.webm`)
                formData.append('meetingId', String(numericId))
                formData.append('iv', '') // Không encrypt phía client cho recording

                const uploadRes = await fetch(
                  `${process.env.NEXT_PUBLIC_API_URL || ''}/api/Recordings/upload`,
                  {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${token}` },
                    body: formData
                  }
                )

                if (uploadRes.ok) {
                  toast.success('Bản ghi đã được lưu thành công!')
                } else {
                  throw new Error(`Upload failed: ${uploadRes.status}`)
                }
              }
            }
          } catch (uploadErr) {
            console.error('[Recording] Upload failed:', uploadErr)
            // Fallback: download về máy user
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `lumi_recording_${new Date().toISOString().slice(0,19)}.webm`
            a.click()
            URL.revokeObjectURL(url)
            toast.info('Không thể upload, đã tải về máy của bạn.')
          }
        } else {
          // Không có meetingId → download về máy
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `lumi_recording_${new Date().toISOString().slice(0,19)}.webm`
          a.click()
          URL.revokeObjectURL(url)
        }

        audioContext.close()
      }

      recorder.start(1000) // timeslice 1s để nhận data đều
      mediaRecorderRef.current = recorder
      setIsRecording(true)
      toast.info('Đang ghi âm cuộc gọi...')

    } catch (err) {
      console.error('[Recording] Failed to start recording:', err)
      toast.error('Không thể bắt đầu ghi âm. Trình duyệt có thể không hỗ trợ.')
    }
  }, [localStream, activeCallId, token])

  const stopRecording = useCallback(async () => {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') return
    mediaRecorderRef.current.stop()
    setIsRecording(false)
  }, [])

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
