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
                // Trường hợp mất khóa local -> Kiểm tra xem có PIN trên server không
                let hasPinBackup = false;
                try {
                    const saltData = await e2eeApi.getMyPinSalt(token);
                    if (saltData && saltData.salt) {
                        hasPinBackup = true;
                    }
                } catch (e) {
                    // 404 hoặc lỗi khác -> coi như chưa có PIN
                }

                if (hasPinBackup) {
                    // Đã có mã PIN trên server -> Yêu cầu khôi phục
                    setStatus('needs-restore')
                } else {
                    // Chưa có khóa local cũng chưa có PIN -> Yêu cầu thiết lập lần đầu
                    setStatus('needs-setup')
                }
            } else {
                // Đã có khóa local
                if (!remoteBackup) {
                    // Chỉ hiện banner nhắc nhở, không block hoàn toàn
                    setStatus('ready')  // Vẫn cho vào app
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
