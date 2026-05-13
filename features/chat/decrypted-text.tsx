'use client'

import { useState, useEffect } from 'react'
import { decryptMessagePro, saveOrLoadSenderKey, saveOrLoadPeerIdentityKey, saveOrLoadPeerSenderKey, decryptSessionKey, importPublicKey, importIdentityPublicKey, encryptSessionKeyForPeer, loadKey, IDENTITY_KEY_ALIAS } from '@/lib/crypto-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Video as VideoIcon } from 'lucide-react'

import { useSignalR } from '@/hooks/use-signalr'
import { useAuth } from '@/lib/auth-context'

interface DecryptedTextProps {
  message: any
  onJoinMeeting?: (meetingId: string) => void
  isOwn?: boolean
}

export function DecryptedText({ 
    message, 
    onJoinMeeting,
    isOwn
}: DecryptedTextProps) {
    const { user } = useAuth();
    const { 
        mySenderKey, 
        mySenderKeys, 
        peerSenderKeys, 
        peerIdentityKeys, 
        identityKeys, 
        myRSAKeys, 
        initiateE2EEHandshake: initiateHandshake, 
        keyVersion,
        refreshPeerKey
    } = useSignalR();

    const [decrypted, setDecrypted] = useState<string>("⌛ [Đang giải mã...]");
    const [needsRestore, setNeedsRestore] = useState(false);

    useEffect(() => {
        let isMounted = true;

        const decrypt = async () => {
            // 1. Kiểm tra loại tin nhắn - Nếu không phải tin nhắn mã hóa thì bỏ qua
            if (message.messageType && !['PLAIN', 'Text', 'PLAIN_SECURE'].includes(message.messageType) && message.messageType.length < 20) {
                if (isMounted) setDecrypted(message.content || message.encryptedContent || message.message || "");
                return;
            }

            const content = message.encryptedContent || message.message || message.Content || message.EncryptedContent || "";
            let iv = message.iv || message.Iv || message.IV;
            let sig = message.signature || message.sig || message.Signature || message.Sig;
            const metadata = message.metadata || message.Metadata;

            // 2. Logic trích xuất Signature (nếu thiếu ở top-level)
            if (!sig) {
                // Thử trích xuất từ legacy 'iv|sig'
                if (iv && typeof iv === 'string' && iv.includes('|')) {
                    const parts = iv.split('|');
                    iv = parts[0];
                    sig = parts[1];
                } 
                // Thử trích xuất từ metadata JSON (New format)
                else if (metadata) {
                    try {
                        const meta = JSON.parse(metadata);
                        if (meta.sig) sig = meta.sig;
                        else if (meta.signature) sig = meta.signature;
                    } catch { /* ignore parse error */ }
                }
            }

            if (!content || content === "[Attachment]") {
                if (isMounted) setDecrypted("");
                return;
            }

            try {
                const senderIdNum = Number(message.senderId || message.SenderId || message.sender_id);
                const conversationIdNum = Number(message.conversationId || message.ConversationId || message.conversation_id);
                const currentUserId = user?.id ? Number(user.id) : null;
                const isMessageOwn = currentUserId !== null && senderIdNum === currentUserId;

                // [DEBUG] Log decryption context for failed messages
                if (iv && sig) {
                    console.log(`[DecryptedText] Processing message ${message.id}: isOwn=${isMessageOwn}, conv=${conversationIdNum}, sender=${senderIdNum}`);
                }

                if (!conversationIdNum || isNaN(conversationIdNum)) {
                   // Fallback for some message objects that might not have convId directly
                   if (isMounted) setDecrypted(content);
                   return;
                }
                // 3. Tra cứu Key từ Bộ nhớ (Maps)
                let currentSenderKey: CryptoKey | undefined;
                if (isMessageOwn) {
                    currentSenderKey = mySenderKeys?.get(conversationIdNum);
                } else {
                    currentSenderKey = peerSenderKeys?.get(`${conversationIdNum}:${senderIdNum}`);
                }

                let senderIdPubKey: CryptoKey | undefined = isMessageOwn
                    ? identityKeys?.publicKey
                    : peerIdentityKeys?.get(senderIdNum);

                // 4. FALLBACK: Nếu thiếu key trong bộ nhớ, nạp trực tiếp từ IndexedDB
                if (conversationIdNum) {
                    if (isMessageOwn && !currentSenderKey) {
                        const stored = await saveOrLoadSenderKey(conversationIdNum);
                        if (stored) {
                            currentSenderKey = stored;
                            console.log(`[DecryptedText] Recovered own SenderKey from IndexedDB for msg ${message.id}`);
                        }
                    } else if (!isMessageOwn && !currentSenderKey) {
                        const stored = await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum);
                        if (stored) {
                            currentSenderKey = stored;
                            console.log(`[DecryptedText] Recovered peer SenderKey from IndexedDB for msg ${message.id}`);
                        }
                    }
                }

                if (!isMessageOwn && !senderIdPubKey) {
                    const stored = await saveOrLoadPeerIdentityKey(senderIdNum);
                    if (stored) senderIdPubKey = stored;
                } else if (isMessageOwn && !senderIdPubKey) {
                    // [FALLBACK] Own identity key missing from context, load from IndexedDB
                    const stored = await loadKey(IDENTITY_KEY_ALIAS);
                    if (stored) {
                        senderIdPubKey = (stored as any).publicKey;
                        console.log(`[DecryptedText] Recovered own IdentityKey from IndexedDB for msg ${message.id}`);
                    }
                }

                // [PRE-KEY Recovery] 
                if (!currentSenderKey && metadata && myRSAKeys?.privateKey) {
                    try {
                        const meta = JSON.parse(metadata);
                        const myIdStr = user?.id ? String(user.id) : "";
                        const myIdNum = user?.id ? Number(user.id) : 0;
                        
                        const encryptedKeyB64 = meta.keys?.[myIdStr] || (meta.keys ? meta.keys[myIdNum] : null);
                        
                        if (encryptedKeyB64) {
                            console.log(`[DecryptedText] Found encrypted session key in metadata for user ${myIdStr}. Attempting recovery...`);
                            const recovered = await decryptSessionKey(encryptedKeyB64, myRSAKeys.privateKey);
                            if (recovered) {
                                currentSenderKey = recovered;
                                console.log(`[DecryptedText] Successfully recovered session key from metadata for msg ${message.id}`);
                                // Save to IndexedDB for future use
                                if (isMessageOwn) {
                                    await saveOrLoadSenderKey(conversationIdNum, recovered);
                                } else {
                                    await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum, recovered);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn(`[DecryptedText] Metadata recovery failed for msg ${message.id}:`, e);
                    }
                }

                // 5. Tiến hành giải mã
                if (iv && sig && currentSenderKey && senderIdPubKey) {
                    try {
                        const result = await decryptMessagePro(content, iv, sig, currentSenderKey, senderIdPubKey);
                        if (isMounted) {
                            setDecrypted(result);
                            setNeedsRestore(false);
                        }
                    } catch (e: any) {
                        if (!isMounted) return;
                        console.error(`[DecryptedText] Decryption failed for msg ${message.id}:`, e);
                        const errorCode = e?.code || e?.name;
                        if (errorCode === 'SIG_INVALID' || errorCode === 'OperationError') {
                            setDecrypted('🔑 [Đang khôi phục/Đồng bộ khóa bảo mật...]');
                            if (refreshPeerKey) refreshPeerKey(senderIdNum, conversationIdNum).catch(() => {});
                        } else {
                            setDecrypted('❌ [Lỗi giải mã E2EE]');
                        }
                        setNeedsRestore(false);
                    }
                } else {
                    if (isMounted) {
                        if (!iv || !sig) {
                            setDecrypted(content);
                        } else {
                            setDecrypted('⏳ [Đang chờ khóa mã hóa...]');
                            console.warn(`[DecryptedText] Missing keys for msg ${message.id}: senderKey=${!!currentSenderKey}, idKey=${!!senderIdPubKey}`);
                            // Tự động handshake nếu thiếu Identity Key HOẶC Sender Key
                            if (!isMessageOwn && (!senderIdPubKey || !currentSenderKey) && initiateHandshake && conversationIdNum) {
                                initiateHandshake(conversationIdNum).catch(() => {});
                            }
                        }
                        setNeedsRestore(false);
                    }
                }
            } catch (e) { 
                if (isMounted) {
                    console.error("Critical decryption error:", e);
                    setDecrypted("[Lỗi hệ thống E2EE]"); 
                }
            }
        };

        decrypt();

        return () => {
            isMounted = false;
        };
    }, [keyVersion, message.id, user?.id]);

    // Removed inline restore prompt to avoid duplication with E2EEGatekeeper
    // and to fulfill user request of entering PIN only once.

    if (decrypted.includes('[MEETING_GUID:')) {
        return (
            <div className={cn(
                "rounded-xl p-4 border flex flex-col gap-3 min-w-60",
                isOwn ? "bg-white/20 border-white/30 backdrop-blur-md" : "bg-primary/10 border-primary/20"
            )}>
               <div className="flex items-center gap-3">
                  <div className={cn(
                      "h-10 w-10 rounded-full flex items-center justify-center",
                      isOwn ? "bg-white/20" : "bg-primary/20"
                  )}>
                    <VideoIcon className={cn("h-5 w-5", isOwn ? "text-white" : "text-primary")} />
                  </div>
                  <div>
                     <p className={cn("font-black text-xs uppercase tracking-widest leading-none mb-1", isOwn ? "text-white" : "text-primary")}>Cuộc họp video</p>
                     <p className={cn("text-[11px] font-bold truncate opacity-70", isOwn ? "text-white" : "text-foreground")}>{decrypted.split('\n')[0].replace('📹 ', '')}</p>
                  </div>
               </div>
               {onJoinMeeting && (
                 <Button 
                  size="sm" 
                  variant={isOwn ? "secondary" : "default"}
                  className={cn(
                      "w-full rounded-lg h-8 font-black uppercase text-[10px] tracking-widest shadow-sm",
                      isOwn && "bg-white text-primary hover:bg-white/90 border-none"
                  )} 
                  onClick={() => {
                     const match = decrypted.match(/\[MEETING_GUID:([^\]]+)\]/);
                     if (match) onJoinMeeting(match[1]);
                 }}>Tham gia ngay</Button>
               )}
            </div>
        );
    }
    return <p className="font-medium leading-relaxed">{decrypted}</p>;
}

