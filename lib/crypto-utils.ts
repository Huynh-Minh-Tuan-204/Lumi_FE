/**
 * Lumi Pro Crypto - Production-grade E2EE with Hybrid Encryption & Persistence
 * Features:
 * - Anti-MITM: ECDSA Identity Keys for signing/verifying public key exchanges
 * - Persistence: Private keys stored in IndexedDB (survives reload)
 * - Message Integrity: Every message signed by Identity Key
 * - Group Ready: Sender Key mechanism for efficient group encryption
 */

const DB_NAME = 'LumiCryptoDB';
const STORE_NAME = 'Keys';
export const IDENTITY_KEY_ALIAS = 'IdentityKey';
const RSA_KEY_ALIAS = 'EphemeralRSAKey';
const MY_SENDER_KEY_ALIAS = 'MySenderKey';
const PEER_IDENTITY_KEY_ALIAS = 'PeerIdentityKey';
const PEER_SENDER_KEY_ALIAS = 'PeerSenderKey';

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

// Sinh cặp khóa định danh dài hạn (Lưu IndexedDB)
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

export async function clearRSAKeyPair(): Promise<void> {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(RSA_KEY_ALIAS);
    return new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
    });
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

/**
 * Quét toàn bộ IndexedDB và trả về Map<conversationId, CryptoKey> cho tất cả MySenderKey
 * Dùng khi khởi động để nạp lại tất cả key vào RAM mà không cần biết trước conversationId
 */
export async function loadAllMySenderKeys(): Promise<Map<string, CryptoKey>> {
    const result = new Map<string, CryptoKey>();
    const db = await getDB();
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            const alias = cursor.key as string;
            if (alias.startsWith(MY_SENDER_KEY_ALIAS + ':')) {
                const convIdStr = alias.substring((MY_SENDER_KEY_ALIAS + ':').length);
                if (convIdStr) {
                    result.set(convIdStr, cursor.value as CryptoKey);
                }
            }
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return result;
}

/**
 * Quét toàn bộ IndexedDB và trả về Map<senderId, CryptoKey> cho tất cả PeerSenderKey trong một conversation
 */
export async function loadAllPeerSenderKeysForConversation(conversationId: number | string): Promise<Map<string, CryptoKey>> {
    const result = new Map<string, CryptoKey>();
    const prefix = `${PEER_SENDER_KEY_ALIAS}:${String(conversationId)}:`;
    const db = await getDB();
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            const alias = cursor.key as string;
            if (alias.startsWith(prefix)) {
                const userIdStr = alias.substring(prefix.length);
                if (userIdStr) {
                    result.set(userIdStr, cursor.value as CryptoKey);
                }
            }
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return result;
}

/**
 * Quét toàn bộ IndexedDB và trả về Map<userId, CryptoKey> cho tất cả PeerIdentityKey
 */
export async function loadAllPeerIdentityKeys(): Promise<Map<string, CryptoKey>> {
    const result = new Map<string, CryptoKey>();
    const prefix = PEER_IDENTITY_KEY_ALIAS + ':';
    const db = await getDB();
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            const alias = cursor.key as string;
            if (alias.startsWith(prefix)) {
                const userIdStr = alias.substring(prefix.length);
                if (userIdStr) {
                    result.set(userIdStr, cursor.value as CryptoKey);
                }
            }
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return result;
}

/**
 * Quét toàn bộ IndexedDB: trả về Map<senderId, Map<conversationId, CryptoKey>> cho tất cả PeerSenderKey
 */
export async function loadAllPeerSenderKeys(): Promise<Map<string, Map<string, CryptoKey>>> {
    const result = new Map<string, Map<string, CryptoKey>>();
    const prefix = PEER_SENDER_KEY_ALIAS + ':';
    const db = await getDB();
    await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            const alias = cursor.key as string;
            if (alias.startsWith(prefix)) {
                const rest = alias.substring(prefix.length);
                const parts = rest.split(':');
                if (parts.length === 2) {
                    const convIdStr = parts[0];
                    const userIdStr = parts[1];
                    if (convIdStr && userIdStr) {
                        if (!result.has(userIdStr)) result.set(userIdStr, new Map());
                        result.get(userIdStr)!.set(convIdStr, cursor.value as CryptoKey);
                    }
                }
            }
            cursor.continue();
        };
        req.onerror = () => resolve();
    });
    return result;
}

