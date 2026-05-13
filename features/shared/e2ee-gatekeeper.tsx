'use client'

import { ReactNode } from 'react'

interface E2EEGatekeeperProps {
    children?: ReactNode
}

/**
 * ROLLBACK: PIN-based gatekeeper is disabled to restore immediate chat functionality.
 */
export function E2EEGatekeeper({ children }: E2EEGatekeeperProps) {
    return <>{children}</>
}
