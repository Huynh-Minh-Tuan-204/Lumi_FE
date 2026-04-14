'use client'

import { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { announcementsApi } from '@/lib/api'
import { 
  getOrCreateIdentityKey, exportIdentityPublicKey, importIdentityPublicKey,
  generateEphemeralRSAKeyPair, exportPublicKey, importPublicKey,
  generateSenderKey, encryptSessionKeyForPeer, decryptSessionKey,
  encryptMessagePro, decryptMessagePro, signData, verifySignature,
  base64ToBuffer, bufferToBase64
} from '@/lib/crypto-utils'

const HUB_URL = process.env.NEXT_PUBLIC_SIGNALR_HUB_URL || 'https://mintuan-001-site1.ktempurl.com/chatHub';

export interface ChatMessage {
  id: number
  conversationId: number
  senderId: number
  sender: string
  message: string
  time: Date
  iv?: string
  messageType?: string
  attachments?: any[]
  avatarPath?: string
  stickerUrl?: string
  isPinned?: boolean
  isSystem?: boolean
  isRead?: boolean
  parentMessageId?: number
}

export interface SignalRHookReturn {
  isConnected: boolean
  isReconnecting: boolean
  sendMessage: (conversationId: number, plaintext: string, messageType?: string, parentMessageId?: number) => Promise<void>
  sendNotification: (message: string) => Promise<void>
  lastMessage: ChatMessage | null
  lastReadUpdate: { conversationId: number, userId: number } | null
  onTriggeredReminder: (callback: (data: { conversationId: number, content: string }) => void) => void
  notifications: ChatMessage[]
  onlineUsers: Set<number>
  incomingCall: { meetingId: string; callerName: string; callType: string; convName: string } | null
  clearIncomingCall: () => void
  callDeclined: { meetingId: string; declinerName: string } | null
  clearCallDeclined: () => void
  markAsRead: (conversationId: number) => Promise<void>
  lastGroupUpdate: { conversationId: number, avatarPath?: string, backgroundPath?: string } | null
  sendTyping: (conversationId: number) => Promise<void>
  typingUsers: { conversationId: number, userId: number, userName: string }[]
  lastUserUpdate: { userId: number, avatarPath: string } | null
  sendSticker: (conversationId: number, stickerUrl: string) => Promise<void>
  togglePinMessage: (messageId: number) => Promise<void>
  sendReminder: (conversationId: number, content: string, remindAtIso: string) => Promise<void>
  pinnedMessages: { messageId: number, isPinned: boolean, pinnedBy?: number, conversationId: number } | null
  lastDeletedMessage: { conversationId: number, messageId: number } | null
  markAllNotificationsRead: () => Promise<void>
  lastScheduleUpdate: { type: 'created' | 'status' | 'deleted', data: any } | null
  lastUserLeft: number | null
  activeMeeting: { meetingId: string; conversationId: number; title: string; callType: string; hostName: string } | null
  initiateE2EEHandshake: (conversationId: number) => Promise<void>
}

const SignalRContext = createContext<SignalRHookReturn | null>(null)

export function SignalRProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { token, user, updateUser } = useAuth()

  const connectionRef = useRef<signalR.HubConnection | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastMessage, setLastMessage] = useState<ChatMessage | null>(null)
  const [notifications, setNotifications] = useState<ChatMessage[]>([])
  const [lastReadUpdate, setLastReadUpdate] = useState<{ conversationId: number, userId: number } | null>(null)
  const [onlineUsers, setOnlineUsers] = useState<Set<number>>(new Set())
  const [incomingCall, setIncomingCall] = useState<{ meetingId: string; callerName: string; callType: string; convName: string } | null>(null)
  const [callDeclined, setCallDeclined] = useState<{ meetingId: string; declinerName: string } | null>(null)
  const [lastGroupUpdate, setLastGroupUpdate] = useState<{ conversationId: number, avatarPath?: string, backgroundPath?: string } | null>(null)
  const [typingUsers, setTypingUsers] = useState<{ conversationId: number, userId: number, userName: string }[]>([])
  const [lastUserUpdate, setLastUserUpdate] = useState<{ userId: number, avatarPath: string } | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<{ messageId: number, isPinned: boolean, pinnedBy?: number, conversationId: number } | null>(null)
  const [lastDeletedMessage, setLastDeletedMessage] = useState<{ conversationId: number, messageId: number } | null>(null)
  const [lastScheduleUpdate, setLastScheduleUpdate] = useState<{ type: 'created' | 'status' | 'deleted', data: any } | null>(null)
  const [lastUserLeft, setLastUserLeft] = useState<number | null>(null)
  const [activeMeeting, setActiveMeeting] = useState<{ meetingId: string; conversationId: number; title: string; callType: string; hostName: string } | null>(null)
  // --- E2EE Production Stats ---
  const [identityKeys, setIdentityKeys] = useState<CryptoKeyPair | null>(null);
  const [myRSAKeys, setMyRSAKeys] = useState<CryptoKeyPair | null>(null);
  
  // Storage for keys from other users
  const peerIdentityKeysRef = useRef<Map<number, CryptoKey>>(new Map()); // id -> ECDSA PubKey
  const peerSenderKeysRef = useRef<Map<number, CryptoKey>>(new Map());   // id -> AES-GCM Key
  const mySenderKeyRef = useRef<CryptoKey | null>(null);

  // 1. Khởi tạo danh tính bền vững (IndexedDB)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      getOrCreateIdentityKey().then(keys => {
        setIdentityKeys(keys);
        console.log("🔒 [E2EE] Identity key loaded (Persistent).");
      });
      // Tạo RSA dùng tạm cho phiên này
      generateEphemeralRSAKeyPair().then(keys => setMyRSAKeys(keys));
    }
  }, []);

  // 2. Hàm bắt đầu Handshake nâng cao (Chống MITM)
  const initiateE2EEHandshake = useCallback(async (conversationId: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected && identityKeys && myRSAKeys) {
      const idPubKeyB64 = await exportIdentityPublicKey(identityKeys.publicKey);
      const rsaPubKeyB64 = await exportPublicKey(myRSAKeys.publicKey);
      
      // Sign the RSA key to prevent MITM
      const signature = await signData(rsaPubKeyB64, identityKeys.privateKey);
      
      await connectionRef.current.invoke("SendSecureIdentity", conversationId, idPubKeyB64, rsaPubKeyB64, signature);
      console.log(`🤝 [E2EE] Identity and Signed RSA Key sent to group ${conversationId}`);
    }
  }, [identityKeys, myRSAKeys]);


  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setOnlineUsers(new Set());
      setLastMessage(null);
      setLastReadUpdate(null);
      setIncomingCall(null);
      setCallDeclined(null);
      setLastGroupUpdate(null);
      setTypingUsers([]);
      setLastUserUpdate(null);
      setPinnedMessages(null);
      setLastDeletedMessage(null);
      setLastScheduleUpdate(null);
      setActiveMeeting(null);
      setIsConnected(false);
      setIsReconnecting(false);
      return
    }

    const fetchHistory = async () => {
      try {
        const url = process.env.NEXT_PUBLIC_API_URL || 'https://mintuan-001-site1.ktempurl.com/api';
        const response = await fetch(`${url}/Announcements`, {
          headers: {
            'Authorization': `Bearer ${token}`,
            'ngrok-skip-browser-warning': 'true'
          }
        });
        if (response.ok) {
          const data = await response.json();
          const mapped = data.map((n: any) => ({
            id: n.Id || n.id || `temp-${n.Timestamp || Date.now()}`,
            sender: n.SenderName || n.senderName || 'System',
            message: n.Message || n.message || '',
            time: n.Timestamp || n.timestamp ? new Date(n.Timestamp || n.timestamp) : new Date(),
            isSystem: true,
            isRead: n.IsRead || n.isRead || false
          }));
          setNotifications(mapped);
        }
      } catch (e) {
        console.error("Failed to fetch notification history", e);
      }
    }

    fetchHistory();

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build()

    // --- HANDSHAKE BƯỚC 1: Xác thực danh tính & Nhận RSA ---
    connection.on("ReceiveSecureIdentity", async (senderId: number, idPubKeyBase64: string, rsaPubKeyBase64: string, signature: string, conversationId: number) => {
      if (user && senderId === user.id) return;
      try {
        const peerIdPubKey = await importIdentityPublicKey(idPubKeyBase64);
        
        // 1. Verify RSA key signature
        const isVerified = await verifySignature(rsaPubKeyBase64, signature, peerIdPubKey);
        if (!isVerified) {
          console.error("⛔ [E2EE] CẢNH BÁO: Public key của User " + senderId + " không hợp lệ (MITM detected)! ");
          return;
        }

        // 2. Store identity for later verification
        peerIdentityKeysRef.current.set(senderId, peerIdPubKey);

        // 3. Generate MY sender key if not already
        if (!mySenderKeyRef.current) {
          mySenderKeyRef.current = await generateSenderKey();
        }

        // 4. Encrypt MY sender key for THIS peer
        const peerRSAPubKey = await importPublicKey(rsaPubKeyBase64);
        const encryptedKey = await encryptSessionKeyForPeer(mySenderKeyRef.current, peerRSAPubKey);
        
        // 5. Send back our sender key wrapped
        await connection.invoke("SendSecureSenderKey", conversationId, senderId, encryptedKey);
      } catch (e) {
        console.error("Handshake Secure Identity error", e);
      }
    });

    // --- HANDSHAKE BƯỚC 2: Nhận khóa AES phiên ---
    connection.on("ReceiveSecureSenderKey", async (senderId: number, encryptedKeyBase64: string, conversationId: number) => {
       if (!myRSAKeys) return;
       try {
          const senderKey = await decryptSessionKey(encryptedKeyBase64, myRSAKeys.privateKey);
          peerSenderKeysRef.current.set(senderId, senderKey);
          console.log(`✅ [E2EE] Secured with User ${senderId}. Ready to decrypt.`);
       } catch (e) {
          console.error("Handshake Decrypt Key error", e);
       }
    });

    connection.on('ReceiveMessage', async (data: any) => {
      const { id, conversationId, senderId, senderName, content, iv, sig, messageType, stickerUrl, isPinned, createdAt, attachments, avatarPath, parentMessageId } = data;

      let displayContent = content;
      if (messageType === 'PLAIN' || !messageType) {
        const senderSessionKey = (user && senderId === user.id) ? mySenderKeyRef.current : peerSenderKeysRef.current.get(senderId);
        const senderIdKey = peerIdentityKeysRef.current.get(senderId);

        if (senderSessionKey && iv && sig && senderIdKey) {
           displayContent = await decryptMessagePro(content, iv, sig, senderSessionKey, senderIdKey);
        } else if (user && senderId === user.id && mySenderKeyRef.current) {
           // For local messages, we use our own session key + our identity key
           displayContent = await decryptMessagePro(content, iv, sig, mySenderKeyRef.current, identityKeys!.publicKey);
        } else {
           displayContent = "⏳ [E2EE: Đang thỏa thuận bảo mật...]";
           // Request handshake if missing keys
           initiateE2EEHandshake(conversationId);
        }
      }

      setLastMessage({
        id,
        conversationId,
        senderId,
        sender: senderName,
        message: displayContent,
        iv,
        messageType,
        stickerUrl,
        isPinned,
        time: new Date(createdAt),
        attachments: attachments || [],
        isSystem: false,
        avatarPath: avatarPath,
        parentMessageId: parentMessageId
      }
      )
    })

    connection.on('InitialOnlineUsers', (userIds: number[]) => {
      setOnlineUsers(new Set(userIds))
    })

    connection.on('ReceiveNotification', (data: any) => {
      const { id, title, sender, message, category, forceConfirmed, createdAt, isSystem } = data;

      if (category === "Security" && forceConfirmed) {
        toast.error(`🚨 CẢNH BÁO: ${title || "Security Alert"}`, {
          description: message,
          duration: 30000,
        });
      } else {
        toast.info(`📢 THÔNG BÁO: ${message}`, {
          description: `Từ: ${sender || 'Admin'}`,
          duration: 10000,
        });
      }

      setNotifications(prev => [
        {
          id: id || Date.now(),
          conversationId: 0,
          senderId: 0,
          sender: sender || 'System',
          message: message,
          time: new Date(createdAt || Date.now()),
          isSystem: isSystem || true,
          isRead: false
        },
        ...prev
      ])
    })

    connection.on("receiveSecurityAlert", (data: any) => {
      toast.error(`🚨 BẢO MẬT: ${data.title}`, {
        description: data.message,
        duration: 0,
      });
    })

    connection.on("receiveGeneralAnnouncement", (data: any) => {
      toast.info(`📢 ${data.title || "Thông báo"}`, {
        description: data.message,
      });
    })

    connection.on('UserStatusChanged', (userId: number, isOnline: boolean) => {
      setOnlineUsers(prev => {
        const next = new Set(prev)
        if (isOnline) next.add(userId)
        else next.delete(userId)
        return next
      })
    })

    connection.on('IncomingCall', (meetingId: string, callerId: number, callerName: string, callType: string, convName: string) => {
      if (user && callerId === user.id) return
      setIncomingCall({ meetingId, callerName, callType, convName })
    })

    connection.on('CallDeclined', (meetingId: string, declinerName: string) => {
      setCallDeclined({ meetingId, declinerName })
    })

    connection.on('MeetingStarted', (data: any) => {
      const { meetingId, conversationId, title, callType, hostName, hostId } = data
      const mIdString = String(meetingId);

      if (notifiedMeetingsRef.current.has(mIdString)) return;
      notifiedMeetingsRef.current.add(mIdString);

      setActiveMeeting({ meetingId: mIdString, conversationId, title, callType, hostName })

      if (user && hostId !== user.id) {
        toast.info(`🚀 CUỘC HỌP MỚI: ${title}`, {
          description: `Bởi ${hostName}. Tham gia ngay!`,
          duration: 5000,
          action: {
            label: "THAM GIA",
            onClick: () => window.location.href = `/call/${mIdString}?type=${callType || 'video'}`
          }
        });
      }
    })

    connection.on('GlobalMeetingStarted', (data: any) => {
      const { meetingId, conversationId, title, hostName, hostId, type } = data;

      if (user && (hostId === user.id || hostName === user.fullName)) return;

      const mIdString = String(meetingId);
      const convKey = `conv-${conversationId}`;

      if (notifiedMeetingsRef.current.has(mIdString) || notifiedMeetingsRef.current.has(convKey)) {
        return;
      }

      notifiedMeetingsRef.current.add(mIdString);
      notifiedMeetingsRef.current.add(convKey);

      setActiveMeeting({ meetingId: mIdString, conversationId, title, callType: type || 'video', hostName });

      toast.info(`🚀 CUỘC HỌP MỚI: ${title}`, {
        description: `Bởi ${hostName}. Bạn đã được mời tham gia!`,
        action: {
          label: "THAM GIA",
          onClick: () => {
            window.location.href = `/call/${mIdString}?type=${type || 'video'}`;
          }
        },
        duration: 5000
      });
    })

    connection.on('MeetingEnded', (data: any) => {
      const endedMeetingId = typeof data === 'object' ? data.meetingId : data
      setIncomingCall(prev => (prev?.meetingId === endedMeetingId ? null : prev))
      setActiveMeeting(prev => (prev?.meetingId === endedMeetingId ? null : prev))
    })

    connection.on('ReceiveGroupUpdate', (conversationId: number, avatarPath: string, backgroundPath: string) => {
      const avatarWithCache = avatarPath ? `${avatarPath}?v=${Date.now()}` : avatarPath;
      const bgWithCache = backgroundPath ? `${backgroundPath}?v=${Date.now()}` : backgroundPath;
      setLastGroupUpdate({ conversationId, avatarPath: avatarWithCache, backgroundPath: bgWithCache })
    })

    connection.on('UserUpdated', (userId: number, avatarPath: string) => {
      const pathWithTime = `${avatarPath}?v=${Date.now()}`
      setLastUserUpdate({ userId, avatarPath: pathWithTime })
      if (user && userId === user.id) updateUser({ avatarPath: pathWithTime })
    })

    connection.on('UserTyping', (conversationId: number, userId: number, userName: string) => {
      setTypingUsers(prev => {
        const existing = prev.filter(t => t.userId !== userId || t.conversationId !== conversationId)
        return [...existing, { conversationId, userId, userName }]
      })
      setTimeout(() => {
        setTypingUsers(prev => prev.filter(t => t.userId !== userId || t.conversationId !== conversationId))
      }, 3000)
    })

    connection.on('MessagePinned', (data: any) => {
      const { messageId, isPinned, pinnedBy, conversationId } = data
      setPinnedMessages({ messageId, isPinned, pinnedBy, conversationId })
    })

    connection.on('MessageDeleted', (conversationId: number, messageId: number) => {
      setLastDeletedMessage({ conversationId, messageId })
    })

    connection.on("UserReadConversation", (conversationId: number, userId: number) => {
      setLastReadUpdate({ conversationId, userId })
    })

    connection.on("ReminderTriggered", (data: { conversationId: number, content: string }) => {
      toast.info(`🔔 NHẮC NHỞ: ${data.content}`, {
        duration: 10000,
      })
    })

    connection.on('ScheduleCreated', (data: any) => {
      toast.info(`📅 Lịch mời mới: ${data.title}`, {
        description: `Bởi: ${data.createdBy} | Bắt đầu: ${new Date(data.startTime).toLocaleString('vi-VN', { hour12: false })}`,
        duration: 8000,
      });
      setLastScheduleUpdate({ type: 'created', data })
    })

    connection.on('ScheduleStatusUpdated', (data: any) => {
      setLastScheduleUpdate({ type: 'status', data })
    })

    connection.on('ScheduleDeleted', (scheduleId: number) => {
      setLastScheduleUpdate({ type: 'deleted', data: scheduleId })
    })

    connection.on('UserLeft', (userId: number) => {
      setLastUserLeft(userId)
      setOnlineUsers(prev => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
    })

    connection.onreconnecting(() => {
      setIsConnected(false)
      setIsReconnecting(true)
    })

    connection.onreconnected(() => {
      setIsConnected(true)
      setIsReconnecting(false)
    })

    connection.start()
      .then(() => setIsConnected(true))
      .catch(err => {
        console.error("SignalR Start Error:", err)
        setTimeout(() => {
          if (!isConnected) {
            connection.start().then(() => setIsConnected(true)).catch(() => { })
          }
        }, 5000)
      })

    connectionRef.current = connection

    return () => {
      connection.stop()
    }

  }, [token, myKeyPair])

  const sendMessage = useCallback(async (conversationId: number, plaintext: string, messageType: string = 'PLAIN', parentMessageId?: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      try {
        let contentToSend = plaintext;
        let ivToSend = "";
        let sigToSend = "";

        if (messageType === 'PLAIN') {
          // Ensure we have a sender key
          if (!mySenderKeyRef.current) {
            mySenderKeyRef.current = await generateSenderKey();
          }

          // Check if we need to handshake first
          if (peerIdentityKeysRef.current.size === 0) {
              toast.error("Vui lòng đợi 1 giây để thiết lập mã hóa...");
              initiateE2EEHandshake(conversationId);
              return;
          }

          // MÃ HÓA & KÝ TÊN
          const encrypted = await encryptMessagePro(plaintext, mySenderKeyRef.current, identityKeys!.privateKey);
          contentToSend = encrypted.content;
          ivToSend = encrypted.iv;
          sigToSend = encrypted.sig;
        }

        await connectionRef.current.invoke('SendMessageSecure', conversationId, contentToSend, ivToSend, sigToSend, messageType, parentMessageId || 0);
      } catch (err) {
        console.error("Failed to send encrypted message:", err);
        toast.error("Lỗi khi mã hóa tin nhắn.");
      }
    }
  }, [identityKeys, initiateE2EEHandshake])

  const markAsRead = useCallback(async (conversationId: number, messageId: number = 0) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      try {
        await connectionRef.current.invoke('MarkAsRead', conversationId, messageId)
      } catch (err) {
        console.warn('SignalR: MarkAsRead failed', err)
      }
    }
  }, [])

  const sendNotification = useCallback(async (message: string) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('SendNotification', message)
    }
  }, [])

  const sendTyping = useCallback(async (conversationId: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('SendTyping', conversationId)
    }
  }, [])

  const sendSticker = useCallback(async (conversationId: number, stickerUrl: string) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('SendSticker', conversationId, stickerUrl)
    }
  }, [])

  const togglePinMessage = useCallback(async (messageId: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('TogglePinMessage', messageId)
    }
  }, [])

  const sendReminder = useCallback(async (conversationId: number, content: string, remindAtIso: string) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('SendReminder', conversationId, content, remindAtIso)
    }
  }, [])

  const hideMessageForMe = useCallback(async (messageId: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      await connectionRef.current.invoke('HideMessageForMe', messageId)
    }
  }, [])

  return (
    <SignalRContext.Provider
      value={{
        isConnected,
        isReconnecting,
        sendMessage,
        sendNotification,
        lastMessage,
        lastReadUpdate,
        notifications,
        onlineUsers,
        incomingCall,
        clearIncomingCall: () => setIncomingCall(null),
        callDeclined,
        clearCallDeclined: () => setCallDeclined(null),
        markAsRead,
        lastGroupUpdate,
        sendTyping,
        typingUsers,
        lastUserUpdate,
        sendSticker,
        togglePinMessage,
        hideMessageForMe,
        sendReminder,
        markAllNotificationsRead: async () => {
          if (!token) return;
          try {
            await announcementsApi.markAllRead(token);
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
          } catch (e) { }
        },
        pinnedMessages,
        lastDeletedMessage,
        lastScheduleUpdate,
        lastUserLeft,
        activeMeeting,
        onTriggeredReminder: (cb: any) => { },
      }}
    >
      {!mounted ? <div style={{ visibility: 'hidden' }}>{children}</div> : children}
    </SignalRContext.Provider>
  )
}

export function useSignalR() {
  const ctx = useContext(SignalRContext)
  if (!ctx) throw new Error('useSignalR must be used within SignalRProvider')
  return ctx
}