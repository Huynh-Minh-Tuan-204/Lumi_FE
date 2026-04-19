'use client'

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { toast } from 'sonner'
import { useSignalR } from '@/hooks/use-signalr'

const IDLE_TIMEOUT = 15 * 60 * 1000 // 15 minutes

export function IdleTimeout() {
    const { logout, user } = useAuth()
    const { isConnected } = useSignalR()
    const timerRef = useRef<NodeJS.Timeout | null>(null)
    const isDisconnectedRef = useRef(false)

    useEffect(() => {
        if (!user) return

        const handleActivity = () => {
            if (timerRef.current) clearTimeout(timerRef.current)

            timerRef.current = setTimeout(() => {
                toast.error('Session expired due to inactivity. You have been logged out.')
                logout()
            }, IDLE_TIMEOUT)
        }

        // Set initial timer
        handleActivity()

        // Listeners
        const events = ['mousedown', 'mousemove', 'keydown', 'scroll', 'touchstart']
        events.forEach(event => document.addEventListener(event, handleActivity, { passive: true }))

        return () => {
            if (timerRef.current) clearTimeout(timerRef.current)
            events.forEach(event => document.removeEventListener(event, handleActivity))
        }
    }, [logout, user])

    // We have intentionally removed the automatic logout upon SignalR disconnect
    // to avoid aggressively logging users out during intermittent network drops.
    useEffect(() => {
        if (!user) return

        if (!isConnected) {
            if (!isDisconnectedRef.current) {
                isDisconnectedRef.current = true
                toast.warning('Network connection unstable. Reconnecting...')
            }
        } else {
            if (isDisconnectedRef.current) {
                toast.success('Connection restored!')
                isDisconnectedRef.current = false
            }
        }
    }, [isConnected, user])

    return null
}

