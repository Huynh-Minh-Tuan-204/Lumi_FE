'use client'

import { useState, useEffect } from 'react'
import { decryptMessagePro, saveOrLoadSenderKey, saveOrLoadPeerIdentityKey, saveOrLoadPeerSenderKey } from '@/lib/crypto-utils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Video as VideoIcon } from 'lucide-react'
import { E2EERestorePrompt } from '@/features/shared/e2ee-restore-prompt'

interface DecryptedTextProps {
  message: any
  user: any
  mySenderKey: any
  mySenderKeys: Map<number, any>
  peerSenderKeys: Map<string, any>
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
    mySenderKeys,
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
                const senderIdNum = Number(message.senderId);
                const conversationIdNum = Number(message.conversationId);
                const isMessageOwn = user && senderIdNum === Number(user.id);

                // For own messages: look up per-conversation key from the map (most accurate)
                let currentSenderKey: CryptoKey | undefined;
                if (isMessageOwn) {
                    currentSenderKey = mySenderKeys?.get(conversationIdNum);
                } else {
                    currentSenderKey = peerSenderKeys?.get(`${conversationIdNum}:${senderIdNum}`);
                }
                let senderIdPubKey: CryptoKey | undefined = isMessageOwn
                    ? identityKeys?.publicKey
                    : peerIdentityKeys?.get(senderIdNum);

                // IndexedDB fallback — covers cases where in-memory map was populated after this component mounted
                if (conversationIdNum) {
                    if (isMessageOwn && !currentSenderKey) {
                        const stored = await saveOrLoadSenderKey(conversationIdNum);
                        if (stored) currentSenderKey = stored;
                    } else if (!isMessageOwn && !currentSenderKey) {
                        const stored = await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum);
                        if (stored) currentSenderKey = stored;
                    }
                }

                // Own identity key for signature verification
                if (isMessageOwn && !senderIdPubKey && identityKeys?.publicKey) {
                    senderIdPubKey = identityKeys.publicKey;
                }

                // Peer identity key from IndexedDB
                if (!isMessageOwn && !senderIdPubKey) {
                    const stored = await saveOrLoadPeerIdentityKey(senderIdNum);
                    if (stored) senderIdPubKey = stored;
                }

                if (iv && sig && currentSenderKey && senderIdPubKey) {
                    try {
                        const result = await decryptMessagePro(content, iv, sig, currentSenderKey, senderIdPubKey);
                        setDecrypted(result);
                        setNeedsRestore(false);
                    } catch (e) {
                        console.warn('Lỗi giải mã (thường do khóa cũ):', e);
                        const errorCode = (e as any)?.code || (e as any)?.name;
                        if (errorCode === 'SIG_INVALID') {
                            setDecrypted('⚠️ [Không xác thực được chữ ký – Có thể sai khóa nhận dạng]');
                        } else if (errorCode === 'OperationError') {
                            setDecrypted('🔑 [Tin nhắn được bảo mật từ phiên làm việc trước]');
                        } else {
                            setDecrypted('❌ [Lỗi giải mã không xác định]');
                        }
                        setNeedsRestore(false);
                    }
                } else if (!iv || !sig) {
                    if (content && content.length > 20 && !content.includes(' ')) {
                        setDecrypted('⚠️ [Lỗi giải mã: Dữ liệu mã hóa bị hỏng hoặc mất chữ ký]');
                    } else {
                        setDecrypted(content);
                    }
                    setNeedsRestore(false);
                } else {
                    // Keys missing
                    console.warn(`[E2EE Info] Waiting for keys to decrypt MsgId=${message.id}. isOwn=${isMessageOwn}, hasSenderKey=${!!currentSenderKey}, hasPubKey=${!!senderIdPubKey}`);
                    setDecrypted('⏳ [Đang chờ khóa mã hóa...]');
                    setNeedsRestore(!isMessageOwn); // Only show restore prompt for peer messages
                    
                    // [AUTO-HANDSHAKE] Tự động yêu cầu khóa nếu chưa có public key và không phải tin nhắn của mình
                    if (!isMessageOwn && !senderIdPubKey && initiateHandshake && conversationIdNum) {
                        initiateHandshake(conversationIdNum).catch(() => {});
                    }
                }
            } catch (e) { 
                console.error("Critical decryption error:", e);
                setDecrypted("[Lỗi hệ thống E2EE]"); 
            }
        };
        decrypt();
    }, [message.id, message.encryptedContent, message.message, keyVersion, mySenderKey, mySenderKeys, peerSenderKeys]);

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

