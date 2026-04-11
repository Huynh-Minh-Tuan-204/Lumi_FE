'use client'

import * as signalR from '@microsoft/signalr'

function buildCallHubUrl(): string {
  const callHubUrl = process.env.NEXT_PUBLIC_CALL_HUB_URL
  if (callHubUrl) return callHubUrl

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
  try {
    const u = new URL(apiUrl)
    return `${u.origin}/callhub`
  } catch {
    return 'https://mintuan-001-site1.ktempurl.com/callhub';
  }
}

const CALL_HUB_URL = buildCallHubUrl()

export interface CallSignalRHandlers {
  onReceiveOffer?: (offer: RTCSessionDescriptionInit, fromUserId: number) => void
  onReceiveAnswer?: (answer: RTCSessionDescriptionInit, fromUserId: number) => void
  onReceiveIceCandidate?: (candidate: RTCIceCandidateInit, fromUserId: number) => void
  onUserJoined?: (connectionId: string, userId: number, displayName: string) => void
  onUserLeft?: (connectionId: string, userId: number, displayName: string) => void
  onConnectionStateChange?: (state: signalR.HubConnectionState) => void
  onIncomingJoinRequest?: (req: any) => void
  onJoinRequestAccepted?: (meetingId: number) => void
  onJoinRequestDeclined?: (meetingId: number, reason: string) => void
}

export class CallSignalR {
  private connection: signalR.HubConnection | null = null
  private handlers: CallSignalRHandlers
  private startPromise: Promise<void> | null = null

  constructor(handlers: CallSignalRHandlers = {}) {
    this.handlers = handlers
  }

  get isConnected(): boolean {
    return this.connection?.state === signalR.HubConnectionState.Connected
  }

  async connect(token: string): Promise<void> {
    if (this.connection || this.startPromise) return

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(CALL_HUB_URL, {
        accessTokenFactory: () => token,
        skipNegotiation: true,
        transport: signalR.HttpTransportType.WebSockets,
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build()

    connection.on('ReceiveOffer', (offer: any, fromUserId: number) => {
      this.handlers.onReceiveOffer?.(offer, fromUserId)
    })

    connection.on('ReceiveAnswer', (answer: any, fromUserId: number) => {
      this.handlers.onReceiveAnswer?.(answer, fromUserId)
    })

    connection.on('ReceiveIceCandidate', (candidate: any, fromUserId: number) => {
      this.handlers.onReceiveIceCandidate?.(candidate, fromUserId)
    })

    connection.on('UserJoined', (connectionId: string, userId: number, displayName: string) => {
      this.handlers.onUserJoined?.(connectionId, userId, displayName)
    })

    connection.on('UserLeft', (connectionId: string, userId: number, displayName: string) => {
      this.handlers.onUserLeft?.(connectionId, userId, displayName)
    })

    connection.on('IncomingJoinRequest', (req: any) => {
      this.handlers.onIncomingJoinRequest?.(req)
    })

    connection.on('JoinRequestAccepted', (meetingId: number) => {
      this.handlers.onJoinRequestAccepted?.(meetingId)
    })

    connection.on('JoinRequestDeclined', (meetingId: number, reason: string) => {
      this.handlers.onJoinRequestDeclined?.(meetingId, reason)
    })

    connection.onreconnected(() => {
      this.handlers.onConnectionStateChange?.(signalR.HubConnectionState.Connected)
    })

    connection.onclose(() => {
      this.handlers.onConnectionStateChange?.(signalR.HubConnectionState.Disconnected)
    })

    this.connection = connection
    this.startPromise = connection.start()

    try {
      await this.startPromise
      this.handlers.onConnectionStateChange?.(connection.state)
    } finally {
      this.startPromise = null
    }
  }

  async disconnect() {
    if (this.startPromise) {
      try {
        await this.startPromise
      } catch {
        // ignore
      }
    }
    if (!this.connection) return
    try {
      await this.connection.stop()
    } catch {
      // ignore
    }
    this.connection = null
  }

  async joinCall(callId: string): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('JoinCall', callId)
  }

  async leaveCall(callId: string): Promise<void> {
    if (!this.connection) throw new Error('SignalR not connected')
    await this.connection.invoke('LeaveCall', callId).catch(() => undefined)
  }

  async sendOffer(callId: string, targetUserId: number, offer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('SendOffer', callId, targetUserId, offer)
  }

  async sendAnswer(callId: string, targetUserId: number, answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('SendAnswer', callId, targetUserId, answer)
  }

  async sendIceCandidate(callId: string, targetUserId: number, candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('SendIceCandidate', callId, targetUserId, candidate)
  }

  async requestJoin(meetingId: number): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('RequestJoin', meetingId)
  }

  async acceptJoinRequest(meetingId: number, attendeeId: number): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('AcceptJoinRequest', meetingId, attendeeId)
  }

  async declineJoinRequest(meetingId: number, attendeeId: number): Promise<void> {
    if (!this.isConnected) return
    await this.connection?.invoke('DeclineJoinRequest', meetingId, attendeeId)
  }
}
