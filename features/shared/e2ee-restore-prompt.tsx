'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { LockKeyhole, Loader2, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { restoreKeysFromPin } from '@/lib/crypto-utils'
import { e2eeApi } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

interface E2EERestorePromptProps {
    /** conversationId để sau khi restore có thể reload đúng conversation */
    conversationId?: number
    onRestored?: () => void
    onDismiss?: () => void
}

/** Ô PIN input tái sử dụng từ backup-setup */
function PinInput({
    value,
    onChange,
    disabled = false,
    hasError = false,
}: {
    value: string
    onChange: (v: string) => void
    disabled?: boolean
    hasError?: boolean
}) {
    const inputs = useRef<(HTMLInputElement | null)[]>([])

    const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Backspace' && !value[idx] && idx > 0) {
            inputs.current[idx - 1]?.focus()
        }
    }

    const handleChange = (idx: number, char: string) => {
        const digit = char.replace(/\D/g, '').slice(-1)
        const arr = value.padEnd(6, ' ').split('')
        arr[idx] = digit || ' '
        const next = arr.join('').trimEnd()
        onChange(next)
        if (digit && idx < 5) inputs.current[idx + 1]?.focus()
    }

    return (
        <div className="flex gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
                <input
                    key={i}
                    ref={el => { inputs.current[i] = el }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={value[i] || ''}
                    autoFocus={i === 0}
                    disabled={disabled}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKey(i, e)}
                    className={cn(
                        'h-14 w-10 rounded-xl border-2 text-center text-2xl font-black bg-background',
                        'outline-none transition-all duration-200',
                        'focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/20',
                        hasError ? 'border-destructive animate-[shake_0.4s_ease]' : value[i] ? 'border-primary' : 'border-border',
                        disabled && 'opacity-40 cursor-not-allowed'
                    )}
                />
            ))}
        </div>
    )
}

type RestoreStep = 'prompt' | 'loading' | 'done' | 'wrong-pin' | 'no-backup'

export function E2EERestorePrompt({ conversationId, onRestored, onDismiss }: E2EERestorePromptProps) {
    const { token } = useAuth()
    const [step, setStep] = useState<RestoreStep>('prompt')
    const [pin, setPin] = useState('')
    const [attempts, setAttempts] = useState(0)
    const MAX_ATTEMPTS = 5

    const handleRestore = useCallback(async () => {
        if (pin.length < 6 || !token) return

        setStep('loading')
        try {
            // 1. Lấy backup từ server
            const backup = await e2eeApi.getBackup(token)

            // 2. Giải mã với PIN
            await restoreKeysFromPin(pin, backup.payload, backup.salt, backup.iv)

            setStep('done')
            toast.success('🔓 Khôi phục khóa E2EE thành công!')

            // 3. Reload sau 1.5s để React re-init keys từ IndexedDB
            setTimeout(() => {
                if (onRestored) onRestored()
                else window.location.reload()
            }, 1500)
        } catch (err: any) {
            const isNoBackup = err?.message?.includes('404') || err?.status === 404
            if (isNoBackup) {
                setStep('no-backup')
                return
            }
            // PIN sai
            const newAttempts = attempts + 1
            setAttempts(newAttempts)
            setPin('')
            setStep('wrong-pin')
            if (newAttempts >= MAX_ATTEMPTS) {
                toast.error('Đã nhập sai PIN quá nhiều lần. Vui lòng liên hệ quản trị viên.')
            }
        }
    }, [pin, token, attempts, onRestored])

    if (step === 'done') {
        return (
            <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border bg-green-500/5 border-green-500/20 text-center">
                <CheckCircle2 className="h-12 w-12 text-green-500" />
                <div>
                    <p className="font-black text-green-600 dark:text-green-400">Khôi phục thành công!</p>
                    <p className="text-xs text-muted-foreground mt-1">Đang tải lại trang...</p>
                </div>
            </div>
        )
    }

    if (step === 'no-backup') {
        return (
            <div className="flex flex-col items-center gap-4 p-6 rounded-2xl border bg-muted/30 text-center">
                <AlertTriangle className="h-10 w-10 text-yellow-500" />
                <div>
                    <p className="font-black mb-1">Chưa có backup E2EE</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                        Tài khoản này chưa từng tạo mã PIN backup.
                        Hãy đăng nhập trên thiết bị cũ và tạo backup trong Cài đặt → Bảo mật.
                    </p>
                </div>
                {onDismiss && (
                    <Button variant="outline" size="sm" onClick={onDismiss} className="rounded-xl font-black uppercase text-xs">
                        Bỏ qua
                    </Button>
                )}
            </div>
        )
    }

    return (
        <div className="flex flex-col gap-5 p-6 rounded-2xl border bg-card shadow-lg">
            {/* Header */}
            <div className="flex items-start gap-4">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                    <LockKeyhole className="h-6 w-6 text-primary" />
                </div>
                <div>
                    <p className="font-black text-sm">🔒 Thiết bị mới được phát hiện</p>
                    <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
                        Nhập mã PIN 6 số để khôi phục khóa mã hóa và đọc được tin nhắn cũ.
                    </p>
                </div>
            </div>

            {/* Error feedback */}
            {step === 'wrong-pin' && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                    <p className="text-xs text-destructive font-bold text-center">
                        ❌ PIN không đúng. Còn {MAX_ATTEMPTS - attempts} lần thử.
                    </p>
                </div>
            )}

            {/* PIN input */}
            <div className="flex flex-col items-center gap-4">
                <PinInput
                    value={pin}
                    onChange={v => { setPin(v); if (step === 'wrong-pin') setStep('prompt') }}
                    disabled={step === 'loading' || attempts >= MAX_ATTEMPTS}
                    hasError={step === 'wrong-pin'}
                />
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                {onDismiss && (
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onDismiss}
                        className="flex-1 rounded-xl font-black uppercase text-xs"
                    >
                        Bỏ qua
                    </Button>
                )}
                <Button
                    onClick={handleRestore}
                    disabled={pin.length < 6 || step === 'loading' || attempts >= MAX_ATTEMPTS}
                    className="flex-1 h-10 rounded-xl font-black uppercase tracking-widest text-xs"
                >
                    {step === 'loading' ? (
                        <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Đang giải mã...</>
                    ) : (
                        <><RefreshCw className="h-4 w-4 mr-2" /> Khôi phục</>
                    )}
                </Button>
            </div>

            <p className="text-[10px] text-muted-foreground/50 text-center">
                Server không biết mã PIN của bạn. Chỉ bạn mới có thể giải mã.
            </p>
        </div>
    )
}
