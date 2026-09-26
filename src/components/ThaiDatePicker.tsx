import { useState } from 'react'
import { THAI_MONTHS, todayIso } from '../lib/thai'

const DOW = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`

/** Month calendar that shows the Buddhist year (พ.ศ.). Value is stored as YYYY-MM-DD (ค.ศ.). */
export function ThaiDatePicker({ value, onChange, marks }: {
  value: string
  onChange: (v: string) => void
  /** dates to mark with a dot (e.g. room already booked) */
  marks?: Set<string>
}) {
  const base = value || todayIso()
  const [y, setY] = useState(Number(base.slice(0, 4)))
  const [m, setM] = useState(Number(base.slice(5, 7)) - 1)
  const today = todayIso()
  const first = new Date(y, m, 1).getDay()
  const days = new Date(y, m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const move = (delta: number) => {
    const d = new Date(y, m + delta, 1)
    setY(d.getFullYear())
    setM(d.getMonth())
  }
  return (
    <div className="cal card flat">
      <div className="head">
        <button type="button" className="icon-btn" onClick={() => move(-1)} aria-label="เดือนก่อน">‹</button>
        <strong>{THAI_MONTHS[m]} {y + 543}</strong>
        <button type="button" className="icon-btn" onClick={() => move(1)} aria-label="เดือนถัดไป">›</button>
      </div>
      <div className="grid">
        {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
        {cells.map((d, i) => {
          if (d === null) return <div key={`e${i}`} />
          const v = iso(y, m, d)
          const cls = ['d', v === value && 'on', v === today && 'today', v < today && 'past'].filter(Boolean).join(' ')
          return (
            <button type="button" key={v} className={cls} onClick={() => onChange(v)}>
              {d}{marks?.has(v) && <span style={{ display: 'block', fontSize: 8, lineHeight: '6px', color: 'var(--gold)' }}>●</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
