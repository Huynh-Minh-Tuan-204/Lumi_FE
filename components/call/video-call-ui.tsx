'use client'

import { useMemo, useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuth } from '@/lib/auth-context'
import { meetingsApi } from '@/lib/api'
import { CallSignalR } from '@/lib/call-signalr'
import { WebRTCClient } from '@/lib/webrtc'
import { Mic, MicOff, Video, VideoOff, PhoneOff, Monitor, MoreHorizontal, Users, MessageSquare, Send, X } from 'lucide-react'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { conversationsApi } from '@/lib/api'
import { useSignalR } from '@/hooks/use-signalr'
import { useCallback } from 'react'

interface VideoCallUIProps {
  callId: string
  callType: 'video' | 'voice'
  participantName: string
  onEndCall: () => void
}

interface ParticipantInfo {
  id: string
  name: string
  muted: boolean
  videoOn: boolean
}

export function VideoCallUI({ callId, callType, participantName, onEndCall }: VideoCallUIProps) {
  const { user, token } = useAuth()
  const { sendMessage, messages: globalMessages } = useSignalR()

  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOn, setIsCameraOn] = useState(callType === 'video')
  const [isScreenSharing, setIsScreenSharing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [callDuration, setCallDuration] = useState(0)

  // Sidebar states
  const [showPeople, setShowPeople] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [meetingParticipants, setMeetingParticipants] = useState<any[]>([])
  const [convId, setConvId] = useState<number | null>(null)
  const [chatInput, setChatInput] = useState('')

  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const signalRRef = useRef<CallSignalR | null>(null)
  const peerRef = useRef<WebRTCClient | null>(null)
  const receivedRemoteOffer = useRef(false)
  const offerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const participants = useMemo<ParticipantInfo[]>(
    () => [
      { id: 'me', name: user?.fullName || 'You', muted: isMuted, videoOn: isCameraOn },
      { id: 'remote', name: participantName || 'Remote participant', muted: false, videoOn: true },
    ],
    [user?.fullName, participantName, isMuted, isCameraOn]
  )

  useEffect(() => {
    const timer = setInterval(() => setCallDuration((value) => value + 1), 1000)
    return () => clearInterval(timer)
  }, [])

  const fetchMeetingData = useCallback(async (signal?: AbortSignal) => {
    if (!token || !callId) return
    try {
      const meeting = await meetingsApi.getMeeting(token, Number(callId))
      if (signal?.aborted) return
      setConvId(meeting.conversationId)
      
      const parts = await meetingsApi.getParticipants(token, Number(callId))
      if (signal?.aborted) return
      setMeetingParticipants(parts)
    } catch (e) {
      if (!signal?.aborted) {
        console.error("Error fetching meeting data", e)
        setError('Database connection busy. Please wait...')
      }
    }
  }, [callId, token])

  useEffect(() => {
    const ac = new AbortController()
    fetchMeetingData(ac.signal)
    return () => ac.abort()
  }, [fetchMeetingData])

  const relevantMessages = useMemo(() => {
    if (!convId) return []
    return globalMessages.filter(m => m.conversationId === convId)
  }, [globalMessages, convId])

  const handleSendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!chatInput.trim() || !convId) return
    try {
      await sendMessage(convId, chatInput.trim(), "PLAIN") 
      setChatInput('')
    } catch (err) {
      console.error("Failed to send message in call", err)
    }
  }

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const mins = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
    }
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    if (!token) {
      setError('Authentication required')
      setIsLoading(false)
      return
    }

    let active = true

    const cleanup = async () => {
      console.log('WebRTC: Cleanup starting for call', callId);
      active = false;
      if (offerTimerRef.current) clearTimeout(offerTimerRef.current);
      
      try {
        if (token) {
          meetingsApi.leaveMeeting(token, Number(callId)).catch(() => undefined);
        }
        await signalRRef.current?.leaveCall(callId).catch(() => undefined);
        await signalRRef.current?.disconnect().catch(() => undefined);
      } catch (e) {}

      if (peerRef.current) {
        peerRef.current.close();
      }
      
      if (localVideoRef.current) localVideoRef.current.srcObject = null;
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      setIsConnected(false);
    }

    const startCall = async () => {
      try {
        if (!active) return;
        setError(null)
        setIsLoading(true)

        const iceQueue: RTCIceCandidateInit[] = []
        let makingOffer = false;
        let ignoreOffer = false;

        const webrtc = new WebRTCClient({
          onLocalStream: (stream) => {
            console.log('WebRTC: Local stream received!')
            if (localVideoRef.current) localVideoRef.current.srcObject = stream
          },
          onRemoteStream: (stream) => {
            console.log('WebRTC: Remote stream received!')
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream
            if (active) setIsConnected(true)
          },
          onIceCandidate: async (candidate) => {
            if (signalR.isConnected) {
              await signalR.sendIceCandidate(callId, candidate).catch(console.warn)
            }
          },
          onConnectionStateChange: (state) => {
            console.log('WebRTC: Connection state:', state)
            if (active) setIsConnected(state === 'connected')
          },
        })

        const pc = (webrtc as any).peerConnection as RTCPeerConnection;
        peerRef.current = webrtc

        const signalR = new CallSignalR({
          onUserJoined: async (_connId, displayName) => {
            if (displayName) {
              setMeetingParticipants(prev => {
                const upperName = displayName.toUpperCase()
                if (prev.some(p => p.fullName?.toUpperCase() === upperName)) return prev
                return [...prev, { fullName: displayName, isPresent: true }]
              })
            }
          },
          onUserLeft: (_connId, displayName) => {
            if (displayName) {
              setMeetingParticipants(prev =>
                prev.map(p => p.fullName === displayName ? { ...p, isPresent: false } : p)
              )
            }
          },
          onReceiveOffer: async (description, fromUserId) => {
            if (!pc || !active || !user) return
            try {
              const myId = parseInt(user.id.toString());
              const isPolite = myId < fromUserId;
              const offerCollision = (description.type === "offer") &&
                                     (makingOffer || pc.signalingState !== "stable");

              ignoreOffer = !isPolite && offerCollision;
              if (ignoreOffer) {
                console.log(`WebRTC: Offer collision [Me:${myId} vs From:${fromUserId}] - ignoring (impolite)`);
                return;
              }

              if (offerCollision) {
                console.log(`WebRTC: Offer collision [Me:${myId} vs From:${fromUserId}] - rolling back (polite)`);
                await Promise.all([
                  pc.setLocalDescription({ type: 'rollback' }),
                  pc.setRemoteDescription(description)
                ]);
              } else {
                await pc.setRemoteDescription(description);
              }

              if (description.type === "offer") {
                await pc.setLocalDescription();
                if (signalR.isConnected) {
                  await signalR.sendAnswer(callId, pc.localDescription!);
                }
              }

              // Process queued candidates
              while (iceQueue.length > 0) {
                const cand = iceQueue.shift()!;
                await pc.addIceCandidate(cand).catch(e => console.warn('WebRTC: Failed to add queued ICE', e));
              }
            } catch (err) {
              console.error('WebRTC: Error handling offer/answer', err);
            }
          },
          onReceiveAnswer: async (answer) => {
            if (!pc || !active) return
            try {
              await pc.setRemoteDescription(answer);
            } catch (err) {
              console.error('WebRTC: Error setting remote answer', err);
            }
          },
          onReceiveIceCandidate: async (candidate) => {
            if (!pc || !active) return
            try {
              if (ignoreOffer) return;
              if (pc.remoteDescription && pc.remoteDescription.type) {
                await pc.addIceCandidate(candidate).catch(() => {});
              } else {
                iceQueue.push(candidate);
              }
            } catch (e) {}
          }
        })

        pc.onnegotiationneeded = async () => {
          if (!signalR.isConnected) {
             console.warn('WebRTC: Negotiation skipped, SignalR not connected');
             return;
          }
          try {
            makingOffer = true;
            await pc.setLocalDescription();
            await signalR.sendOffer(callId, pc.localDescription!);
          } catch (err) {
            console.error('WebRTC: Negotiation error', err);
          } finally {
            makingOffer = false;
          }
        };

        signalRRef.current = signalR
        await signalR.connect(token)
        if (!active) {
            signalR.disconnect().catch(() => {});
            return;
        }

        await signalR.joinCall(callId)
        if (!active) return;

        await webrtc.getLocalMedia({ audio: true, video: callType === 'video' })
      } catch (err) {
        console.error('Call initialization error', err)
        if (active) setError((err as Error)?.message ?? 'Unable to connect call')
      } finally {
        if (active) setIsLoading(false)
      }
    }

    startCall()

    return () => {
      active = false
      cleanup().catch(() => undefined)
    }
  }, [callId, callType, token])

  const toggleMic = () => setIsMuted((prev) => {
    const next = !prev
    peerRef.current?.muteAudio(next)
    return next
  })

  const toggleCamera = () => setIsCameraOn((prev) => {
    const next = !prev
    peerRef.current?.toggleVideo(next)
    return next
  })

  const toggleScreenShare = async () => {
    if (!peerRef.current) return

    if (isScreenSharing) {
      await peerRef.current.stopScreenShare()
      setIsScreenSharing(false)
      return
    }

    try {
      await peerRef.current.startScreenShare()
      setIsScreenSharing(true)
    } catch (err) {
      console.error('Screen share error', err)
      setError((err as Error)?.message ?? 'Screen share failed')
    }
  }

  const endCall = () => {
    // Fire and forget SignalR leave to avoid blocking UI during timeout
    if (token) {
        meetingsApi.leaveMeeting(token, Number(callId)).catch(() => undefined)
    }
    signalRRef.current?.leaveCall(callId).catch(() => undefined)
    signalRRef.current?.disconnect().catch(() => undefined)
    peerRef.current?.close()
    onEndCall()
  }

  // Removed the rigid full-screen blocking UI for loading/error
  // Instead, everything is blended smoothly into the Teams-like layout
  const isConnecting = isLoading && !error;

  return (
    <div className="flex h-screen flex-col bg-[#1F1F1F] text-white">
      {/* Top Header - Like Teams */}
      <div className="flex h-12 w-full items-center justify-between bg-[#1F1F1F] px-4 shadow-sm border-b border-white/5 z-10">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-200">
              {callType === 'video' ? 'Video Meeting' : 'Voice Meeting'}
            </span>
            <span className="rounded-md bg-stone-800 px-2 py-0.5 text-xs text-gray-400">
              {formatDuration(callDuration)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-8 text-gray-400 hover:text-white hover:bg-white/10", showPeople && "text-white bg-white/10")}
            onClick={() => { setShowPeople(!showPeople); setShowChat(false); }}
          >
            <Users className="h-4 w-4 mr-2" />
            People
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            className={cn("h-8 text-gray-400 hover:text-white hover:bg-white/10 hidden sm:flex", showChat && "text-white bg-white/10")}
            onClick={() => { setShowChat(!showChat); setShowPeople(false); }}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Chat
          </Button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        <div className="relative flex-1 bg-[#111111] overflow-hidden flex items-center justify-center p-2 sm:p-4">

        {/* Remote Video Container - Fills the main view */}
        <div className={cn(
          "relative w-full h-full rounded-xl overflow-hidden shadow-xl ring-1 ring-white/10 transition-all duration-500",
          !isConnected ? "bg-linear-to-br from-stone-900 to-black flex items-center justify-center" : "bg-black"
        )}>

          <video
            ref={remoteVideoRef}
            className={cn("h-full w-full object-cover", (!isConnected || error) && "hidden")}
            autoPlay
            playsInline
          />

          {/* Fallback Display if no video/loading */}
          {(!isConnected || error) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center backdrop-blur-sm bg-black/40">
              <Avatar className="h-28 w-28 ring-4 ring-stone-800 shadow-2xl mb-6">
                <AvatarFallback className="text-4xl bg-linear-to-br from-indigo-500 to-purple-600 text-white">
                  {participantName.substring(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <h2 className="text-2xl font-semibold mb-2">{participantName}</h2>
              {error ? (
                <div className="flex flex-col items-center">
                  <p className="text-red-400 mb-4">{error}</p>
                  <Button variant="outline" className="text-white border-white/20 hover:bg-white/10" onClick={endCall}>Close</Button>
                </div>
              ) : (
                <p className="text-gray-400 animate-pulse text-sm font-medium">Connecting securely...</p>
              )}
            </div>
          )}

          {/* Participant Label overlay */}
          {isConnected && !error && (
            <div className="absolute bottom-4 left-4 rounded-md bg-black/60 backdrop-blur-md px-3 py-1.5 flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-gray-200">{participantName}</span>
            </div>
          )}
        </div>

        {/* Local Video PIP Component */}
        <div className="absolute top-6 right-6 h-36 w-56 overflow-hidden rounded-xl border-2 border-stone-800 bg-stone-950 shadow-2xl z-20 group transition-transform hover:scale-105">
          <video
            ref={localVideoRef}
            className="h-full w-full object-cover scale-x-[-1]" // mirror local video
            autoPlay
            muted
            playsInline
          />
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-stone-900">
              <Avatar className="h-16 w-16 opacity-50">
                <AvatarFallback className="text-xl bg-stone-800">ME</AvatarFallback>
              </Avatar>
            </div>
          )}
          <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-2 py-1 flex items-center gap-2">
            {isMuted && <MicOff className="h-3 w-3 text-red-400" />}
            <span className="text-xs text-white/90">You</span>
          </div>
        </div>

        {/* Floating Controls Bar (Teams Style) */}
        {(!error) && (
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30">
            <div className="flex items-center gap-3 rounded-2xl bg-stone-900/90 backdrop-blur-xl px-6 py-3 shadow-2xl ring-1 ring-white/10">
              <TooltipProvider delayDuration={300}>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={toggleCamera}
                      className={cn(
                        'h-12 w-12 rounded-xl transition-all',
                        isCameraOn ? 'bg-[#2B2B2B] hover:bg-[#3D3D3D] text-white' : 'bg-[#1F1F1F] text-white border border-white/10 hover:bg-[#3D3D3D]'
                      )}
                    >
                      {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-none text-white text-xs">Turn camera {isCameraOn ? 'off' : 'on'}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={toggleMic}
                      className={cn(
                        'h-12 w-12 rounded-xl transition-all',
                        isMuted ? 'bg-[#1F1F1F] text-white border border-white/10 hover:bg-[#3D3D3D]' : 'bg-[#2B2B2B] hover:bg-[#3D3D3D] text-white'
                      )}
                    >
                      {isMuted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-none text-white text-xs">{isMuted ? 'Unmute' : 'Mute'}</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={toggleScreenShare}
                      className={cn(
                        'h-12 w-12 rounded-xl transition-all hidden sm:flex',
                        isScreenSharing ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20' : 'bg-[#2B2B2B] hover:bg-[#3D3D3D] text-white'
                      )}
                    >
                      <Monitor className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-none text-white text-xs">{isScreenSharing ? 'Stop sharing' : 'Share screen'}</TooltipContent>
                </Tooltip>

                <div className="w-px h-8 bg-white/10 mx-2" />

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-12 w-12 rounded-xl bg-[#2B2B2B] hover:bg-[#3D3D3D] text-white transition-all hidden sm:flex"
                    >
                      <MoreHorizontal className="h-5 w-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-none text-white text-xs">More actions</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={endCall}
                      className="h-12 px-6 rounded-xl bg-[#C4314B] hover:bg-[#A3293E] text-white shadow-lg shadow-red-500/20 transition-all font-semibold ml-2 flex items-center gap-2"
                    >
                      <PhoneOff className="h-5 w-5" />
                      Leave
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="bg-stone-800 border-none text-white text-xs">Leave meeting</TooltipContent>
                </Tooltip>

              </TooltipProvider>
            </div>
          </div>
        )}
        </div>
        {/* Sidebars */}
        {(showPeople || showChat) && (
          <div className="w-80 border-l border-white/5 bg-[#1F1F1F] flex flex-col z-40 animate-in slide-in-from-right duration-300">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-semibold text-sm">
                {showPeople ? 'Participants' : 'Meeting Chat'}
              </h3>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-gray-400" onClick={() => { setShowPeople(false); setShowChat(false); }}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {showPeople && (
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">
                  {meetingParticipants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="bg-indigo-600 text-[10px]">{p.fullName?.substring(0, 2).toUpperCase() || 'U'}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{p.fullName}</p>
                        <p className="text-[10px] text-gray-500">{p.isPresent ? 'Joined' : 'Left'}</p>
                      </div>
                    </div>
                  ))}
                  {meetingParticipants.length === 0 && (
                    <p className="text-xs text-gray-500 text-center py-10">Loading participants...</p>
                  )}
                </div>
              </ScrollArea>
            )}

            {showChat && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex-1 p-4 flex flex-col justify-center items-center text-center">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <MessageSquare className="h-8 w-8 text-indigo-500" />
                  </div>
                  <p className="text-sm font-medium">Meeting Chat</p>
                  <p className="text-xs text-gray-500 max-w-[200px] mt-2 leading-relaxed">
                    This chat is linked to the main conversation. All messages are synchronized.
                  </p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-8 border-white/10 text-xs bg-white/5 hover:bg-white/10"
                    onClick={() => window.open('/chat', '_blank')}
                  >
                    Go to main chat
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
