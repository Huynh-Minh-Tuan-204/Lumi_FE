'use client'

import { useState, useEffect } from 'react'
import { 
    decryptMessagePro, 
    saveOrLoadSenderKey, 
    saveOrLoadPeerIdentityKey, 
    saveOrLoadPeerSenderKey, 
    decryptSessionKey 
} from '@/lib/crypto-utils'
import { useSignalR } from '@/hooks/use-signalr'
import { useAuth } from '@/lib/auth-context'

interface DecryptedSidebarTextProps {
  message: any
}

export function DecryptedSidebarText({ message }: DecryptedSidebarTextProps) {
    const { user } = useAuth();
    const { 
        mySenderKeys, 
        peerSenderKeys, 
        peerIdentityKeys, 
        identityKeys, 
        myRSAKeys,
        keyVersion
    } = useSignalR();

    const [decrypted, setDecrypted] = useState<string>("⏳ ...");

    useEffect(() => {
        let isMounted = true;

        const decrypt = async () => {
            if (!message) return;
            
            // Nếu không phải tin nhắn mã hóa
            const isEncrypted = message.messageType === 'PLAIN_SECURE' || 
                                (message.encryptedContent && message.encryptedContent.length > 50);
            
            if (!isEncrypted) {
                if (isMounted) setDecrypted(message.content || message.encryptedContent || message.message || "");
                return;
            }

            const content = message.encryptedContent || message.message || message.content || message.Content || message.EncryptedContent;
            let iv = message.iv || message.Iv || message.IV;
            let sig = message.signature || message.sig || message.Signature || message.Sig;
            const metadata = message.metadata || message.Metadata;

            if (!sig && iv && typeof iv === 'string' && iv.includes('|')) {
                const parts = iv.split('|');
                iv = parts[0];
                sig = parts[1];
            } else if (!sig && metadata) {
                try {
                    const meta = JSON.parse(metadata);
                    sig = meta.sig || meta.signature;
                } catch {}
            }

            if (!content || content === "[Attachment]") {
                if (isMounted) setDecrypted("📎 Gửi một tệp đính kèm");
                return;
            }

            try {
                const senderIdNum = Number(message.senderId || message.SenderId);
                const conversationIdNum = Number(message.conversationId || message.ConversationId);
                const currentUserId = user?.id ? Number(user.id) : null;
                const isMessageOwn = currentUserId !== null && senderIdNum === currentUserId;

                let currentSenderKey = isMessageOwn
                    ? mySenderKeys?.get(conversationIdNum)
                    : peerSenderKeys?.get(`${conversationIdNum}:${senderIdNum}`);

                let senderIdPubKey = isMessageOwn
                    ? identityKeys?.publicKey
                    : peerIdentityKeys?.get(senderIdNum);

                // Fallback nạp từ DB
                if (!currentSenderKey && conversationIdNum) {
                    if (isMessageOwn) {
                        const stored = await saveOrLoadSenderKey(conversationIdNum);
                        if (stored) currentSenderKey = stored;
                    } else {
                        const stored = await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum);
                        if (stored) currentSenderKey = stored;
                    }
                }

                if (!senderIdPubKey && !isMessageOwn) {
                    const stored = await saveOrLoadPeerIdentityKey(senderIdNum);
                    if (stored) senderIdPubKey = stored;
                }

                // [PRE-KEY Recovery]
                if (!currentSenderKey && metadata && myRSAKeys?.privateKey) {
                    try {
                        const meta = JSON.parse(metadata);
                        const myId = user?.id;
                        if (myId && meta.keys && meta.keys[myId]) {
                            const decryptedKey = await decryptSessionKey(meta.keys[myId], myRSAKeys.privateKey);
                            currentSenderKey = decryptedKey;
                            peerSenderKeys?.set(`${conversationIdNum}:${senderIdNum}`, decryptedKey);
                            await saveOrLoadPeerSenderKey(conversationIdNum, senderIdNum, decryptedKey);
                        }
                    } catch {}
                }

                if (iv && sig && currentSenderKey && senderIdPubKey) {
                    try {
                        const result = await decryptMessagePro(content, iv, sig, currentSenderKey, senderIdPubKey);
                        if (isMounted) setDecrypted(result);
                    } catch {
                        if (isMounted) setDecrypted("🔒 Tin nhắn mã hóa");
                    }
                } else {
                    if (isMounted) setDecrypted("⏳ ...");
                }
            } catch {
                if (isMounted) setDecrypted("🔒 ...");
            }
        };

        decrypt();
        return () => { isMounted = false; };
    }, [keyVersion, message?.id, message?.Id, user?.id]);

    // Format preview text (remove meeting codes, etc)
    const display = decrypted.includes('[MEETING_GUID:') 
        ? "📹 Cuộc họp video" 
        : decrypted;

    return <span className="truncate">{display}</span>;
}