export async function encryptSessionKeyForPeer(sessionKey: CryptoKey, peerPublicKey: CryptoKey): Promise<string> {
    const raw = await window.crypto.subtle.exportKey("raw", sessionKey);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, peerPublicKey, raw);
    return bufferToBase64(encrypted);
}

export async function decryptSessionKey(encryptedBase64: string, myPrivateKey: CryptoKey): Promise<CryptoKey> {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        base64ToBuffer(encryptedBase64) as ArrayBuffer
    );
    return await window.crypto.subtle.importKey("raw", decrypted as ArrayBuffer, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptMessagePro(plaintext: string, senderKey: CryptoKey, identityPrivateKey: CryptoKey) {
    // 12-byte random IV for AES-GCM (Authenticated Encryption)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    // GCM automatically appends the 16-byte authentication tag at the end of ciphertext
    const ciphertextBuffer = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, senderKey, encoded);

    // Sign the ciphertext for non-repudiation and extra authenticity layer
    const signature = await signData(bufferToBase64(ciphertextBuffer), identityPrivateKey);

    return {
        content: bufferToBase64(ciphertextBuffer), // Includes auth tag
        iv: bufferToBase64(iv),
        sig: signature
    };
}

export async function encryptFilePro(file: File, senderKey: CryptoKey, identityPrivateKey: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const arrayBuffer = await file.arrayBuffer();
    
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, senderKey, arrayBuffer);
    
    // Sign the ciphertext
    const signature = await signData(bufferToBase64(ciphertext), identityPrivateKey);

    return {
        encryptedBlob: new Blob([ciphertext], { type: 'application/octet-stream' }),
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
): Promise<string> {
    // 1. Verify ECDSA signature layer first (integrity + authenticity)
    const isValid = await verifySignature(contentBase64, sigBase64, senderIdentityPubKey);
    if (!isValid) {
        // Signature failed — either wrong identity key or tampered message
        // Throw so caller can distinguish this from AES key failure
        throw Object.assign(new Error('SIG_INVALID'), { code: 'SIG_INVALID' });
    }

    const ciphertextBuffer = base64ToBuffer(contentBase64);
    const ivBuffer = base64ToBuffer(ivBase64);

    if (ivBuffer.byteLength !== 12) {
        throw new Error('IV_INVALID');
    }

    // 2. AES-GCM Authenticated Decryption — throws OperationError if key is wrong
    const decrypted = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer as ArrayBuffer },
        senderKey,
        ciphertextBuffer as ArrayBuffer
    );

    return new TextDecoder().decode(decrypted);
}

export async function decryptFilePro(
    blob: Blob,
    ivBase64: string,
    sigBase64: string,
    senderKey: CryptoKey,
    senderIdentityPubKey: CryptoKey
): Promise<Blob> {
    const arrayBuffer = await blob.arrayBuffer();
    const contentBase64 = bufferToBase64(new Uint8Array(arrayBuffer));

    // Verify Signature
    const isValid = await verifySignature(contentBase64, sigBase64, senderIdentityPubKey);
    if (!isValid) throw new Error("Chữ ký tệp không hợp lệ!");

    // Decrypt
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "AES-GCM", iv: base64ToBuffer(ivBase64) as ArrayBuffer },
        senderKey,
        arrayBuffer as ArrayBuffer
    );

    return new Blob([decrypted]);
}

// ==========================================
// HELPERS
// ==========================================

export function bufferToBase64(buffer: ArrayBuffer | Uint8Array): string {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

export function base64ToBuffer(base64: string): ArrayBuffer {
    if (!base64 || typeof base64 !== 'string') return new ArrayBuffer(0);
    try {
        const cleanBase64 = base64.trim().replace(/\s/g, '');
        // Fix: Ensure padding is handled correctly if needed, though atob usually handles it.
        // For robustness, we can add padding if missing:
        let paddedBase64 = cleanBase64;
        while (paddedBase64.length % 4 !== 0) {
            paddedBase64 += '=';
        }
        const binary = atob(paddedBase64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    } catch (e) {
        console.error("Base64 decoding failed", e);
        return new ArrayBuffer(0);
    }
}

// ==========================================
// PHẦN 6: E2EE PIN BACKUP (ZERO-KNOWLEDGE)
// ==========================================

/**
 * Derive một CryptoKey AES-GCM-256 từ mã PIN bằng PBKDF2.
 * 100,000 iterations + SHA-256 để chống brute-force.
 */
export async function deriveKeyFromPin(pin: string, salt: Uint8Array): Promise<CryptoKey> {
    const pinBuffer = new TextEncoder().encode(pin);

    // Import PIN thô thành base key material
    const baseKey = await window.crypto.subtle.importKey(
        'raw',
        pinBuffer.buffer as ArrayBuffer,
        { name: 'PBKDF2' },
        false,
        ['deriveKey']
    );
    return window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: 100_000,
            hash: 'SHA-256',
        },
        baseKey,
        { name: 'AES-GCM', length: 256 },
        false, // Không cho export key này
        ['encrypt', 'decrypt']
    );
}

