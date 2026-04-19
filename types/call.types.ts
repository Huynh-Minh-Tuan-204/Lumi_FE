import { CallSignalR } from '@/lib/call-signalr'

export interface UserPeer {
  userId: number
  userName: string
  stream: MediaStream | null
}

export interface PeerState {
  userId: number
  userName: string
  stream: MediaStream | null
  connection: RTCPeerConnection
  isPolite: boolean
  makingOffer: boolean
  ignoreOffer: boolean
}

export interface CallContextType {
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

export interface ParticipantInfo {
  userId: number
  userName: string
  isCameraOn?: boolean
  isMuted?: boolean
}

