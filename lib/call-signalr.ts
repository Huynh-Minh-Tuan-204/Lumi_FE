'use client'

import * as signalR from '@microsoft/signalr'
import { CALL_HUB_URL } from '@/constants/api.constants'

export interface CallSignalRHandlers {
  onReceiveOffer?: (offer: RTCSessionDescriptionInit, fromUserId: number) => void
  onReceiveAnswer?: (answer: RTCSessionDescriptionInit, fromUserId: number) => void
  onReceiveIceCandidate?: (candidate: RTCIceCandidateInit, fromUserId: number) => void
  onUserJoined?: (connectionId: string, userId: number, displayName: string) => void
  onUserLeft?: (connectionId: string, userId: number, displayName: string) => void
  onConnectionStateChange?: (state: signalR.HubConnectionState) => void
  onIncomingJoinRequest?: (req: any) => void
  onJoinRequestAccepted?: (meetingId: number | string) => void
  onJoinRequestDeclined?: (meetingId: number | string, reason: string) => void
  onMeetingMemberList?: (members: any[]) => void
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

    connection.on('JoinRequestDeclined', (meetingId: any, reason: string) => {
      this.handlers.onJoinRequestDeclined?.(meetingId, reason)
    })

    connection.on('MeetingMemberList', (members: any[]) => {
      this.handlers.onMeetingMemberList?.(members)
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

  private async invokeSafe(methodName: string, ...args: any[]): Promise<void> {
    if (!this.connection) return
    
    // If starting, wait for it
    if (this.startPromise) {
        try { await this.startPromise } catch {}
    }

    if (this.connection.state !== signalR.HubConnectionState.Connected) {
        // Log and wait a bit if it's connecting/reconnecting
        if (this.connection.state === signalR.HubConnectionState.Connecting || 
            this.connection.state === signalR.HubConnectionState.Reconnecting) {
            console.warn(`[SignalR] Waiting for connection before ${methodName}...`)
            await new Promise(r => setTimeout(r, 500))
        }
        
        if (this.connection.state !== signalR.HubConnectionState.Connected) {
            console.error(`[SignalR] Cannot invoke ${methodName}: State is ${this.connection.state}`)
            return
        }
    }

    try {
        await this.connection.invoke(methodName, ...args)
    } catch (err) {
        console.error(`[SignalR] Invoke ${methodName} failed:`, err)
    }
  }

  async joinCall(callId: string): Promise<void> {
    await this.invokeSafe('JoinCall', callId)
  }

  async leaveCall(callId: string): Promise<void> {
    await this.invokeSafe('LeaveCall', callId)
  }

  async sendOffer(callId: string, targetUserId: number, offer: RTCSessionDescriptionInit): Promise<void> {
    await this.invokeSafe('SendOffer', callId, targetUserId, offer)
  }

  async sendAnswer(callId: string, targetUserId: number, answer: RTCSessionDescriptionInit): Promise<void> {
    await this.invokeSafe('SendAnswer', callId, targetUserId, answer)
  }

  async sendIceCandidate(callId: string, targetUserId: number, candidate: RTCIceCandidateInit): Promise<void> {
    await this.invokeSafe('SendIceCandidate', callId, targetUserId, candidate)
  }

  async requestJoin(meetingId: number): Promise<void> {
    await this.invokeSafe('RequestJoin', meetingId)
  }

  async acceptJoinRequest(meetingId: number, attendeeId: number): Promise<void> {
    await this.invokeSafe('AcceptJoinRequest', meetingId, attendeeId)
  }

  async declineJoinRequest(meetingId: number, attendeeId: number): Promise<void> {
    await this.invokeSafe('DeclineJoinRequest', meetingId, attendeeId)
  }

  async getIceServers(): Promise<RTCIceServer[]> {
    if (!this.isConnected) return []
    try {
        return await this.connection!.invoke('GetIceServers')
    } catch {
        return []
    }
  }
}