/**
 * Gói toàn bộ key bundle (IdentityKey + RSAKeyPair + tất cả SenderKeys từ IndexedDB)
 * thành JSON, rồi mã hóa bằng AES-GCM với khóa derive từ PIN.
 * 
 * @returns { payload: string, salt: string, iv: string } – tất cả đều là Base64
 */
export async function backupKeysToPin(pin: string): Promise<{
    payload: string;
    salt: string;
    iv: string;
}> {
    // 1. Export IdentityKey (ECDSA key pair)
    const identityKeys = await getOrCreateIdentityKey();

    const identityPrivJwk = await window.crypto.subtle.exportKey('jwk', identityKeys.privateKey);
    const identityPubJwk = await window.crypto.subtle.exportKey('jwk', identityKeys.publicKey);

    // 2. Export RSA Key Pair (Ephemeral RSA for sender key exchange)
    const rsaKeys = await getOrCreateRSAKeyPair();
    
    const rsaPrivJwk = await window.crypto.subtle.exportKey('jwk', rsaKeys.privateKey);
    const rsaPubJwk = await window.crypto.subtle.exportKey('jwk', rsaKeys.publicKey);

    // 3. Đọc tất cả SenderKeys từ IndexedDB
    const db = await getDB();
    const keysToExport: { alias: string, key: CryptoKey }[] = [];
    await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).openCursor();
        req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) { resolve(); return; }
            const alias = cursor.key as string;
            // Backup TẤT CẢ các khóa (kể cả peer keys) để có thể đọc tin nhắn cũ ngay lập tức sau khi restore
            if (alias !== IDENTITY_KEY_ALIAS && alias !== 'EphemeralRSAKey') {
                keysToExport.push({ alias, key: cursor.value as CryptoKey });
            }
            cursor.continue();
        };
        req.onerror = () => reject(req.error);
    });

    const allKeys: Record<string, any> = {};
    for (const { alias, key } of keysToExport) {
        try {
            const jwk = await window.crypto.subtle.exportKey('jwk', key);
            allKeys[alias] = jwk;
        } catch { /* skip non-exportable */ }
    }

    // 4. Tạo JSON bundle bằng JWK objects
    const bundle = JSON.stringify({
        version: 3, // Bump version to 3 for JWK format
        identityPriv: identityPrivJwk,
        identityPub: identityPubJwk,
        rsaPriv: rsaPrivJwk,
        rsaPub: rsaPubJwk,
        senderKeys: allKeys,
        exportedAt: Date.now(),
    });

    // 5. Tạo salt + IV ngẫu nhiên
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // 6. Derive AES key từ PIN
    const aesKey = await deriveKeyFromPin(pin, salt);

    // 7. Mã hóa bundle bằng AES-GCM
    const ciphertext = await window.crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        new TextEncoder().encode(bundle)
    );

    return {
        payload: bufferToBase64(ciphertext),
        salt: bufferToBase64(salt),
        iv: bufferToBase64(iv),
    };
}

/**
 * Khôi phục toàn bộ key bundle từ payload đã mã hóa và PIN.
 * Ném lỗi nếu PIN sai (AES-GCM auth tag mismatch).
 */
