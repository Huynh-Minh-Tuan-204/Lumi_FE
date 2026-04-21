import { request } from './base'

export interface E2EEBackupData {
    payload: string
    salt: string
    iv: string
    updatedAt?: string
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
}
