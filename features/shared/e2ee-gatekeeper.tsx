'use client'

import { ReactNode } from 'react'
import { ShieldAlert, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useE2EEAuth } from '@/hooks/use-e2ee-auth'
import { E2EERestorePrompt } from './e2ee-restore-prompt'
import { E2EEBackupSetup } from './e2ee-backup-setup'

interface E2EEGatekeeperProps {
    children: ReactNode
}

export function E2EEGatekeeper({ children }: E2EEGatekeeperProps) {
    const { status, backupData, refresh } = useE2EEAuth()

    if (status === 'loading') {
        return (
            <div className="flex-1 flex flex-col items-center justify-center bg-background/50 backdrop-blur-sm">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-sm font-black uppercase tracking-widest animate-pulse">
                    Đang kiểm tra bảo mật E2EE...
                </p>
            </div>
        )
    }

    if (status === 'needs-restore') {
        return (
            <div className="flex-1 flex items-center justify-center p-6 bg-slate-950/20 relative overflow-hidden">
                {/* Background decorative elements */}
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 rounded-full blur-[120px]" />

                <div className="w-full max-w-md z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 mb-4 border border-primary/20 shadow-2xl shadow-primary/10">
                            <Lock className="h-10 w-10 text-primary" />
                        </div>
                        <h2 className="text-2xl font-black mb-2 tracking-tight">Đăng nhập thiết bị mới</h2>
                        <p className="text-sm text-muted-foreground">
                            Vui lòng nhập mã PIN để khôi phục khóa và giải mã tin nhắn của bạn.
                        </p>
                    </div>
                    
                    <E2EERestorePrompt 
                        onRestored={() => window.location.reload()} 
                        isMandatory={true}
                    />

                    <p className="mt-8 text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold opacity-50">
                        Zero-Knowledge Encryption • Lumi Pro Secure
                    </p>
                </div>
            </div>
        )
    }

    if (status === 'needs-setup') {
        return (
            <div className="flex-1 flex items-center justify-center p-6 bg-slate-950/20 relative overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
                
                <div className="w-full max-w-md z-10">
                    <div className="text-center mb-8">
                        <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-green-500/10 mb-4 border border-green-500/20 shadow-2xl shadow-green-500/10">
                            <ShieldCheck className="h-10 w-10 text-green-500" />
                        </div>
                        <h2 className="text-2xl font-black mb-2 tracking-tight">Kích hoạt Bảo mật E2EE</h2>
                        <p className="text-sm text-muted-foreground">
                            Chào mừng bạn đến với Lumi! Hãy thiết lập mã PIN 6 số để bảo vệ tin nhắn của bạn.
                        </p>
                    </div>

                    <div className="bg-card rounded-3xl border shadow-xl overflow-hidden">
                        <E2EEBackupSetup 
                            onClose={() => refresh()} 
                            isMandatory={true}
                        />
                    </div>

                    <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20">
                        <p className="text-[11px] text-amber-600 dark:text-amber-400 font-bold leading-relaxed">
                            ⚠️ LƯU Ý: Nếu không thiết lập PIN, bạn sẽ mất toàn bộ tin nhắn khi đăng xuất hoặc chuyển sang thiết bị khác.
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    // status === 'ready'
    return <>{children}</>
}
