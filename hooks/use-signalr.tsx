'use client'

import { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { announcementsApi } from '@/lib/api'
import { ChatMessage, SignalRHookReturn } from '@/types/chat.types'
import { HUB_URL } from '@/constants/api.constants'
import { 
  loadKey, IDENTITY_KEY_ALIAS, exportIdentityPublicKey, importIdentityPublicKey,
  exportPublicKey, importPublicKey,
  generateSenderKey, saveOrLoadSenderKey, saveOrLoadPeerIdentityKey, saveOrLoadPeerSenderKey,
  encryptSessionKeyForPeer, decryptSessionKey,
  encryptMessagePro, decryptMessagePro, signData, verifySignature,
  base64ToBuffer, bufferToBase64,
  loadAllMySenderKeys, loadAllPeerIdentityKeys, loadAllPeerSenderKeys
} from '@/lib/crypto-utils'

const SignalRContext = createContext<SignalRHookReturn | null>(null)

export function SignalRProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { token, user, updateUser } = useAuth()

  const connectionRef = useRef<signalR.HubConnection | null>(null)
  const notifiedMeetingsRef = useRef<Set<string>>(new Set());

  const [keyVersion, setKeyVersion] = useState(0)
  const [isConnected, setIsConnected] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [lastMessage, setLastMessage] = useState<ChatMessage | null>(null)
  const [lastLeftConversationId, setLastLeftConversationId] = useState<number | null>(null);
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
  const [identityKeys, setIdentityKeys] = useState<CryptoKeyPair | null>(null);
  const [myRSAKeys, setMyRSAKeys] = useState<CryptoKeyPair | null>(null);
  const identityKeysRef = useRef<CryptoKeyPair | null>(null);
  const myRSAKeysRef = useRef<CryptoKeyPair | null>(null);
  
  const peerIdentityKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const peerSenderKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const mySenderKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const [mySenderKey, setMySenderKey] = useState<CryptoKey | null>(null); // Still keep for backward compatibility or active conversation
  
  // Sync user object into a ref to avoid stale closures in SignalR listeners 
  // without re-creating the entire connection every time user profile updates.
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Load own identity + RSA keys
      loadKey(IDENTITY_KEY_ALIAS).then(keys => {
        if (keys) {
          setIdentityKeys(keys);
          identityKeysRef.current = keys;
          setKeyVersion(v => v + 1);
        }
      });
      loadKey('EphemeralRSAKey').then(keys => {
          if (keys) {
            setMyRSAKeys(keys);
            myRSAKeysRef.current = keys;
            setKeyVersion(v => v + 1);
          }
      });

      // [PRELOAD] Eagerly load all E2EE keys from IndexedDB into RAM maps.
      // This ensures keys are available for decryption immediately after F5.
      const preloadAllKeys = async () => {
        // 1. Own sender keys (per-conversation)
        const mySenderKeys = await loadAllMySenderKeys();
        if (mySenderKeys.size > 0) {
          mySenderKeys.forEach((key, convId) => mySenderKeysRef.current.set(convId, key));
          const firstKey = mySenderKeys.values().next().value;
          if (firstKey) setMySenderKey(firstKey);
          console.log(`[E2EE] Preloaded ${mySenderKeys.size} SenderKey(s) from IndexedDB.`);
        }

        // 2. Peer identity keys (public, for signature verification)
        const peerIdKeys = await loadAllPeerIdentityKeys();
        if (peerIdKeys.size > 0) {
          peerIdKeys.forEach((key, userId) => peerIdentityKeysRef.current.set(userId, key));
          console.log(`[E2EE] Preloaded ${peerIdKeys.size} PeerIdentityKey(s) from IndexedDB.`);
        }

        // 3. Peer sender keys (AES, for decrypting peer messages)
        const peerSenderKeyMap = await loadAllPeerSenderKeys();
        if (peerSenderKeyMap.size > 0) {
          peerSenderKeyMap.forEach((convMap, userId) => {
            // Use the most recent key for each user (last entry in map)
            const lastKey = [...convMap.values()].pop();
            if (lastKey) peerSenderKeysRef.current.set(userId, lastKey);
          });
          console.log(`[E2EE] Preloaded peer sender keys for ${peerSenderKeyMap.size} user(s) from IndexedDB.`);
        }

        if (mySenderKeys.size > 0 || peerIdKeys.size > 0 || peerSenderKeyMap.size > 0) {
          setKeyVersion(v => v + 1);
        }
      };
      preloadAllKeys().catch(console.warn);
    }
  }, []);

  const initiateE2EEHandshake = useCallback(async (conversationId: number) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected && identityKeysRef.current && myRSAKeysRef.current) {
      const idPubKeyB64 = await exportIdentityPublicKey(identityKeysRef.current.publicKey);
      const rsaPubKeyB64 = await exportPublicKey(myRSAKeysRef.current.publicKey);
      
      const signature = await signData(rsaPubKeyB64, identityKeysRef.current.privateKey);
      
      await connectionRef.current.invoke("SendSecureIdentity", conversationId, idPubKeyB64, rsaPubKeyB64, signature);
    }
  }, []);


  useEffect(() => {
    // Wait for everything to be ready before connecting
    if (!token || !identityKeys || !myRSAKeys) {
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
      }
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

    connection.on("ReceiveSecureIdentity", async (senderId: number, idPubKeyBase64: string, rsaPubKeyBase64: string, signature: string, conversationId: number, isDirectReply: boolean = false) => {
      if (userRef.current && senderId === userRef.current.id) return;
      try {
        const peerIdPubKey = await importIdentityPublicKey(idPubKeyBase64);
        const isVerified = await verifySignature(rsaPubKeyBase64, signature, peerIdPubKey);
        if (!isVerified) return;

        // 1. Lưu lại Public Key của người vừa chào sân (A)
        peerIdentityKeysRef.current.set(senderId, peerIdPubKey);
        await saveOrLoadPeerIdentityKey(senderId, peerIdPubKey);
        setKeyVersion(v => v + 1);

        // Đảm bảo mình đã có SenderKey của mình cho conversation này
        let myKey = mySenderKeysRef.current.get(conversationId);
        if (!myKey) {
          const stored = await saveOrLoadSenderKey(conversationId);
          if (stored) {
            myKey = stored;
          } else {
            myKey = await generateSenderKey();
            await saveOrLoadSenderKey(conversationId, myKey);
          }
          mySenderKeysRef.current.set(conversationId, myKey);
          setMySenderKey(myKey);
          setKeyVersion(v => v + 1);
        }

        // 2. Bọc SenderKey CỦA MÌNH bằng RSA của A, và gửi đích danh cho A
        const peerRSAPubKey = await importPublicKey(rsaPubKeyBase64);
        const encryptedKey = await encryptSessionKeyForPeer(myKey, peerRSAPubKey);
        
        await connection.invoke("SendSecureSenderKey", conversationId, senderId, encryptedKey);

        // 3. ĐÁP LỄ: Nếu A chào sân chung, mình gửi ngược Public Key RSA của mình ĐÍCH DANH cho A
        if (!isDirectReply && identityKeysRef.current && myRSAKeysRef.current) {
            const myIdPubKeyB64 = await exportIdentityPublicKey(identityKeysRef.current.publicKey);
            const myRsaPubKeyB64 = await exportPublicKey(myRSAKeysRef.current.publicKey);
            const mySignature = await signData(myRsaPubKeyB64, identityKeysRef.current.privateKey);
            
            await connection.invoke("SendSecureIdentityToUser", conversationId, senderId, myIdPubKeyB64, myRsaPubKeyB64, mySignature);
        }
      } catch (e) {
        console.error("Multi-threaded key distribution error", e);
      }
    });

    connection.on("ReceiveSecureSenderKey", async (senderId: number, encryptedKeyBase64: string, conversationId: number) => {
       if (!myRSAKeysRef.current) return;
       try {
           const senderKey = await decryptSessionKey(encryptedKeyBase64, myRSAKeysRef.current.privateKey);
           peerSenderKeysRef.current.set(senderId, senderKey);
           await saveOrLoadPeerSenderKey(conversationId, senderId, senderKey);
           setKeyVersion(v => v + 1);
       } catch (e) {
          console.error("Handshake Decrypt Key error", e);
       }
    });

    connection.on('ReceiveMessage', async (data: any) => {
      let { id, conversationId, senderId, senderName, content, iv, sig, messageType, stickerUrl, isPinned, createdAt, attachments, avatarPath, parentMessageId } = data;
      
      // Map PascalCase from backend if camelCase is missing
      if (!iv) iv = data.Iv;
      if (!sig) sig = data.sig || data.Signature || data.Sig;

      // 1. Xử lý tách chuỗi gộp (nếu IV chứa cả Sig từ DB)
      if (iv && typeof iv === 'string' && iv.includes('|') && !sig) {
          const parts = iv.split('|');
          iv = parts[0];
          sig = parts[1];
      }

      let displayContent = content; // Mặc định là content gốc
      
      // 2. Logic giải mã thông minh
      if (messageType === 'PLAIN' || !messageType || messageType === 'Text') {
        // [FORCE E2EE] Tin nhắn văn bản từ user bắt buộc phải có IV/SIG.
        // Các tin nhắn không có metadata sẽ bị coi là bị hạ cấp (Downgrade Attack) hoặc không an toàn.
        if (!iv || !sig) {
             displayContent = "🚨 [Tin nhắn bị hạ cấp (Plain) - Từ chối hiển thị]"; 
        } 
        else {
            let senderSessionKey = (userRef.current && senderId === userRef.current.id) 
                ? mySenderKeysRef.current.get(conversationId) 
                : peerSenderKeysRef.current.get(senderId);
            
            // [FIX Task 1] Nếu là tin nhắn của mình gửi từ máy khác/phiên khác nhưng mình đã có key trong IndexedDB
            if (!senderSessionKey && userRef.current && senderId === userRef.current.id && conversationId) {
                const stored = await saveOrLoadSenderKey(conversationId);
                if (stored) {
                    mySenderKeysRef.current.set(conversationId, stored);
                    setMySenderKey(stored);
                    senderSessionKey = stored;
                }
            }

            const senderIdKey = (userRef.current && senderId === userRef.current.id) 
                ? identityKeysRef.current?.publicKey 
                : peerIdentityKeysRef.current.get(senderId);

            if (senderSessionKey && iv && sig && senderIdKey) {
               try {
                  displayContent = await decryptMessagePro(content, iv, sig, senderSessionKey, senderIdKey);
               } catch (e) { displayContent = "🚨 [Lỗi giải mã E2EE]"; }
            } else {
               displayContent = "⏳ [Đang đợi bắt tay hoặc khôi phục khóa...]";
            }
        }
      }

      setLastMessage({
        id, conversationId, senderId, sender: senderName, message: displayContent, content: content,
        iv, sig, messageType, stickerUrl, isPinned, time: new Date(createdAt),
        attachments: attachments || [], isSystem: false, avatarPath, parentMessageId
      });
    });

    connection.on('UserLeftConversation', (conversationId: number) => {
      setLastLeftConversationId(conversationId);
    });

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
      if (userRef.current && callerId === userRef.current.id) return;
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

      if (userRef.current && hostId !== userRef.current.id) {
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

      if (userRef.current && (hostId === userRef.current.id || hostName === userRef.current.fullName)) return;

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
      if (userRef.current && userId === userRef.current.id) updateUser({ avatarPath: pathWithTime })
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
      // [Fix 4.2] Explicitly remove all handlers to prevent duplicates on remount
      const handlers = [
        'ReceiveSecureIdentity', 'ReceiveSecureSenderKey', 'ReceiveMessage',
        'UserLeftConversation', 'InitialOnlineUsers', 'ReceiveNotification',
        'receiveSecurityAlert', 'receiveGeneralAnnouncement', 'UserStatusChanged',
        'IncomingCall', 'CallDeclined', 'MeetingStarted', 'GlobalMeetingStarted',
        'MeetingEnded', 'ReceiveGroupUpdate', 'UserUpdated', 'UserTyping',
        'MessagePinned', 'MessageDeleted', 'UserReadConversation',
        'ReminderTriggered', 'ScheduleCreated', 'ScheduleStatusUpdated',
        'ScheduleDeleted', 'UserLeft'
      ]
      handlers.forEach(h => connection.off(h))
      connection.stop()
    }

  }, [token, identityKeys, myRSAKeys])

  const sendMessage = useCallback(async (conversationId: number, plaintext: string, messageType: string = 'PLAIN', parentMessageId?: number) => {
    if (connectionRef.current?.state !== signalR.HubConnectionState.Connected) {
      toast.error('Mất kết nối. Đang kết nối lại...')
      return
    }

    // 1. Đảm bảo có sender key của mình cho conversation này
    let currentKey = mySenderKeysRef.current.get(conversationId);
    if (!currentKey) {
      console.log(`[E2EE] Đang nạp/tạo Sender Key cho conversation ${conversationId}...`);
      const stored = await saveOrLoadSenderKey(conversationId);
      if (stored) {
        currentKey = stored;
      } else {
        currentKey = await generateSenderKey();
        await saveOrLoadSenderKey(conversationId, currentKey);
      }
      mySenderKeysRef.current.set(conversationId, currentKey);
      setMySenderKey(currentKey);
      setKeyVersion(v => v + 1);
    }

    if (!identityKeysRef.current || !currentKey) {
      toast.error('Hệ thống mã hóa chưa sẵn sàng. Vui lòng thử lại.');
      return;
    }

    // [Fix 2.2] Nếu chưa có peer key, trigger handshake BẤT ĐỒNG BỘ - KHÔNG block gửi tin
    // Peer sẽ nhận được SenderKey sau khi handshake hoàn tất và có thể giải mã tin nhắn
    if (peerIdentityKeysRef.current.size === 0) {
      initiateE2EEHandshake(conversationId).catch(console.warn);
    }

    const effectiveMessageType = (!messageType || messageType === '') ? 'PLAIN' : messageType;

    try {
      let contentToSend = plaintext, ivToSend = '', sigToSend = '';

      if (effectiveMessageType === 'PLAIN' || effectiveMessageType === 'Text' || effectiveMessageType === 'PLAIN_SECURE') {
        const encrypted = await encryptMessagePro(plaintext, currentKey!, identityKeysRef.current.privateKey);
        contentToSend = encrypted.content;
        ivToSend = encrypted.iv;
        sigToSend = encrypted.sig;
      }

      const clientMessageId = crypto.randomUUID();
      await connectionRef.current.invoke(
        'SendMessageSecure',
        conversationId,
        contentToSend,
        ivToSend && sigToSend ? `${ivToSend}|${sigToSend}` : ivToSend,
        "", // Empty string to satisfy the 7-argument signature without losing data
        effectiveMessageType === 'PLAIN' || effectiveMessageType === 'Text' ? 'PLAIN_SECURE' : effectiveMessageType,
        parentMessageId || 0,
        clientMessageId
      );
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
      toast.error('Lỗi khi gửi tin nhắn. Vui lòng thử lại.');
    }
  }, [initiateE2EEHandshake])


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
        initiateE2EEHandshake,
        onTriggeredReminder: (cb: any) => { },
        mySenderKey,
        mySenderKeys: mySenderKeysRef.current,
        peerSenderKeys: peerSenderKeysRef.current,
        peerIdentityKeys: peerIdentityKeysRef.current,
        identityKeys: identityKeysRef.current,
        keyVersion,
        lastLeftConversationId
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