export async function restoreKeysFromPin(
    pin: string,
    payloadBase64: string,
    saltBase64: string,
    ivBase64: string
): Promise<true> {
    const salt = new Uint8Array(base64ToBuffer(saltBase64));
    const iv = new Uint8Array(base64ToBuffer(ivBase64));

    // 1. Derive AES key từ PIN đã nhập
    const aesKey = await deriveKeyFromPin(pin, salt);

    // 2. Giải mã – Sai PIN → AES-GCM sẽ ném lỗi tại đây
    let plaintext: string;
    try {
        const decrypted = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv.buffer as ArrayBuffer },
            aesKey,
            base64ToBuffer(payloadBase64) as ArrayBuffer
        );
        plaintext = new TextDecoder().decode(decrypted);
    } catch {
        throw new Error('PIN không đúng. Vui lòng thử lại.'); // User-friendly error
    }

    // 3. Parse bundle JSON
    const bundle = JSON.parse(plaintext);
    const isV3 = bundle.version === 3;

    // 4. Import lại IdentityKey (ECDSA)
    let identityPrivKey: CryptoKey;
    let identityPubKey: CryptoKey;
    if (isV3) {
        identityPrivKey = await window.crypto.subtle.importKey(
            'jwk',
            bundle.identityPriv as JsonWebKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
        );
        identityPubKey = await window.crypto.subtle.importKey(
            'jwk',
            bundle.identityPub as JsonWebKey,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
        );
    } else {
        identityPrivKey = await window.crypto.subtle.importKey(
            'pkcs8',
            base64ToBuffer(bundle.identityPriv) as ArrayBuffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['sign']
        );
        identityPubKey = await window.crypto.subtle.importKey(
            'raw',
            base64ToBuffer(bundle.identityPub) as ArrayBuffer,
            { name: 'ECDSA', namedCurve: 'P-256' },
            true,
            ['verify']
        );
    }
    await saveKey(IDENTITY_KEY_ALIAS, { privateKey: identityPrivKey, publicKey: identityPubKey });

    // 5. Import lại RSA Key Pair (nếu có)
    if (bundle.rsaPriv && bundle.rsaPub) {
        let rsaPrivKey: CryptoKey;
        let rsaPubKey: CryptoKey;
        if (isV3) {
            rsaPrivKey = await window.crypto.subtle.importKey(
                'jwk',
                bundle.rsaPriv as JsonWebKey,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                true,
                ['decrypt']
            );
            rsaPubKey = await window.crypto.subtle.importKey(
                'jwk',
                bundle.rsaPub as JsonWebKey,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                true,
                ['encrypt']
            );
        } else {
            rsaPrivKey = await window.crypto.subtle.importKey(
                'pkcs8',
                base64ToBuffer(bundle.rsaPriv) as ArrayBuffer,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                true,
                ['decrypt']
            );
            rsaPubKey = await window.crypto.subtle.importKey(
                'spki',
                base64ToBuffer(bundle.rsaPub) as ArrayBuffer,
                { name: 'RSA-OAEP', hash: 'SHA-256' },
                true,
                ['encrypt']
            );
        }
        await saveKey(RSA_KEY_ALIAS, { privateKey: rsaPrivKey, publicKey: rsaPubKey });
    }

    // 6. Import lại tất cả SenderKeys
    const senderKeys: Record<string, any> = bundle.senderKeys || {};
    for (const [alias, keyData] of Object.entries(senderKeys)) {
        try {
            let key: CryptoKey;
            if (alias.startsWith(PEER_IDENTITY_KEY_ALIAS + ':')) {
                if (isV3) {
                    key = await window.crypto.subtle.importKey(
                        'jwk',
                        keyData as JsonWebKey,
                        { name: 'ECDSA', namedCurve: 'P-256' },
                        true,
                        ['verify']
                    );
                } else {
                    key = await window.crypto.subtle.importKey(
                        'raw',
                        base64ToBuffer(keyData as string) as ArrayBuffer,
                        { name: 'ECDSA', namedCurve: 'P-256' },
                        true,
                        ['verify']
                    );
                }
            } else {
                if (isV3) {
                    key = await window.crypto.subtle.importKey(
                        'jwk',
                        keyData as JsonWebKey,
                        { name: 'AES-GCM' },
                        true,
                        ['encrypt', 'decrypt']
                    );
                } else {
                    key = await window.crypto.subtle.importKey(
                        'raw',
                        base64ToBuffer(keyData as string) as ArrayBuffer,
                        { name: 'AES-GCM' },
                        true,
                        ['encrypt', 'decrypt']
                    );
                }
            }
            await saveKey(alias, key);
        } catch { /* skip corrupted keys */ }
    }

    return true;
}
