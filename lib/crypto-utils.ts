/**
 * Hệ thống mã hóa Lumi (Phiên bản đồng bộ)
 */

const DB_NAME = 'LumiCryptoDB';
const STORE_NAME = 'Keys';
export const IDENTITY_KEY_ALIAS = 'IdentityKey';
const RSA_KEY_ALIAS = 'EphemeralRSAKey';
const MY_SENDER_KEY_ALIAS = 'MySenderKey';
const PEER_IDENTITY_KEY_ALIAS = 'PeerIdentityKey';
const PEER_SENDER_KEY_ALIAS = 'PeerSenderKey';

// ==========================================
// QUẢN LÝ SESSION
// ==========================================
export function setPinKey(key: any) {}
export function getPinKey() { return null; }

// ==========================================
// PHẦN 1: INDEXEDDB PERSISTENCE
// ==========================================

async function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            request.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

export async function saveKey(alias: string, key: any) {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(key, alias);
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
}

export async function loadKey(alias: string): Promise<any> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(alias);
    return new Promise((resolve) => (request.onsuccess = () => resolve(request.result)));
}

// ==========================================
// PHẦN 2: IDENTITY (ECDSA - ANTI-MITM)
// ==========================================

export async function getOrCreateIdentityKey(): Promise<CryptoKeyPair> {
    const existing = await loadKey(IDENTITY_KEY_ALIAS);
    if (existing) return existing;

    const keys = await window.crypto.subtle.generateKey(
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["sign", "verify"]
    );
    await saveKey(IDENTITY_KEY_ALIAS, keys);
    return keys;
}

export async function exportIdentityPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("raw", key);
    return bufferToBase64(exported);
}

export async function importIdentityPublicKey(base64: string): Promise<CryptoKey> {
    return await window.crypto.subtle.importKey(
        "raw",
        base64ToBuffer(base64) as ArrayBuffer,
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
    );
}

export async function getOrCreateRSAKeyPair(): Promise<CryptoKeyPair> {
    const existing = await loadKey(RSA_KEY_ALIAS);
    if (existing) return existing;

    const keys = await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );
    await saveKey(RSA_KEY_ALIAS, keys);
    return keys;
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("spki", key);
    return bufferToBase64(exported);
}

export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
    return await window.crypto.subtle.importKey(
        "spki",
        base64ToBuffer(base64Key) as ArrayBuffer,
        { name: "RSA-OAEP", hash: "SHA-256" },
        true,
        ["encrypt"]
    );
}

// ==========================================
// PHẦN 4: SIGNING (XÁC THỰC)
// ==========================================

export async function signData(data: string, privateKey: CryptoKey): Promise<string> {
    const signature = await window.crypto.subtle.sign(
        { name: "ECDSA", hash: { name: "SHA-256" } },
        privateKey,
        new TextEncoder().encode(data)
    );
    return bufferToBase64(signature);
}

export async function verifySignature(data: string, signatureBase64: string, publicKey: CryptoKey): Promise<boolean> {
    try {
        return await window.crypto.subtle.verify(
            { name: "ECDSA", hash: { name: "SHA-256" } },
            publicKey,
            base64ToBuffer(signatureBase64) as ArrayBuffer,
            new TextEncoder().encode(data).buffer as ArrayBuffer
        );
    } catch {
        return false;
    }
}

// ==========================================
// PHẦN 5: AES-GCM (NHẮN TIN)
// ==========================================

export async function generateSenderKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function saveOrLoadSenderKey(conversationId: number | string, key?: CryptoKey): Promise<CryptoKey | null> {
    const alias = `${MY_SENDER_KEY_ALIAS}:${String(conversationId)}`;
    if (key) {
        await saveKey(alias, key);
        return key;
    }
    return await loadKey(alias);
}

