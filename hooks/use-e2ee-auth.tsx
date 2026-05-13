'use client'

import { useState, useEffect, useCallback } from 'react'

export type E2EEStatus = 'loading' | 'ready' | 'needs-setup' | 'needs-restore' | 'error'

/**
 * ROLLBACK: PIN-based auth check is disabled. Always returns 'ready'.
 */
export function useE2EEAuth() {
    const [status, setStatus] = useState<E2EEStatus>('ready')
    const [error, setError] = useState<string | null>(null)

    const refresh = useCallback(() => {
        setStatus('ready')
    }, [])

    return {
        status,
        backupData: null,
        error,
        refresh
    }
}
