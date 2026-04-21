'use client'

import { useState, useRef, useCallback } from 'react'
import { toast } from 'sonner'
import { ShieldCheck, KeyRound, Eye, EyeOff, Loader2, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { backupKeysToPin } from '@/lib/crypto-utils'
import { e2eeApi } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'

interface E2EEBackupSetupProps {
    onClose: () => void
    isMandatory?: boolean
}

type Step = 'intro' | 'enter-pin' | 'confirm-pin' | 'saving' | 'done' | 'error'

/** Ô nhập PIN 6 số kiểu Zalo – mỗi digit một box */
function PinInput({
    label,
    value,
    onChange,
    disabled = false,
    autoFocus = false,
}: {
    label: string
    value: string
    onChange: (v: string) => void
    disabled?: boolean
    autoFocus?: boolean
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
        <div className="flex flex-col items-center gap-3">
            <p className="text-xs font-black uppercase tracking-widest text-muted-foreground">{label}</p>
            <div className="flex gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <input
                        key={i}
                        ref={el => { inputs.current[i] = el }}
                        type="password"
                        inputMode="numeric"
                        maxLength={1}
                        value={value[i] || ''}
                        autoFocus={autoFocus && i === 0}
                        disabled={disabled}
                        onChange={e => handleChange(i, e.target.value)}
                        onKeyDown={e => handleKey(i, e)}
                        className={cn(
                            'h-14 w-10 rounded-xl border-2 text-center text-2xl font-black bg-background',
                            'outline-none transition-all duration-200',
                            'focus:border-primary focus:shadow-[0_0_0_3px] focus:shadow-primary/20',
                            value[i] ? 'border-primary' : 'border-border',
                            disabled && 'opacity-40 cursor-not-allowed'
                        )}
                    />
                ))}
            </div>
        </div>
    )
}