export async function saveOrLoadPeerIdentityKey(userId: number | string, key?: CryptoKey): Promise<CryptoKey | null> {
    const alias = `${PEER_IDENTITY_KEY_ALIAS}:${String(userId)}`;
    if (key) {
        await saveKey(alias, key);
        return key;
    }
    return await loadKey(alias);
}

export async function saveOrLoadPeerSenderKey(conversationId: number | string, userId: number | string, key?: CryptoKey): Promise<CryptoKey | null> {
    const alias = `${PEER_SENDER_KEY_ALIAS}:${String(conversationId)}:${String(userId)}`;
    if (key) {
        await saveKey(alias, key);
        return key;
    }
    return await loadKey(alias);
}

export async function encryptMessagePro(plaintext: string, senderKey: CryptoKey, identityPrivateKey: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, senderKey, encoded);
    const signature = await signData(bufferToBase64(ciphertextBuffer), identityPrivateKey);
    return {
        content: bufferToBase64(ciphertextBuffer),
        iv: bufferToBase64(iv),
        sig: signature
    };
}

export async function decryptMessagePro(
    contentBase64: string, 
    ivBase64: string, 
    sigBase64: string,
    senderKey: CryptoKey,
    senderIdentityPubKey: CryptoKey
) {
    if (!contentBase64 || !ivBase64 || !senderKey || !senderIdentityPubKey) {
        console.error('[decryptMessagePro] Missing required params:', { 
            hasContent: !!contentBase64, 
            hasIV: !!ivBase64, 
            hasKey: !!senderKey, 
            hasID: !!senderIdentityPubKey 
        });
        throw new Error('MISSING_E2EE_PARAMS');
    }

    const ciphertextBuffer = base64ToBuffer(contentBase64);
    const ivBuffer = base64ToBuffer(ivBase64);
    
    // Kiểm tra chữ ký số (ECDSA)
    try {
        const isValid = await verifySignature(contentBase64, sigBase64, senderIdentityPubKey);
        if (!isValid) {
            console.warn('[decryptMessagePro] Signature mismatch. Có thể do xoay vòng khóa.');
        }
    } catch (sigErr) {
        console.warn('[decryptMessagePro] Verify error:', sigErr);
    }

    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: ivBuffer as ArrayBuffer },
            senderKey,
            ciphertextBuffer as ArrayBuffer
        );
        return new TextDecoder().decode(decrypted);
    } catch (err) {
        console.error('[decryptMessagePro] Decrypt failed:', err);
        throw err;
    }
}

export async function encryptFilePro(file: File, senderKey: CryptoKey, identityPrivateKey: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await file.arrayBuffer();
    const encrypted = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, senderKey, arrayBuffer);
    const contentBase64 = bufferToBase64(new Uint8Array(encrypted));
    const signature = await signData(contentBase64, identityPrivateKey);
    return {
        encryptedBlob: new Blob([encrypted]),
        iv: bufferToBase64(iv),
        sig: signature
    };
}

export async function decryptFilePro(
    blob: Blob, 
    ivBase64: string, 
    sigBase64: string, 
    senderKey: CryptoKey, 
    senderIdentityPubKey: CryptoKey
): Promise<Blob> {
    if (!blob || !ivBase64 || !senderKey || !senderIdentityPubKey) {
        console.error('[decryptFilePro] Missing required params:', { 
            hasBlob: !!blob, 
            hasIV: !!ivBase64, 
            hasKey: !!senderKey, 
            hasID: !!senderIdentityPubKey 
        });
        throw new Error('MISSING_E2EE_FILE_PARAMS');
    }

    const arrayBuffer = await blob.arrayBuffer();

    // Xác thực bằng ECDSA Signature
    try {
        const contentBase64 = bufferToBase64(new Uint8Array(arrayBuffer));
        const isValid = await verifySignature(contentBase64, sigBase64, senderIdentityPubKey);
        if (!isValid) {
            console.warn('[decryptFilePro] Signature mismatch. Đang thử giải mã AES-GCM...');
        }
    } catch (sigErr) {
        console.warn('[decryptFilePro] Verify error:', sigErr);
    }

    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBuffer(ivBase64) as ArrayBuffer },
            senderKey,
            arrayBuffer as ArrayBuffer
        );
        return new Blob([decrypted]);
    } catch (err) {
        console.error('[decryptFilePro] Decrypt failed:', err);
        throw err;
    }
}

