import { cloneElement, createContext, isValidElement, useCallback, useContext, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from 'react'
import { money } from '../lib/thai'

export function Spinner() {
  return <div className="spinner" aria-label="กำลังโหลด" />
}

export function Field({ label, required, error, children, hint }: {
  label: string; required?: boolean; error?: string | null; children: ReactNode; hint?: ReactNode
}) {
  const id = useId()
  // link the <label> to a single form control so screen readers (and tests) find it
  const control = isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type as string)
  const body = control ? cloneElement(children as ReactElement<{ id?: string }>, { id }) : children
  return (
    <div className="field">
      <label htmlFor={control ? id : undefined}>{label}{required && <span className="req"> *</span>}</label>
      {body}
      {hint && <div className="small muted">{hint}</div>}
      {error && <div className="err">{error}</div>}
    </div>
  )
}

export function Stepper({ value, onChange, min = 0, max = 9999, step = 1, editable = true }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; editable?: boolean
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v))
  return (
    <div className="stepper">
      <button type="button" className="icon-btn" aria-label="ลด" disabled={value <= min} onClick={() => onChange(clamp(value - step))}>−</button>
      {editable ? (
        <input
          className="val num" inputMode="decimal" value={Number.isFinite(value) ? value : ''}
          onChange={(e) => {
            const v = e.target.value === '' ? min : Number(e.target.value)
            if (Number.isFinite(v)) onChange(clamp(v))
          }}
        />
      ) : <span className="val num">{value}</span>}
      <button type="button" className="icon-btn" aria-label="เพิ่ม" disabled={value >= max} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  )
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        {title && <div className="row between" style={{ marginBottom: 12 }}><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="ปิด">×</button></div>}
        <div className="stack">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Money({ v, strong }: { v: number; strong?: boolean }) {
  return <span className="num" style={strong ? { fontWeight: 700 } : undefined}>{money(v)}</span>
}

// ---------- toast ----------
const ToastCtx = createContext<(msg: string) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const show = useCallback((m: string) => {
    setMsg(m)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2800)
  }, [])
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && <div className="toast" role="status">{msg}</div>}
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

export function Empty({ children }: { children: ReactNode }) {
  return <div className="card flat center muted" style={{ padding: 32 }}>{children}</div>
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    draft: ['แบบร่าง', 'gray'], pending: ['รอการยืนยัน', 'pending'], confirmed: ['ยืนยันแล้ว', 'ok'], completed: ['จัดงานแล้ว', ''], cancelled: ['ยกเลิก', 'danger'],
  }
  const [t, c] = map[status] ?? [status, 'gray']
  return <span className={`badge ${c}`}>{t}</span>
}

export function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์ทำรายการนี้'
  if (code.includes('unavailable')) return 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
  if (code.includes('too-many-requests')) return 'ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอสักครู่'
  if (code.includes('email-already-in-use')) return 'อีเมลนี้มีบัญชีอยู่แล้ว'
  if (code.includes('weak-password')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
  if (code.includes('failed-precondition')) return 'ฐานข้อมูลยังไม่พร้อม (ต้องสร้าง index — ดู firebase.md)'
  return e instanceof Error ? e.message : String(e)
}
