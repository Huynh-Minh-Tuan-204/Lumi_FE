'use client'

import { useState, useEffect } from 'react'
import { decryptMessagePro, saveOrLoadSenderKey, saveOrLoadPeerIdentityKey, saveOrLoadPeerSenderKey, loadAllMySenderKeys } from '@/lib/crypto-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Video as VideoIcon } from 'lucide-react'
import { E2EERestorePrompt } from '@/features/shared/e2ee-restore-prompt'

interface DecryptedTextProps {
  message: any
  user: any
  mySenderKey: any
  peerSenderKeys: Map<number, any>
  peerIdentityKeys: Map<number, any>
  identityKeys: any
  initiateHandshake: (cid: number) => Promise<void>
  onJoinMeeting?: (meetingId: string) => void
  isOwn?: boolean
  keyVersion?: number
}

export function DecryptedText({ 
    message, 
    user, 
    mySenderKey, 
    peerSenderKeys, 
    peerIdentityKeys, 
    identityKeys,
    initiateHandshake,
    onJoinMeeting,
    isOwn,
    keyVersion
}: DecryptedTextProps) {
    const [decrypted, setDecrypted] = useState<string>("⌛ [Đang giải mã...]");
    const [needsRestore, setNeedsRestore] = useState(false);

    useEffect(() => {
        const decrypt = async () => {
            // Relaxed type check: if messageType is corrupted (e.g. contains the signature base64), it will be long.
            if (message.messageType && !['PLAIN', 'Text', 'PLAIN_SECURE'].includes(message.messageType) && message.messageType.length < 20) {
                setDecrypted(message.content || message.encryptedContent || message.message || "");
                return;
            }
            const senderId = message.senderId;
            const content = message.encryptedContent || message.message || message.Content;
            let iv = message.iv || message.Iv || message.IV;
            let sig = message.signature || message.sig || message.Signature || message.Sig;


            // [FIX] Handle legacy format where sig is appended to iv with |
            if (iv && typeof iv === 'string' && iv.includes('|') && !sig) {
                const parts = iv.split('|');
                iv = parts[0];
                sig = parts[1];
            }

            if (!content || content === "[Attachment]") {
                setDecrypted("");
                return;
            }
            try {
                const isMessageOwn = user && senderId === user.id;
                let currentSenderKey = isMessageOwn ? mySenderKey : peerSenderKeys?.get(senderId);
                let senderIdPubKey = isMessageOwn ? identityKeys?.publicKey : peerIdentityKeys?.get(senderId);
                
                if (message.conversationId) {
                    if (isMessageOwn) {
                        // Try exact match first
                        const stored = await saveOrLoadSenderKey(message.conversationId);
                        if (stored) {
                            currentSenderKey = stored;
                        } else {
                            // [FALLBACK] Key not found by conversationId.
                            // Scan ALL MySenderKeys in DB — in single-device scenario there's only 1.
                            const allKeys = await loadAllMySenderKeys();
                            if (allKeys.size > 0) {
                                // Try matching by conversationId first, then fall back to first found
                                currentSenderKey = allKeys.get(Number(message.conversationId)) 
                                    || allKeys.values().next().value;
                                if (currentSenderKey) {
                                    console.log(`[E2EE] Fallback key used for MsgId=${message.id} (convId=${message.conversationId}). Total keys: ${allKeys.size}`);
                                }
                            }
                        }
                    } else if (!currentSenderKey) {
                        const stored = await saveOrLoadPeerSenderKey(message.conversationId, senderId);
                        if (stored) currentSenderKey = stored;
                    }
                }

                if (!isMessageOwn && !senderIdPubKey) {
                    const stored = await saveOrLoadPeerIdentityKey(senderId);
                    if (stored) senderIdPubKey = stored;
                }

                if (isMessageOwn && !senderIdPubKey && identityKeys?.publicKey) {
                    senderIdPubKey = identityKeys.publicKey;
                }

                if (!currentSenderKey || !senderIdPubKey) {
                    console.warn(`[E2EE Info] Waiting for keys to decrypt MsgId=${message.id}. isOwn=${isMessageOwn}, hasSenderKey=${!!currentSenderKey}, hasPubKey=${!!senderIdPubKey}`);
                }

                if (iv && sig && currentSenderKey && senderIdPubKey) {
                    try {
                        const result = await decryptMessagePro(content, iv, sig, currentSenderKey, senderIdPubKey);
                        setDecrypted(result);
                        setNeedsRestore(false);
                    } catch (e) {
                        console.error("Decryption failed (likely wrong key):", e);
                        setDecrypted("❌ [Lỗi giải mã - Có thể do sai mã PIN hoặc khóa cũ]");
                    }
                } else if (!iv || !sig) {
                    // Nếu thiếu metadata nhưng nội dung là Base64 dài (do lỗi cũ), báo lỗi rõ ràng.
                    if (content && content.length > 20 && !content.includes(' ')) {
                        setDecrypted("⚠️ [Lỗi giải mã: Dữ liệu mã hóa bị hỏng hoặc mất chữ ký]");
                    } else {
                        setDecrypted(content);
                    }
                    setNeedsRestore(false);
                } else {
                    // Missing keys – show restore prompt
                    setDecrypted("⏳ [Đang chờ khóa mã hóa...]");
                    setNeedsRestore(true);
                    if (message.conversationId) initiateHandshake(message.conversationId);
                }
            } catch (e) { 
                console.error("Critical decryption error:", e);
                setDecrypted("[Lỗi hệ thống E2EE]"); 
            }
        };
        decrypt();
    }, [message.id, message.encryptedContent, message.message, mySenderKey, keyVersion]);

    // Show inline restore prompt when keys are missing
    if (needsRestore && !isOwn) {
        return (
            <E2EERestorePrompt
                conversationId={message.conversationId}
                onDismiss={() => setNeedsRestore(false)}
            />
        );
    }

    if (decrypted.includes('[MEETING_GUID:')) {
        return (
            <div className={cn(
                "rounded-xl p-4 border flex flex-col gap-3 min-w-[240px]",
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

