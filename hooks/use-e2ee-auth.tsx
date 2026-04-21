'use client'

import { useState, useEffect, useCallback } from 'react'
import { loadKey, IDENTITY_KEY_ALIAS } from '@/lib/crypto-utils'
import { e2eeApi } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

export type E2EEStatus = 'loading' | 'needs-restore' | 'needs-setup' | 'ready' | 'error'

export function useE2EEAuth() {
    const { token, user } = useAuth()
    const [status, setStatus] = useState<E2EEStatus>('loading')
    const [backupData, setBackupData] = useState<any>(null)
    const [error, setError] = useState<string | null>(null)

    const checkE2EEStatus = useCallback(async () => {
        if (!token || !user) return

        try {
            // 1. Kiểm tra khóa cục bộ trong IndexedDB
            const localIdentity = await loadKey(IDENTITY_KEY_ALIAS)
            
            // 2. Kiểm tra backup trên server
            let remoteBackup = null
            try {
                remoteBackup = await e2eeApi.getBackup(token)
            } catch (err: any) {
                if (err.status !== 404) {
                    console.error('Lỗi khi lấy backup E2EE:', err)
                }
            }

            if (!localIdentity) {
                // Trường hợp mất khóa local
                if (remoteBackup) {
                    // Đã có backup trên server -> Yêu cầu khôi phục
                    setBackupData(remoteBackup)
                    setStatus('needs-restore')
                } else {
                    // Chưa có khóa local cũng chưa có backup -> Yêu cầu thiết lập lần đầu
                    setStatus('needs-setup')
                }
            } else {
                // Đã có khóa local
                if (!remoteBackup) {
                    // Có khóa local nhưng chưa backup lên server -> Ép backup để an toàn
                    setStatus('needs-setup')
                } else {
                    // Mọi thứ đã sẵn sàng
                    setStatus('ready')
                }
            }
        } catch (err: any) {
            setError(err.message || 'Lỗi kiểm tra trạng thái E2EE')
            setStatus('error')
        }
    }, [token, user])

    useEffect(() => {
        if (token && user) {
            checkE2EEStatus()
        }
    }, [token, user, checkE2EEStatus])

    return {
        status,
        backupData,
        error,
        refresh: checkE2EEStatus
    }
}