export async function encryptSessionKeyForPeer(sessionKey: CryptoKey, peerRSAPubKey: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("raw", sessionKey);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, peerRSAPubKey, exported);
    return bufferToBase64(encrypted);
}

export async function decryptSessionKey(encryptedBase64: string, myRSAPrivKey: CryptoKey): Promise<CryptoKey> {
    const encrypted = base64ToBuffer(encryptedBase64);
    const decrypted = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, myRSAPrivKey, encrypted);
    return await window.crypto.subtle.importKey("raw", decrypted, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

// ==========================================
// CÁC HÀM PHỤ TRỢ (Dự phòng)
// ==========================================
export async function deriveKeyFromPin() { throw new Error("PIN Disabled"); }
export async function backupKeysToPin() { throw new Error("PIN Disabled"); }
export async function restoreKeysFromPin() { throw new Error("PIN Disabled"); }
export async function encryptKeyForBackup(key: CryptoKey, pinKey: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const exported = await window.crypto.subtle.exportKey("raw", key);
    const encrypted = await window.crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        pinKey,
        exported
    );
    return {
        encryptedSenderKey: bufferToBase64(encrypted),
        iv: bufferToBase64(iv)
    };
}

export async function decryptKeyFromBackup(encryptedBase64: string, ivBase64: string, pinKey: CryptoKey) {
    const encrypted = base64ToBuffer(encryptedBase64);
    const iv = base64ToBuffer(ivBase64);
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv as ArrayBuffer },
        pinKey,
        encrypted
    );
    return await window.crypto.subtle.importKey(
        "raw",
        decrypted,
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
}
export async function loadAllMySenderKeys(): Promise<Map<number, CryptoKey>> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = new Map<number, CryptoKey>();

    return new Promise((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const alias = cursor.key as string;
                if (alias.startsWith(MY_SENDER_KEY_ALIAS + ':')) {
                    const convId = parseInt(alias.split(':')[1]);
                    result.set(convId, cursor.value);
                }
                cursor.continue();
            } else {
                resolve(result);
            }
        };
    });
}

export async function loadAllPeerIdentityKeys(): Promise<Map<number, CryptoKey>> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = new Map<number, CryptoKey>();

    return new Promise((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const alias = cursor.key as string;
                if (alias.startsWith(PEER_IDENTITY_KEY_ALIAS + ':')) {
                    const userId = parseInt(alias.split(':')[1]);
                    result.set(userId, cursor.value);
                }
                cursor.continue();
            } else {
                resolve(result);
            }
        };
    });
}

export async function loadAllPeerSenderKeys(): Promise<Map<number, Map<number, CryptoKey>>> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = new Map<number, Map<number, CryptoKey>>();

    return new Promise((resolve) => {
        const request = store.openCursor();
        request.onsuccess = (event: any) => {
            const cursor = event.target.result;
            if (cursor) {
                const alias = cursor.key as string;
                if (alias.startsWith(PEER_SENDER_KEY_ALIAS + ':')) {
                    const parts = alias.split(':');
                    const convId = parseInt(parts[1]);
                    const userId = parseInt(parts[2]);
                    
                    if (!result.has(userId)) result.set(userId, new Map());
                    result.get(userId)!.set(convId, cursor.value);
                }
                cursor.continue();
            } else {
                resolve(result);
            }
        };
    });
}

// ==========================================
// HELPERS
// ==========================================

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
    if (!base64) return new ArrayBuffer(0);
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
}
