import { request } from './base'

export interface E2EEBackupData {
    payload: string
    salt: string
    iv: string
    updatedAt?: string
}

export interface ZKBEntry {
    senderId: number
    encryptedSenderKey: string
}

export const e2eeApi = {
    /** Upload encrypted key bundle lên server */
    saveBackup: (token: string, data: E2EEBackupData) =>
        request<{ success: boolean; message: string }>('/e2ee/backup', {
            method: 'POST',
            token,
            body: JSON.stringify(data),
        }),

    /** Lấy encrypted key bundle về để restore trên thiết bị mới */
    getBackup: (token: string) =>
        request<E2EEBackupData>('/e2ee/backup', {
            method: 'GET',
            token,
        }),

    /** Xóa backup hiện tại */
    deleteBackup: (token: string) =>
        request<void>('/e2ee/backup', {
            method: 'DELETE',
            token,
        }),

    // ── ZKB: Per-Conversation Sender Key Escrow ────────────────────────────

    /**
     * Sender uploads an RSA-OAEP-encrypted blob of their AES SenderKey for a
     * specific conversation member. Server stores the opaque ciphertext only.
     */
    storeKeyBackup: (
        token: string,
        conversationId: number,
        recipientId: number,
        encryptedSenderKey: string
    ) =>
        request<{ success: boolean }>('/e2ee/key-backup', {
            method: 'POST',
            token,
            body: JSON.stringify({ conversationId, recipientId, encryptedSenderKey }),
        }),

    /**
     * Recipient fetches all encrypted SenderKey blobs intended for them in a
     * given conversation. Client decrypts each blob with their RSA private key.
     */
    getKeyBackups: (token: string, conversationId: number) =>
        request<ZKBEntry[]>(`/e2ee/key-backup/${conversationId}`, {
            method: 'GET',
            token,
        }),

    // ── NEW PIN-BASED BACKUP MECHANISM ──────────────────────────────────────

    /** Thiết lập mã PIN: Lưu Salt và danh sách khóa backup ban đầu */
    setupPin: (token: string, data: { salt: string; initialBackups: any[] }) =>
        request<{ success: boolean }>('/e2ee/setup-pin', {
            method: 'POST',
            token,
            body: JSON.stringify(data),
        }),

    /** Lấy Salt của user hiện tại */
    getMyPinSalt: (token: string) =>
        request<{ salt: string }>('/e2ee/my-pin-salt', {
            method: 'GET',
            token,
        }),

    /** Lấy toàn bộ danh sách khóa đã mã hóa của user */
    getMySenderKeyBackups: (token: string) =>
        request<any[]>('/e2ee/my-sender-key-backups', {
            method: 'GET',
            token,
        }),

    /** Backup lẻ một khóa (dùng khi tạo conversation mới) */
    backupSenderKey: (token: string, data: { conversationId: number; encryptedSenderKey: string; iv: string }) =>
        request<{ success: boolean }>('/e2ee/backup-sender-key', {
            method: 'POST',
            token,
            body: JSON.stringify(data),
        }),
}

