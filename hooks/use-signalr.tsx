'use client'

import { useEffect, useRef, useCallback, useState, createContext, useContext } from 'react'
import * as signalR from '@microsoft/signalr'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { announcementsApi, usersApi, conversationsApi } from '@/lib/api'
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
  const isStartingRef = useRef(false);
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
  const [lastAddedConversationId, setLastAddedConversationId] = useState<number | null>(null);
  const [identityKeys, setIdentityKeys] = useState<CryptoKeyPair | null>(null);
  const [myRSAKeys, setMyRSAKeys] = useState<CryptoKeyPair | null>(null);
  const identityKeysRef = useRef<CryptoKeyPair | null>(null);
  const myRSAKeysRef = useRef<CryptoKeyPair | null>(null);
  
  const peerIdentityKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const peerSenderKeysRef = useRef<Map<string, CryptoKey>>(new Map());
  const mySenderKeysRef = useRef<Map<number, CryptoKey>>(new Map());
  const [mySenderKey, setMySenderKey] = useState<CryptoKey | null>(null); 
  const [isKeysLoaded, setIsKeysLoaded] = useState(false);
  
  // Sync user object into a ref to avoid stale closures in SignalR listeners 
  // without re-creating the entire connection every time user profile updates.
  const userRef = useRef(user)
  useEffect(() => { userRef.current = user }, [user])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const loadAllKeysSequentially = async () => {
        try {
          // 1. Load own identity + RSA keys
          const idKeys = await loadKey(IDENTITY_KEY_ALIAS);
          if (idKeys) {
            setIdentityKeys(idKeys);
            identityKeysRef.current = idKeys;
          }

          const rsaKeys = await loadKey('EphemeralRSAKey');
          if (rsaKeys) {
            setMyRSAKeys(rsaKeys);
            myRSAKeysRef.current = rsaKeys;
          }

          // 2. Preload Sender Keys
          const mySenderKeys = await loadAllMySenderKeys();
          if (mySenderKeys.size > 0) {
            mySenderKeys.forEach((key, convId) => mySenderKeysRef.current.set(Number(convId), key));
            console.log(`[E2EE] Preloaded ${mySenderKeys.size} SenderKey(s).`);
          }

          // 3. Preload Peer Identity Keys
          const peerIdKeys = await loadAllPeerIdentityKeys();
          if (peerIdKeys.size > 0) {
            peerIdKeys.forEach((key, userId) => peerIdentityKeysRef.current.set(Number(userId), key));
            console.log(`[E2EE] Preloaded ${peerIdKeys.size} PeerIdentityKey(s).`);
          }

          // 4. Preload Peer Sender Keys
          const peerSenderKeyMap = await loadAllPeerSenderKeys();
          if (peerSenderKeyMap.size > 0) {
            peerSenderKeyMap.forEach((convMap, userId) => {
              convMap.forEach((key, convId) => {
                 peerSenderKeysRef.current.set(`${Number(convId)}:${Number(userId)}`, key);
              });
            });
            console.log(`[E2EE] Preloaded ${peerSenderKeyMap.size} users' peer sender keys.`);
          }

          setIsKeysLoaded(true);
          setKeyVersion(v => v + 1); // First update
          requestAnimationFrame(() => {
              setKeyVersion(v => v + 1); // Force second update to flush React state
          });

          // 5. [PRE-KEY] Tự động đẩy Public Keys lên Server nếu chưa có
          if (token && idKeys && rsaKeys) {
            const idPubKeyB64 = await exportIdentityPublicKey(idKeys.publicKey);
            const rsaPubKeyB64 = await exportPublicKey(rsaKeys.publicKey);
            
            // Chỉ đẩy lên nếu thực sự có thay đổi hoặc định kỳ (ở đây ta cứ đẩy 1 lần khi load app)
            usersApi.updatePublicKey(token, { 
                publicKey: idPubKeyB64, 
                rsaPublicKey: rsaPubKeyB64 
            }).catch(e => console.warn("[E2EE] Failed to update public keys on server:", e));
          }
        } catch (e) {
          console.warn("[E2EE] Key preloading failed:", e);
          // Still set loaded to true to allow connection if some keys failed
          setIsKeysLoaded(true);
        }
      };

      loadAllKeysSequentially();
    }
  }, []);

  // [LOGOUT CLEANUP] Force SignalR to stop immediately when token is cleared
  useEffect(() => {
    if (!token && connectionRef.current) {
        console.log("[SignalR] Logout detected, killing connection...");
        const conn = connectionRef.current;
        const handlers = [
            'ReceiveSecureIdentity', 'ReceiveSecureSenderKey', 'ReceiveMessage',
            'UserLeftConversation', 'InitialOnlineUsers', 'ReceiveNotification',
            'receiveSecurityAlert', 'receiveGeneralAnnouncement', 'UserStatusChanged',
            'IncomingCall', 'CallDeclined', 'MeetingStarted', 'GlobalMeetingStarted',
            'MeetingEnded', 'ReceiveGroupUpdate', 'AddedToConversation', 'UserUpdated', 'UserTyping',
            'MessagePinned', 'MessageDeleted', 'UserReadConversation',
            'ReminderTriggered', 'ScheduleCreated', 'ScheduleStatusUpdated',
            'ScheduleDeleted', 'UserLeft'
        ];
        handlers.forEach(h => conn.off(h));
        conn.stop().catch(() => {});
        connectionRef.current = null;
        isStartingRef.current = false;
        
        // Reset ALL global states
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
        setIdentityKeys(null);
        setMyRSAKeys(null);
        setIsKeysLoaded(false);
        setMySenderKey(null);

        // Reset ALL refs
        identityKeysRef.current = null;
        myRSAKeysRef.current = null;
        peerIdentityKeysRef.current.clear();
        peerSenderKeysRef.current.clear();
        mySenderKeysRef.current.clear();
        notifiedMeetingsRef.current.clear();
    }
  }, [token]);

  const initiateE2EEHandshake = useCallback(async (conversationId: number) => {
    if (isConnected && identityKeysRef.current && myRSAKeysRef.current && connectionRef.current) {
      const idPubKeyB64 = await exportIdentityPublicKey(identityKeysRef.current.publicKey);
      const rsaPubKeyB64 = await exportPublicKey(myRSAKeysRef.current.publicKey);
      
      const signature = await signData(rsaPubKeyB64, identityKeysRef.current.privateKey);
      
      await connectionRef.current.invoke("SendSecureIdentity", conversationId, idPubKeyB64, rsaPubKeyB64, signature);
    }
  }, [isConnected]);


  useEffect(() => {
    // Wait for everything to be ready before connecting
    if (!token || !identityKeys || !myRSAKeys || !isKeysLoaded) {
      return
    }

    if (connectionRef.current) {
        const state = connectionRef.current.state;
        if (state === signalR.HubConnectionState.Connected || 
            state === signalR.HubConnectionState.Connecting || 
            state === signalR.HubConnectionState.Reconnecting) {
            return;
        }
    }
    
    if (isStartingRef.current) return;
    isStartingRef.current = true;

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

    // Delay fetching history (Announcements) to 5s to ensure <3s Finish time
    const historyTimer = setTimeout(() => {
        fetchHistory();
    }, 5000);

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, {
        accessTokenFactory: () => token,
        headers: { "ngrok-skip-browser-warning": "true" }
      })
      .withAutomaticReconnect()
      .configureLogging(signalR.LogLevel.None)
      .build()

    connection.on("ReceiveSecureIdentity", async (senderId: any, idPubKeyBase64: string, rsaPubKeyBase64: string, signature: string, conversationId: any, isDirectReply: boolean = false) => {
      const senderIdNum = Number(senderId);
      const conversationIdNum = Number(conversationId);
      
      if (userRef.current && senderIdNum === userRef.current?.id) return;
      try {
        const peerIdPubKey = await importIdentityPublicKey(idPubKeyBase64);
        const isVerified = await verifySignature(rsaPubKeyBase64, signature, peerIdPubKey);
        if (!isVerified) return;

        // 1. Lưu lại Public Key của người vừa chào sân (A)
        peerIdentityKeysRef.current.set(senderIdNum, peerIdPubKey);
        await saveOrLoadPeerIdentityKey(senderIdNum, peerIdPubKey);
        setKeyVersion(v => v + 1);

        // Đảm bảo mình đã có SenderKey của mình cho conversation này
        let myKey = mySenderKeysRef.current.get(conversationIdNum);
        if (!myKey) {
          const stored = await saveOrLoadSenderKey(conversationIdNum);
          if (stored) {
            myKey = stored;
          } else {
            myKey = await generateSenderKey();
            await saveOrLoadSenderKey(conversationIdNum, myKey);
          }
          mySenderKeysRef.current.set(conversationIdNum, myKey);
          setMySenderKey(myKey);
          setKeyVersion(v => v + 1);
        }

        // 2. Bọc SenderKey CỦA MÌNH bằng RSA của A, và gửi đích danh cho A
        const peerRSAPubKey = await importPublicKey(rsaPubKeyBase64);
        const encryptedKey = await encryptSessionKeyForPeer(myKey, peerRSAPubKey);
        
        await connection.invoke("SendSecureSenderKey", conversationIdNum, senderIdNum, encryptedKey);

        // 3. ĐÁP LỄ: Nếu A chào sân chung, mình gửi ngược Public Key RSA của mình ĐÍCH DANH cho A
        if (!isDirectReply && identityKeysRef.current && myRSAKeysRef.current) {
            const myIdPubKeyB64 = await exportIdentityPublicKey(identityKeysRef.current.publicKey);
            const myRsaPubKeyB64 = await exportPublicKey(myRSAKeysRef.current.publicKey);
            const mySignature = await signData(myRsaPubKeyB64, identityKeysRef.current.privateKey);
            
            await connection.invoke("SendSecureIdentityToUser", conversationIdNum, senderIdNum, myIdPubKeyB64, myRsaPubKeyB64, mySignature);
        }
      } catch (e) {
        console.error("Multi-threaded key distribution error", e);
      }
    });

    connection.on("ReceiveSecureSenderKey", async (senderId: any, encryptedKeyBase64: string, conversationId: any) => {
       const senderIdNum = Number(senderId);
       const conversationIdNum = Number(conversationId);
       
       if (!myRSAKeysRef.current) return;
       try {
           const senderKey = await decryptSessionKey(encryptedKeyBase64, myRSAKeysRef.current.privateKey);
           peerSenderKeysRef.current.set(`${conversationIdNum}:${senderIdNum}`, senderKey);
           await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum, senderKey);
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
      if (messageType === 'PLAIN' || !messageType || messageType === 'Text' || messageType === 'PLAIN_SECURE') {
        
        // [PRE-KEY] Kiểm tra xem trong metadata có chìa khóa cho mình không
        if (data.metadata) {
            try {
                const meta = JSON.parse(data.metadata);
                const myId = userRef.current?.id;
                if (myId && meta.keys && meta.keys[myId] && myRSAKeysRef.current) {
                    const encryptedKeyForMe = meta.keys[myId];
                    const senderIdNum = Number(senderId);
                    const conversationIdNum = Number(conversationId);
                    
                    // Nếu chưa có khóa của người này cho hội thoại này, hãy giải mã và lưu lại
                    if (!peerSenderKeysRef.current.has(`${conversationIdNum}:${senderIdNum}`)) {
                        const decryptedKey = await decryptSessionKey(encryptedKeyForMe, myRSAKeysRef.current.privateKey);
                        peerSenderKeysRef.current.set(`${conversationIdNum}:${senderIdNum}`, decryptedKey);
                        await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum, decryptedKey);
                        setKeyVersion(v => v + 1);
                        console.log(`[E2EE] Recovered SenderKey from metadata for MsgId=${id}`);
                    }
                }
            } catch (e) { console.warn("[E2EE] Failed to parse metadata keys:", e); }
        }

        // [FORCE E2EE] Tin nhắn văn bản từ user bắt buộc phải có IV/SIG.
        // Các tin nhắn không có metadata sẽ bị coi là bị hạ cấp (Downgrade Attack) hoặc không an toàn.
        if (!iv || !sig) {
             displayContent = "🚨 [Tin nhắn bị hạ cấp (Plain) - Từ chối hiển thị]"; 
        } 
        else {
            const senderIdNum = Number(senderId);
            const conversationIdNum = Number(conversationId);
            
            let senderSessionKey = (userRef.current && senderIdNum === userRef.current?.id) 
                ? mySenderKeysRef.current.get(conversationIdNum) 
                : peerSenderKeysRef.current.get(`${conversationIdNum}:${senderIdNum}`);
            
            // [FIX Task 1] Nếu là tin nhắn của mình gửi từ máy khác/phiên khác nhưng mình đã có key trong IndexedDB
            if (!senderSessionKey && userRef.current && senderIdNum === userRef.current?.id && conversationIdNum) {
                const stored = await saveOrLoadSenderKey(conversationIdNum);
                if (stored) {
                    mySenderKeysRef.current.set(conversationIdNum, stored);
                    setMySenderKey(stored);
                    setKeyVersion(v => v + 1);
                    senderSessionKey = stored;
                }
            }

            const senderIdKey = (userRef.current && senderIdNum === userRef.current?.id) 
                ? identityKeysRef.current?.publicKey 
                : peerIdentityKeysRef.current.get(senderIdNum);

            if (senderSessionKey && iv && sig && senderIdKey) {
               try {
                  displayContent = await decryptMessagePro(content, iv, sig, senderSessionKey, senderIdKey);
               } catch (e) { displayContent = "🚨 [Lỗi giải mã E2EE]"; }
            } else {
               displayContent = "⏳ [Đang đợi bắt tay hoặc khôi phục khóa...]";
               // Tự động yêu cầu khóa nếu chưa có public key của người gửi
               if (!senderIdKey && conversationIdNum) {
                  initiateE2EEHandshake(conversationIdNum).catch(() => {});
               }
            }
        }
      }

      setLastMessage({
        id, conversationId, senderId, sender: senderName, message: displayContent,
        iv, messageType, stickerUrl, isPinned, time: new Date(createdAt),
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

    connection.on('AddedToConversation', (conversationId: number) => {
        connection.invoke('JoinGroup', conversationId).catch(() => {});
        setLastAddedConversationId(conversationId);
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
      .then(() => {
          setIsConnected(true);
          isStartingRef.current = false;
      })
      .catch(err => {
        console.error("SignalR Start Error:", err)
        isStartingRef.current = false;
        setTimeout(() => {
          if (!isConnected && !isStartingRef.current) {
            isStartingRef.current = true;
            connection.start()
                .then(() => {
                    setIsConnected(true);
                    isStartingRef.current = false;
                })
                .catch(() => { isStartingRef.current = false; })
          }
        }, 5000)
      })

    connectionRef.current = connection

    return () => {
      clearTimeout(historyTimer);
      // [Full Cleanup] Explicitly remove all handlers to prevent duplicates on remount
      const handlers = [
        'ReceiveSecureIdentity', 'ReceiveSecureSenderKey', 'ReceiveMessage',
        'UserLeftConversation', 'InitialOnlineUsers', 'ReceiveNotification',
        'receiveSecurityAlert', 'receiveGeneralAnnouncement', 'UserStatusChanged',
        'IncomingCall', 'CallDeclined', 'MeetingStarted', 'GlobalMeetingStarted',
        'MeetingEnded', 'ReceiveGroupUpdate', 'AddedToConversation', 'UserUpdated', 'UserTyping',
        'MessagePinned', 'MessageDeleted', 'UserReadConversation',
        'ReminderTriggered', 'ScheduleCreated', 'ScheduleStatusUpdated',
        'ScheduleDeleted', 'UserLeft'
      ]
      if (connection) {
          handlers.forEach(h => connection.off(h));
          connection.stop();
      }
    }

  }, [token, identityKeys, myRSAKeys, isKeysLoaded, initiateE2EEHandshake])

  const refreshPeerKey = useCallback(async (senderId: number, conversationId: number) => {
    if (!token || !conversationId) return;
    
    console.log(`[E2EE] Refreshing keys for Peer ${senderId} in Conv ${conversationId}...`);
    try {
        const members = await conversationsApi.getMembers(token, conversationId);
        const member = members.find(m => Number(m.UserId || m.userId) === senderId);
        
        if (member && member.PublicKey) {
            let idPubKeyB64 = "";
            let rsaPubKeyB64 = "";
            
            if (member.PublicKey.startsWith('{')) {
                const json = JSON.parse(member.PublicKey);
                idPubKeyB64 = json.idPubKey;
                rsaPubKeyB64 = json.rsaPubKey;
            } else {
                idPubKeyB64 = member.PublicKey;
            }

            if (idPubKeyB64) {
                const peerIdPubKey = await importIdentityPublicKey(idPubKeyB64);
                peerIdentityKeysRef.current.set(senderId, peerIdPubKey);
                await saveOrLoadPeerIdentityKey(senderId, peerIdPubKey);
                
                // Clear sender key to force re-handshake or re-recovery
                peerSenderKeysRef.current.delete(`${conversationId}:${senderId}`);
                
                setKeyVersion(v => v + 1);
                console.log(`[E2EE] Successfully refreshed IdentityKey for Peer ${senderId}.`);
            }
        }
    } catch (e) {
        console.error(`[E2EE] Failed to refresh key for Peer ${senderId}:`, e);
    }
  }, [token]);

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
    if (peerIdentityKeysRef.current.size === 0) {
      initiateE2EEHandshake(conversationId).catch(console.warn);
    }

    const effectiveMessageType = (!messageType || messageType === '') ? 'PLAIN' : messageType;

    try {
      let contentToSend = plaintext, ivToSend = '', sigToSend = '';
      let metadataToSend: string | null = null;

      if (effectiveMessageType === 'PLAIN' || effectiveMessageType === 'Text' || effectiveMessageType === 'PLAIN_SECURE') {
        const encrypted = await encryptMessagePro(plaintext, currentKey!, identityKeysRef.current.privateKey);
        contentToSend = encrypted.content;
        ivToSend = encrypted.iv;
        sigToSend = encrypted.sig;

        // [PRE-KEY] Offline Handshake: Bọc khóa phiên cho các thành viên chưa có bắt tay
        try {
            const members = await conversationsApi.getMembers(token!, conversationId);
            const offlineKeys: Record<number, string> = {};
            
            for (const member of members) {
                const mid = Number(member.UserId || member.userId);
                if (mid === userRef.current?.id) continue;
                
                // Nếu chưa có khóa bắt tay với người này trong hội thoại này
                if (!peerSenderKeysRef.current.has(`${conversationId}:${mid}`)) {
                    let rsaPubKeyB64 = "";
                    
                    if (member.PublicKey && member.PublicKey.startsWith('{')) {
                        const json = JSON.parse(member.PublicKey);
                        rsaPubKeyB64 = json.rsaPubKey;
                    }

                    if (rsaPubKeyB64) {
                        const peerRSAPubKey = await importPublicKey(rsaPubKeyB64);
                        const encryptedKey = await encryptSessionKeyForPeer(currentKey!, peerRSAPubKey);
                        offlineKeys[mid] = encryptedKey;
                    }
                }
            }

            if (Object.keys(offlineKeys).length > 0) {
                metadataToSend = JSON.stringify({ keys: offlineKeys });
                console.log(`[E2EE] Included ${Object.keys(offlineKeys).length} offline keys in metadata.`);
            }
        } catch (e) { console.warn("[E2EE] Offline handshake failed:", e); }
      }

      const clientMessageId = crypto.randomUUID();
      await connectionRef.current?.invoke(
          'SendMessageSecure',
          conversationId,
          contentToSend,
          ivToSend,      
          sigToSend,     
          effectiveMessageType === 'PLAIN' || effectiveMessageType === 'Text' ? 'PLAIN_SECURE' : effectiveMessageType,
          parentMessageId || 0,
          clientMessageId,
          metadataToSend
      );
    } catch (err) {
      console.error('Failed to send encrypted message:', err);
      toast.error('Lỗi khi gửi tin nhắn. Vui lòng thử lại.');
    }
  }, [token, initiateE2EEHandshake])


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
        lastAddedConversationId,
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
        myRSAKeys: myRSAKeysRef.current,
        keyVersion,
        lastLeftConversationId,
        refreshPeerKey
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
