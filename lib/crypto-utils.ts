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
const IDENTITY_KEY_ALIAS = 'IdentityKey';

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
    return new Promise((resolve) => (tx.oncomplete = resolve));
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
        base64ToBuffer(base64),
        { name: "ECDSA", namedCurve: "P-256" },
        true,
        ["verify"]
    );
}

// ==========================================
// PHẦN 3: RSA (TRAO ĐỔI KHÓA)
// ==========================================

export async function generateEphemeralRSAKeyPair(): Promise<CryptoKeyPair> {
    return await window.crypto.subtle.generateKey(
        {
            name: "RSA-OAEP",
            modulusLength: 2048,
            publicExponent: new Uint8Array([1, 0, 1]),
            hash: "SHA-256",
        },
        true,
        ["encrypt", "decrypt"]
    );
}

export async function exportPublicKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey("spki", key);
    return bufferToBase64(exported);
}

export async function importPublicKey(base64Key: string): Promise<CryptoKey> {
    return await window.crypto.subtle.importKey(
        "spki",
        base64ToBuffer(base64Key),
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
            base64ToBuffer(signatureBase64),
            new TextEncoder().encode(data)
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

export async function encryptSessionKeyForPeer(sessionKey: CryptoKey, peerPublicKey: CryptoKey): Promise<string> {
    const raw = await window.crypto.subtle.exportKey("raw", sessionKey);
    const encrypted = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, peerPublicKey, raw);
    return bufferToBase64(encrypted);
}

export async function decryptSessionKey(encryptedBase64: string, myPrivateKey: CryptoKey): Promise<CryptoKey> {
    const decrypted = await window.crypto.subtle.decrypt(
        { name: "RSA-OAEP" },
        myPrivateKey,
        base64ToBuffer(encryptedBase64)
    );
    return await window.crypto.subtle.importKey("raw", decrypted, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

export async function encryptMessagePro(plaintext: string, senderKey: CryptoKey, identityPrivateKey: CryptoKey) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, senderKey, encoded);

    // Sign the ciphertext for non-repudiation
    const signature = await signData(bufferToBase64(ciphertext), identityPrivateKey);

    return {
        content: bufferToBase64(ciphertext),
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
    try {
        // 1. Verify Signature FIRST
        const isValid = await verifySignature(contentBase64, sigBase64, senderIdentityPubKey);
        if (!isValid) return "[CẢNH BÁO: Tin nhắn bị giả mạo chữ ký!]";

        // 2. Decrypt
        const decrypted = await window.crypto.subtle.decrypt(
            { name: "AES-GCM", iv: base64ToBuffer(ivBase64) },
            senderKey,
            base64ToBuffer(contentBase64)
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        return "[Lỗi giải mã: Khóa không khớp hoặc dữ liệu hỏng]";
    }
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
        { name: "AES-GCM", iv: base64ToBuffer(ivBase64) },
        senderKey,
        arrayBuffer
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
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes.buffer;
    } catch (e) {
        console.error("Base64 decoding failed", e);
        return new ArrayBuffer(0);
    }
}
