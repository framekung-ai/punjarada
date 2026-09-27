import { THAI_MONTHS } from '../lib/thai'

export function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

export function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = value.split('-').map(Number)
  const move = (d: number) => {
    const dt = new Date(y, m - 1 + d, 1)
    onChange(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="row">
      <button className="icon-btn" onClick={() => move(-1)} aria-label="เดือนก่อน">‹</button>
      <strong style={{ minWidth: 130, textAlign: 'center' }}>{THAI_MONTHS[m - 1]} {y + 543}</strong>
      <button className="icon-btn" onClick={() => move(1)} aria-label="เดือนถัดไป">›</button>
    </div>
  )
}
