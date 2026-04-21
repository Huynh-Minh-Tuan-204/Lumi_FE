'use client'

const RTC_CONFIGURATION: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
  ],
}

export interface WebRTCHooks {
  onLocalStream?: (stream: MediaStream) => void
  onRemoteStream?: (stream: MediaStream) => void
  onIceCandidate?: (candidate: RTCIceCandidateInit) => void
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void
}

export class WebRTCClient {
  private peerConnection: RTCPeerConnection
  public localStream: MediaStream | null = null
  public remoteStream: MediaStream = new MediaStream()
  public screenStream: MediaStream | null = null
  private hooks: WebRTCHooks
  private isClosed: boolean = false

  constructor(hooks: WebRTCHooks = {}, customIceServers?: RTCIceServer[]) {
    this.hooks = hooks
    const configuration = {
      ...RTC_CONFIGURATION,
      iceServers: customIceServers && customIceServers.length > 0 
        ? [...RTC_CONFIGURATION.iceServers!, ...customIceServers]
        : RTC_CONFIGURATION.iceServers
    }
    this.peerConnection = new RTCPeerConnection(configuration)
    this.setupPeerConnection()
  }

  private setupPeerConnection() {
    this.peerConnection.onicecandidate = (event) => {
      if (this.isClosed) return
      if (event.candidate && this.hooks.onIceCandidate) {
        this.hooks.onIceCandidate(event.candidate.toJSON())
      }
    }

    this.peerConnection.ontrack = (event) => {
      if (this.isClosed) return
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0]
        this.hooks.onRemoteStream?.(this.remoteStream)
      }
    }

    this.peerConnection.onconnectionstatechange = () => {
      if (this.isClosed) return
      this.hooks.onConnectionStateChange?.(this.peerConnection.connectionState)
    }

    this.peerConnection.oniceconnectionstatechange = () => {
      if (this.isClosed) return
      this.hooks.onConnectionStateChange?.(this.peerConnection.connectionState)
    }
  }

  async getLocalMedia({video = true, audio = true} = {}): Promise<MediaStream> {
    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video })
    } catch (err: any) {
      if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        // Fallback: if video requested but not found, try audio only
        if (video && audio) {
          console.warn('WebRTC: Video device not found, falling back to audio only')
          stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        } else {
          throw err
        }
      } else {
        throw err
      }
    }
    
    if (this.isClosed) {
      stream.getTracks().forEach(t => t.stop())
      return stream
    }

    this.localStream = stream
    this.hooks.onLocalStream?.(stream)

    stream.getTracks().forEach((track) => {
      this.peerConnection.addTrack(track, stream)
    })

    return stream
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (this.isClosed) throw new Error('Client closed')
    const offer = await this.peerConnection.createOffer()
    await this.peerConnection.setLocalDescription(offer)
    return offer
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (this.isClosed) throw new Error('Client closed')
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)
    return answer
  }

  async setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void> {
    if (this.isClosed) return
    await this.peerConnection.setRemoteDescription(description)
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.isClosed || !candidate) return
    await this.peerConnection.addIceCandidate(candidate)
  }

  async replaceVideoTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (this.isClosed) {
      newTrack.stop()
      return
    }
    const senders = this.peerConnection.getSenders().filter((sender) => sender.track?.kind === 'video')
    if (senders.length > 0) {
      await senders[0].replaceTrack(newTrack)
    } else {
      this.peerConnection.addTrack(newTrack, this.localStream ?? new MediaStream())
    }
  }

  muteAudio(muted: boolean) {
    this.localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !muted
    })
  }

  toggleVideo(enabled: boolean) {
    this.localStream?.getVideoTracks().forEach((track) => {
      track.enabled = enabled
    })
  }

  async startScreenShare(): Promise<MediaStream> {
    if (this.isClosed) throw new Error('Client closed')
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error('Screen share is not supported on this browser')
    }

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true })
    const [screenTrack] = this.screenStream.getVideoTracks()
    if (!screenTrack) {
      throw new Error('Screen share track not found')
    }

    await this.replaceVideoTrack(screenTrack)

    screenTrack.onended = () => {
      this.stopScreenShare().catch(() => {
        // ignore
      })
    }

    return this.screenStream
  }

  async stopScreenShare(): Promise<void> {
    if (this.screenStream) {
      this.screenStream.getTracks().forEach((track) => track.stop())
      this.screenStream = null
    }

    if (this.localStream && !this.isClosed) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        await this.replaceVideoTrack(videoTrack)
      }
    }
  }

  close(): void {
    if (this.isClosed) return
    this.isClosed = true
    
    const stopStream = (stream: MediaStream | null) => {
      if (!stream) return
      stream.getTracks().forEach(track => {
        track.stop()
        track.enabled = false
      })
    }

    stopStream(this.localStream)
    stopStream(this.screenStream)
    stopStream(this.remoteStream)

    this.peerConnection.getSenders().forEach((sender) => {
      try {
        sender.track?.stop()
      } catch {}
    })
    
    try {
      this.peerConnection.close()
    } catch {}
  }
}

