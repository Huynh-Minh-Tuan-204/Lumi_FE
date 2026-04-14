/**
 * Lumi Crypto Utilities - Web Crypto API implementation for E2EE
 * Built by Antigravity (Senior Frontend Engineer & Security Expert)
 */

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

// For demo purposes, we use a shared static passphrase to derive a 256-bit key.
// In a production E2EE system, this would be exchanged via RSA/Diffie-Hellman.
const DUMMY_PASSPHRASE = 'Lumi-Secure-E2EE-Master-Key-2026';

/**
 * Converts a string to ArrayBuffer using UTF-8 encoding
 */
function stringToArrayBuffer(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

/**
 * Converts ArrayBuffer to string using UTF-8 decoding
 */
function arrayBufferToString(buffer: ArrayBuffer): string {
  return new TextDecoder().decode(buffer);
}

/**
 * Converts ArrayBuffer to Base64 string
 */
export function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

/**
 * Converts Base64 string to ArrayBuffer
 */
export function base64ToBuffer(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Derives a CryptoKey from a static passphrase for demo consistency.
 * In production, you'd use window.crypto.subtle.generateKey('AES-GCM', true, ['encrypt', 'decrypt'])
 */
export async function getSessionKey(): Promise<CryptoKey> {
  // Check if we already have it in session to be faster
  const rawKey = stringToArrayBuffer(DUMMY_PASSPHRASE);

  // Hash the passphrase to ensure it's exactly 256-bits (32 bytes)
  const hash = await window.crypto.subtle.digest('SHA-256', rawKey);

  return await window.crypto.subtle.importKey(
    'raw',
    hash,
    { name: ALGORITHM },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Encrypts plaintext using AES-GCM
 * @returns { encryptedContent: string (Base64), iv: string (Base64) }
 */
export async function encryptMessage(plaintext: string, key: CryptoKey) {
  try {
    // AES-GCM recommended IV size is 12 bytes
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encodedPlaintext = stringToArrayBuffer(plaintext);

    const ciphertext = await window.crypto.subtle.encrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      encodedPlaintext
    );

    return {
      encryptedContent: bufferToBase64(ciphertext),
      iv: bufferToBase64(iv),
    };
  } catch (error) {
    console.error('Encryption failed:', error);
    throw new Error('Encryption error');
  }
}

/**
 * Decrypts Base64 ciphertext using AES-GCM and Base64 IV
 */
export async function decryptMessage(
  encryptedContentBase64: string,
  ivBase64: string,
  key: CryptoKey
): Promise<string> {
  try {
    if (!encryptedContentBase64 || !ivBase64) return encryptedContentBase64 || "";

    const ciphertext = base64ToBuffer(encryptedContentBase64);
    const iv = base64ToBuffer(ivBase64);

    const decryptedBuffer = await window.crypto.subtle.decrypt(
      {
        name: ALGORITHM,
        iv: iv,
      },
      key,
      ciphertext
    );

    return arrayBufferToString(decryptedBuffer);
  } catch (error) {
    console.warn('Decryption failed. Data might be corrupted or key mismatch.', error);
    return '[Tin nhắn không thể giải mã]';
  }
}
