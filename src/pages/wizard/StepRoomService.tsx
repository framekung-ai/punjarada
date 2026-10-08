import { Delete } from 'lucide-react'
import type { Beo } from '../../lib/types'
import { Field, Stepper } from '../../components/ui'
import { ThaiDatePicker } from '../../components/ThaiDatePicker'
import { addDaysIso, thaiDate, todayIso } from '../../lib/thai'
import { roomCustomerName } from '../../lib/roomService'
import type { StepProps } from './StepBasics'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⌫'] as const
const MAX_DIGITS = 6

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** Room service: room number (phone-style keypad), order date and order time — all on one page. */
export function StepRoomService({ beo, setBeo, errors }: StepProps) {
  const roomNo = beo.roomNo ?? ''
  const setRoom = (v: string) => {
    const digits = v.replace(/\D/g, '').slice(0, MAX_DIGITS)
    setBeo((b) => ({ ...b, roomNo: digits, customer: { ...b.customer, name: roomCustomerName(digits) } }))
  }
  const press = (k: (typeof KEYS)[number]) => {
    if (k === 'C') setRoom('')
    else if (k === '⌫') setRoom(roomNo.slice(0, -1))
    else setRoom(roomNo + k)
  }
  const setEvent = (patch: Partial<Beo['event']>) => setBeo((b) => ({ ...b, event: { ...b.event, ...patch } }))
  const today = todayIso()
  const date = beo.event.date

  return (
    <div className="stack">
      <div className="rs-grid">
        <section className="card stack rs-room">
          <label htmlFor="rs-room" className="name-label">เลขห้องพัก <span className="req">*</span></label>
          {/* inputMode="none": tablets/phones use the keypad below, a computer keyboard still types */}
          <input id="rs-room" className={`rs-display num${errors.roomNo && !roomNo ? ' invalid' : ''}`} inputMode="none" autoComplete="off"
            value={roomNo} placeholder="000" onChange={(e) => setRoom(e.target.value)} aria-describedby="rs-room-hint" />
          <div id="rs-room-hint" className="small muted center">{roomNo ? `ลูกค้า: ${roomCustomerName(roomNo)}` : 'แตะตัวเลขเพื่อกรอกเลขห้อง'}</div>
          <div className="keypad" role="group" aria-label="แป้นตัวเลข">
            {KEYS.map((k) => (
              <button key={k} type="button" className={`key${k === 'C' || k === '⌫' ? ' fn' : ''}`} onClick={() => press(k)}
                aria-label={k === '⌫' ? 'ลบ 1 ตัว' : k === 'C' ? 'ล้าง' : k}>
                {k === '⌫' ? <Delete size={22} aria-hidden /> : k === 'C' ? 'ล้าง' : k}
              </button>
            ))}
          </div>
          {errors.roomNo && !roomNo && <div className="err">{errors.roomNo}</div>}
        </section>

        <div className="stack">
          <Field label={`วันที่สั่ง${date ? ` — ${thaiDate(date, { weekday: true })}` : ''}`} required error={errors.date}>
            <div className="chips" style={{ marginBottom: 8 }}>
              <button type="button" className={`chip${date === today ? ' on' : ''}`} onClick={() => setEvent({ date: today })}>วันนี้</button>
              <button type="button" className={`chip${date === addDaysIso(today, 1) ? ' on' : ''}`} onClick={() => setEvent({ date: addDaysIso(today, 1) })}>พรุ่งนี้</button>
            </div>
            <ThaiDatePicker value={date} onChange={(v) => setEvent({ date: v })} />
          </Field>
          <Field label="เวลาที่สั่ง" required error={errors.start}>
            <div className="row">
              <input className="input input-lg" type="time" value={beo.event.start} onChange={(e) => setEvent({ start: e.target.value, end: '' })} aria-label="เวลาที่สั่ง" style={{ maxWidth: 200 }} />
              <button type="button" className="btn" onClick={() => setEvent({ start: nowHHMM(), end: '' })}>เวลาตอนนี้</button>
            </div>
          </Field>
          <Field label="จำนวนท่าน (ไม่บังคับ)">
            <Stepper value={beo.seating.guests} min={0} max={50} step={1} onChange={(v) => setBeo((b) => ({ ...b, seating: { ...b.seating, guests: v } }))} />
          </Field>
        </div>
      </div>
    </div>
  )
}
