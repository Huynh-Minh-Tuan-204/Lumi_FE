'use client'

import { ReactNode } from 'react'
import { ShieldAlert, Loader2, Lock, ShieldCheck } from 'lucide-react'
import { useE2EEAuth } from '@/hooks/use-e2ee-auth'
import { E2EERestorePrompt } from './e2ee-restore-prompt'
import { E2EEBackupSetup } from './e2ee-backup-setup'

interface E2EEGatekeeperProps {
    children?: ReactNode
}

export function E2EEGatekeeper({ children }: E2EEGatekeeperProps) {
    const { status, backupData, refresh, error } = useE2EEAuth()

    // Only render overlay states – children renders independently underneath
    if (status === 'loading') {
        return (
            <div className="absolute inset-0 z-[200] flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
                <Loader2 className="h-10 w-10 text-primary animate-spin mb-4" />
                <p className="text-sm font-black uppercase tracking-widest animate-pulse">
                    Đang kiểm tra bảo mật E2EE...
                </p>
            </div>
        )
    }

    if (status === 'needs-restore') {
        return (
            <div className="absolute inset-0 z-[200] flex items-center justify-center p-6 bg-background/95 backdrop-blur-md">
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
                    
                    <div className="mt-6 text-center">
                        <div className="flex flex-col gap-3">
                            <button 
                                onClick={async () => {
                                    if (confirm("Cảnh báo: Nếu bỏ qua, bạn sẽ KHÔNG THỂ đọc được các tin nhắn cũ đã bị mã hóa. Bạn có chắc chắn muốn bỏ qua?")) {
                                        console.log("[E2EE] User chose to skip restore. Generating fresh keys.");
                                        const { getOrCreateIdentityKey, getOrCreateRSAKeyPair } = await import('@/lib/crypto-utils');
                                        await getOrCreateIdentityKey();
                                        await getOrCreateRSAKeyPair();
                                        window.location.reload();
                                    }
                                }}
                                className="text-[11px] font-black uppercase tracking-widest text-muted-foreground/60 hover:text-destructive transition-colors underline underline-offset-4"
                            >
                                Bỏ qua (chấp nhận mất tin nhắn cũ)
                            </button>

                            <button 
                                onClick={async () => {
                                    if (confirm("XÁC NHẬN RESET: Hành động này sẽ xóa vĩnh viễn bản backup cũ trên server và yêu cầu bạn tạo mã PIN mới. Bạn sẽ không thể đọc lại tin nhắn cũ. Tiếp tục?")) {
                                        try {
                                            const token = localStorage.getItem('token') || '';
                                            const { e2eeApi } = await import('@/lib/api');
                                            await e2eeApi.deleteBackup(token);
                                            window.location.reload();
                                        } catch (e) {
                                            alert("Lỗi khi reset: " + (e as any).message);
                                        }
                                    }
                                }}
                                className="text-[11px] font-black uppercase tracking-widest text-destructive/60 hover:text-destructive transition-colors"
                            >
                                Quên mã PIN? Thiết lập lại từ đầu
                            </button>
                        </div>
                    </div>

                    <p className="mt-8 text-[10px] text-center text-muted-foreground uppercase tracking-widest font-bold opacity-50">
                        Zero-Knowledge Encryption • Lumi Pro Secure
                    </p>
                </div>
            </div>
        )
    }

    if (status === 'needs-setup') {
        return (
            <div className="absolute inset-0 z-[200] flex items-center justify-center p-6 bg-background/95 backdrop-blur-md">
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
                            onClose={() => window.location.reload()} 
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

    if (status === 'error') {
        return (
            <div className="absolute inset-0 z-[200] flex items-center justify-center p-6 bg-background/95 backdrop-blur-md">
                <div className="w-full max-w-md text-center">
                    <div className="inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-destructive/10 mb-4 border border-destructive/20 shadow-2xl shadow-destructive/10">
                        <ShieldAlert className="h-10 w-10 text-destructive" />
                    </div>
                    <h2 className="text-xl font-black mb-2">Lỗi Hệ Thống E2EE</h2>
                    <p className="text-sm text-muted-foreground mb-6">
                        {error || "Không thể kiểm tra trạng thái bảo mật. Vui lòng kiểm tra kết nối Backend (404/500)."}
                    </p>
                    <button 
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-primary text-primary-foreground rounded-xl font-bold text-xs uppercase"
                    >
                        Thử lại
                    </button>
                    <div className="mt-4">
                        <button 
                            onClick={async () => {
                                console.log("[E2EE] Forcing key generation to bypass error...");
                                const { getOrCreateIdentityKey, getOrCreateRSAKeyPair } = await import('@/lib/crypto-utils');
                                await getOrCreateIdentityKey();
                                await getOrCreateRSAKeyPair();
                                window.location.reload();
                            }}
                            className="text-[10px] text-muted-foreground/60 underline uppercase font-bold"
                        >
                            Bỏ qua lỗi (Vào chế độ không mã hóa tin nhắn cũ)
                        </button>
                    </div>
                </div>
            </div>
        )
    }

    // status === 'ready' — render nothing (children are behind us)
    return null
}