export function E2EEBackupSetup({ onClose, isMandatory }: E2EEBackupSetupProps) {
    const { token } = useAuth()
    const [step, setStep] = useState<Step>('intro')
    const [pin, setPin] = useState('')
    const [confirmPin, setConfirmPin] = useState('')
    const [errorMsg, setErrorMsg] = useState('')

    const handleConfirm = useCallback(async () => {
        if (pin.length < 6) {
            toast.error('PIN phải đủ 6 số.')
            return
        }
        setStep('confirm-pin')
        setConfirmPin('')
    }, [pin])

    const handleSave = useCallback(async () => {
        if (confirmPin !== pin) {
            setErrorMsg('Mã PIN xác nhận không khớp. Vui lòng thử lại.')
            setConfirmPin('')
            return
        }
        if (!token) return

        setStep('saving')
        try {
            const { payload, salt, iv } = await backupKeysToPin(pin)
            await e2eeApi.saveBackup(token, { payload, salt, iv })
            setStep('done')
            toast.success('🔐 Backup E2EE đã được lưu thành công!')
        } catch (err: any) {
            setErrorMsg(err?.message || 'Có lỗi xảy ra.')
            setStep('error')
        }
    }, [pin, confirmPin, token])

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
            <div className="relative w-full max-w-md mx-4 bg-card rounded-3xl shadow-2xl border border-border overflow-hidden animate-in zoom-in-95">

                {/* Close */}
                {!isMandatory && (
                    <button
                        onClick={onClose}
                        className="absolute top-4 right-4 h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors z-10"
                    >
                        <X className="h-4 w-4" />
                    </button>
                )}

                {/* ─── INTRO ─── */}
                {step === 'intro' && (
                    <div className="flex flex-col items-center gap-6 p-8 text-center">
                        <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                            <ShieldCheck className="h-10 w-10 text-primary" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black mb-2">Sao lưu khóa mã hóa</h2>
                            <p className="text-sm text-muted-foreground leading-relaxed">
                                Đặt <strong>mã PIN 6 số</strong> để bảo vệ và sao lưu khóa E2EE của bạn.
                                Khi đăng nhập trên thiết bị mới, nhập PIN này để khôi phục toàn bộ lịch sử tin nhắn.
                            </p>
                        </div>
                        <div className="w-full p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20 text-left">
                            <p className="text-xs font-bold text-yellow-600 dark:text-yellow-400 flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                                Nếu quên PIN, bạn sẽ không thể đọc lại tin nhắn cũ trên thiết bị mới.
                                Server không lưu PIN của bạn.
                            </p>
                        </div>
                        <Button onClick={() => setStep('enter-pin')} className="w-full h-12 rounded-2xl font-black uppercase tracking-widest">
                            <KeyRound className="h-4 w-4 mr-2" />
                            Tạo mã PIN
                        </Button>
                    </div>
                )}

                {/* ─── ENTER PIN ─── */}
                {step === 'enter-pin' && (
                    <div className="flex flex-col items-center gap-6 p-8">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <KeyRound className="h-7 w-7 text-primary" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-black mb-1">Nhập mã PIN mới</h2>
                            <p className="text-xs text-muted-foreground">Chọn 6 chữ số bạn dễ nhớ</p>
                        </div>
                        <PinInput label="Mã PIN (6 chữ số)" value={pin} onChange={setPin} autoFocus />
                        <Button
                            onClick={handleConfirm}
                            disabled={pin.length < 6}
                            className="w-full h-12 rounded-2xl font-black uppercase tracking-widest"
                        >
                            Tiếp theo
                        </Button>
                    </div>
                )}

                {/* ─── CONFIRM PIN ─── */}
                {step === 'confirm-pin' && (
                    <div className="flex flex-col items-center gap-6 p-8">
                        <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                            <ShieldCheck className="h-7 w-7 text-primary" />
                        </div>
                        <div className="text-center">
                            <h2 className="text-lg font-black mb-1">Xác nhận mã PIN</h2>
                            <p className="text-xs text-muted-foreground">Nhập lại PIN vừa chọn</p>
                        </div>
                        {errorMsg && (
                            <div className="w-full p-3 rounded-xl bg-destructive/10 border border-destructive/20">
                                <p className="text-xs text-destructive font-bold text-center">{errorMsg}</p>
                            </div>
                        )}
                        <PinInput label="Xác nhận PIN" value={confirmPin} onChange={v => { setConfirmPin(v); setErrorMsg('') }} autoFocus />
                        <div className="flex gap-3 w-full">
                            <Button variant="outline" onClick={() => { setStep('enter-pin'); setPin(''); setConfirmPin(''); setErrorMsg('') }} className="flex-1 h-12 rounded-2xl font-black">
                                Quay lại
                            </Button>
                            <Button onClick={handleSave} disabled={confirmPin.length < 6} className="flex-1 h-12 rounded-2xl font-black uppercase tracking-widest">
                                Lưu backup
                            </Button>
                        </div>
                    </div>
                )}

                {/* ─── SAVING ─── */}
                {step === 'saving' && (
                    <div className="flex flex-col items-center gap-6 p-8 text-center">
                        <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center">
                            <Loader2 className="h-10 w-10 text-primary animate-spin" />
                        </div>
                        <div>
                            <h2 className="text-lg font-black mb-1">Đang mã hóa & lưu...</h2>
                            <p className="text-xs text-muted-foreground">Đang tạo backup với PBKDF2 + AES-GCM-256</p>
                        </div>
                    </div>
                )}

                {/* ─── DONE ─── */}
                {step === 'done' && (
                    <div className="flex flex-col items-center gap-6 p-8 text-center">
                        <div className="h-20 w-20 rounded-3xl bg-green-500/10 flex items-center justify-center">
                            <CheckCircle2 className="h-10 w-10 text-green-500" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black mb-2">Backup thành công!</h2>
                            <p className="text-sm text-muted-foreground">
                                Khóa E2EE đã được mã hóa bằng PIN và lưu an toàn.
                                Dùng PIN này khi đăng nhập thiết bị mới.
                            </p>
                        </div>
                        <Button onClick={onClose} className="w-full h-12 rounded-2xl font-black">
                            Hoàn tất
                        </Button>
                    </div>
                )}

                {/* ─── ERROR ─── */}
                {step === 'error' && (
                    <div className="flex flex-col items-center gap-6 p-8 text-center">
                        <div className="h-20 w-20 rounded-3xl bg-destructive/10 flex items-center justify-center">
                            <AlertTriangle className="h-10 w-10 text-destructive" />
                        </div>
                        <div>
                            <h2 className="text-xl font-black mb-2">Lỗi</h2>
                            <p className="text-sm text-muted-foreground">{errorMsg}</p>
                        </div>
                        <div className="flex gap-3 w-full">
                            {!isMandatory && (
                                <Button variant="outline" onClick={onClose} className="flex-1 h-12 rounded-2xl font-black">
                                    Đóng
                                </Button>
                            )}
                            <Button onClick={() => { setStep('intro'); setPin(''); setConfirmPin(''); setErrorMsg('') }} className={cn("flex-1 h-12 rounded-2xl font-black", isMandatory && "w-full")}>
                                Thử lại
                            </Button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
