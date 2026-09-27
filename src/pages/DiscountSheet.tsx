import { useMemo, useState } from 'react'
import { Banknote, BadgePercent, Check, Gift, Utensils, type LucideIcon } from 'lucide-react'
import type { Beo, BeoLine, Catalog, DiscountKind, DiscountRule } from '../lib/types'
import { discountLabel, lineAmount, priceBeo } from '../lib/pricing'
import { money, num } from '../lib/thai'
import { Sheet } from '../components/ui'

export interface DiscountResult {
  lines: BeoLine[]
  discountRule: DiscountRule | null
  discount: number
}

const KINDS: { kind: DiscountKind; title: string; hint: string; Icon: LucideIcon }[] = [
  { kind: 'percent', title: 'ส่วนลด (%)', hint: 'เปอร์เซ็นต์จากยอดรวม', Icon: BadgePercent },
  { kind: 'amount', title: 'ส่วนลด (บาท)', hint: 'ลดเป็นจำนวนเงิน', Icon: Banknote },
  { kind: 'perTable', title: 'ส่วนลดต่อโต๊ะ', hint: 'บาทต่อโต๊ะ × จำนวนโต๊ะ', Icon: Utensils },
]
const PERCENT_PRESETS = [5, 10]

/**
 * Admin: give a discount (% / baht / per table) and / or make items free.
 * Used when approving a BEO ("ส่วนลด & อนุมัติ") and in the last step of the form.
 * Everything is priced live with the same engine as the document.
 */
export function DiscountSheet({ open, beo, catalog, onClose, onApply, confirmText, title, busy }: {
  open: boolean
  beo: Beo
  catalog: Catalog
  onClose: () => void
  onApply: (r: DiscountResult) => void | Promise<void>
  confirmText: string
  title: string
  busy?: boolean
}) {
  const initialKind: DiscountKind | null = beo.discountRule?.kind ?? (beo.discount > 0 ? 'amount' : null)
  const [kind, setKind] = useState<DiscountKind | null>(initialKind)
  const [value, setValue] = useState<string>(beo.discountRule ? String(beo.discountRule.value) : beo.discount > 0 ? String(beo.discount) : '')
  const [freeOn, setFreeOn] = useState(beo.lines.some((l) => l.free))
  const [free, setFree] = useState<Set<string>>(() => new Set(beo.lines.filter((l) => l.free).map((l) => l.key)))
  const tables = beo.seating.tables

  const v = Number(value) || 0
  const rule: DiscountRule | null = kind && v > 0 ? { kind, value: v } : null
  const lines = useMemo(() => beo.lines.map((l) => ({ ...l, free: freeOn && free.has(l.key) ? true : undefined })), [beo.lines, freeOn, free])
  const trial: Beo = { ...beo, lines, discountRule: rule, discount: 0 }
  const priced = useMemo(() => priceBeo(trial, catalog), [trial.lines, trial.discountRule, beo, catalog]) // eslint-disable-line react-hooks/exhaustive-deps
  const t = priced.totals
  // current prices before any discount (FOC may already make e.g. the musician free)
  const base = useMemo(() => priceBeo({ ...beo, lines: beo.lines.map((l) => ({ ...l, free: undefined })), discountRule: null, discount: 0 }, catalog), [beo, catalog])
  const before = base.totals
  const gross = t.subtotal + t.discount
  const payable = gross - (t.freeValue ?? 0)

  const error = !kind || !value ? null
    : v <= 0 ? 'กรอกจำนวนมากกว่า 0'
    : kind === 'percent' && v > 100 ? 'ส่วนลดต้องไม่เกิน 100%'
    : kind === 'perTable' && tables <= 0 ? 'งานนี้ไม่ได้ระบุจำนวนโต๊ะ'
    : (kind === 'amount' && v > payable) || (kind === 'perTable' && v * tables > payable) ? 'ส่วนลดมากกว่ายอดที่ต้องชำระ'
    : null

  const chargeable = base.lines.filter((l) => l.kind !== 'foc' && lineAmount(l) > 0)
  const toggleFree = (key: string) => setFree((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  const pick = (k: DiscountKind) => { if (kind === k) { setKind(null); return } setKind(k); setValue(k === 'percent' ? '10' : '') }

  const apply = () => {
    if (error) return
    const outLines = beo.lines.map((l) => {
      const { free: _f, ...rest } = l
      void _f
      return freeOn && free.has(l.key) ? { ...rest, free: true } : rest
    })
    void onApply({ lines: outLines, discountRule: rule, discount: (t.ruleDiscount ?? 0) })
  }

  const nothing = !rule && !(freeOn && free.size > 0)

  return (
    <Sheet open={open} onClose={onClose} title={title}
      footer={
        <div className="row">
          <button className="btn" onClick={onClose}>ยกเลิก</button>
          <button className="btn primary grow" disabled={!!error || busy} onClick={apply}>
            {busy ? 'กำลังบันทึก…' : nothing ? confirmText.replace('ให้ส่วนลดและ', '').replace('ใช้ส่วนลด', 'ไม่ให้ส่วนลด') : confirmText}
          </button>
        </div>
      }>
      <div className="disc-grid" role="group" aria-label="รูปแบบส่วนลด">
        {KINDS.map(({ kind: k, title: tt, hint, Icon }) => {
          const disabled = k === 'perTable' && tables <= 0
          return (
            <button key={k} type="button" className={`disc-opt${kind === k ? ' on' : ''}`} aria-pressed={kind === k} disabled={disabled} onClick={() => pick(k)}>
              <span className="ico"><Icon size={22} aria-hidden /></span>
              <strong>{tt}</strong>
              <span className="small muted">{disabled ? 'ไม่มีจำนวนโต๊ะ' : hint}</span>
              {kind === k && <Check className="tick" size={18} aria-hidden />}
            </button>
          )
        })}
        <button type="button" className={`disc-opt${freeOn ? ' on' : ''}`} aria-pressed={freeOn} onClick={() => setFreeOn((x) => !x)}>
          <span className="ico"><Gift size={22} aria-hidden /></span>
          <strong>ฟรีรายการ</strong>
          <span className="small muted">เลือกอาหาร / บริการให้ฟรี</span>
          {freeOn && <Check className="tick" size={18} aria-hidden />}
        </button>
      </div>
      <div className="small muted">เลือกรูปแบบส่วนลดได้ 1 แบบ ใช้ร่วมกับ “ฟรีรายการ” ได้ · แตะซ้ำเพื่อยกเลิก</div>

      {kind === 'percent' && (
        <div className="card flat stack disc-input">
          <label htmlFor="disc-v"><strong>ส่วนลดกี่เปอร์เซ็นต์</strong></label>
          <div className="row wrap">
            {PERCENT_PRESETS.map((p) => (
              <button key={p} type="button" className={`chip${v === p ? ' on' : ''}`} onClick={() => setValue(String(p))}>{p}%</button>
            ))}
            <div className="input-affix">
              <input id="disc-v" className="input num" inputMode="decimal" value={value} placeholder="กรอกเอง" onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
              <span>%</span>
            </div>
          </div>
          <div className="small">= ลด <strong className="num">{money(t.ruleDiscount ?? 0)}</strong> บาท จากยอด {money(payable)}</div>
        </div>
      )}
      {kind === 'amount' && (
        <div className="card flat stack disc-input">
          <label htmlFor="disc-v"><strong>ส่วนลดกี่บาท</strong></label>
          <div className="input-affix">
            <input id="disc-v" className="input num" inputMode="decimal" value={value} placeholder="เช่น 2000" autoFocus onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
            <span>บาท</span>
          </div>
        </div>
      )}
      {kind === 'perTable' && (
        <div className="card flat stack disc-input">
          <label htmlFor="disc-v"><strong>ส่วนลดเฉลี่ยต่อโต๊ะ</strong></label>
          <div className="row wrap">
            <div className="input-affix">
              <input id="disc-v" className="input num" inputMode="decimal" value={value} placeholder="เช่น 200" autoFocus onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))} />
              <span>บาท/โต๊ะ</span>
            </div>
            <span>× {num(tables)} โต๊ะ = <strong className="num">{money(t.ruleDiscount ?? 0)}</strong> บาท</span>
          </div>
        </div>
      )}
      {error && <div className="err">{error}</div>}

      {freeOn && (
        <div className="card flat stack" style={{ gap: 6 }}>
          <strong>เลือกรายการที่ให้ฟรี</strong>
          {chargeable.length === 0 && <div className="small muted">ไม่มีรายการที่มีค่าใช้จ่าย</div>}
          {chargeable.map((l) => (
            <label key={l.key} className={`free-row${free.has(l.key) ? ' on' : ''}`}>
              <input type="checkbox" checked={free.has(l.key)} onChange={() => toggleFree(l.key)} />
              <span className="grow">
                <span style={{ fontWeight: 600 }}>{l.name}</span>
                <span className="small muted"> · {l.kind === 'service' ? 'บริการ' : l.kind === 'set' ? 'เซ็ต' : 'อาหาร'} · {num(l.qty)} {l.unit}</span>
              </span>
              <span className="num">{money(lineAmount(l))}</span>
            </label>
          ))}
        </div>
      )}

      <div className="card disc-summary" aria-live="polite">
        <div className="row between"><span>ราคาเต็ม</span><span className="num">{money(gross)}</span></div>
        {(t.freeValue ?? 0) > 0 && <div className="row between minus"><span>รายการฟรี ({lines.filter((l) => l.free).length})</span><span className="num">-{money(t.freeValue ?? 0)}</span></div>}
        {(t.ruleDiscount ?? 0) > 0 && <div className="row between minus"><span>{discountLabel({ discountRule: rule, seating: beo.seating })}</span><span className="num">-{money(t.ruleDiscount ?? 0)}</span></div>}
        <div className="row between total-disc"><span>ส่วนลดรวม</span><span className="num">{t.discount > 0 ? `-${money(t.discount)}` : '0.00'}{gross > 0 && t.discount > 0 ? ` (${num(Math.round((t.discount / gross) * 1000) / 10)}%)` : ''}</span></div>
        <div className="row between"><span>ยอดหลังหักส่วนลด (ก่อน VAT)</span><span className="num">{money(t.subtotal)}</span></div>
        {beo.applyVat !== false && <div className="row between small muted"><span>VAT {Math.round((catalog.settings.vatRate ?? 0.07) * 100)}%</span><span className="num">{money(t.vat)}</span></div>}
        <div className="row between grand"><span>ยอดสุทธิ</span><span className="num">{money(t.grandTotal)}</span></div>
        {t.grandTotal !== before.grandTotal && <div className="small muted right">เดิม {money(before.grandTotal)} บาท</div>}
        {tables > 0 && t.discount > 0 && <div className="small muted right">เฉลี่ยโต๊ะละ {money(t.subtotal / tables)} บาท (ก่อน VAT)</div>}
      </div>
    </Sheet>
  )
}
