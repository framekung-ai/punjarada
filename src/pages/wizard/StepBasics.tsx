import { useEffect, useRef, useState } from 'react'
import type { Beo, Catalog } from '../../lib/types'
import { Field, Stepper, useToast } from '../../components/ui'
import { ThaiDatePicker } from '../../components/ThaiDatePicker'
import { bookingsOnDate, findCustomer, type Booking } from '../../lib/db'
import { thaiDate } from '../../lib/thai'
import type { StepErrors } from './model'

export interface StepProps {
  beo: Beo
  setBeo: (fn: (b: Beo) => Beo) => void
  catalog: Catalog
  errors: StepErrors
}

const TYPE_ICON: Record<string, string> = {
  'ประชุม': '📋', 'กินเลี้ยง': '🥂', 'เกษียณอายุ': '🎖️', 'ส่งอาหารนอกสถานที่': '🚚', 'อื่นๆ': '✳️',
}
const LAYOUT_ICON: Record<string, string> = {
  'โต๊ะจีน': '◯', 'โต๊ะกลม': '◯', 'โต๊ะเหลี่ยม': '▭', 'ชั้นเรียน': '☰', 'ตัวยู': '⊔', 'ใส่จาน (ไม่จัดโต๊ะ)': '🍱',
}

export function StepType({ beo, setBeo, catalog, errors }: StepProps) {
  const [other, setOther] = useState(
    beo.eventType && !catalog.settings.eventTypes.includes(beo.eventType) ? beo.eventType : '',
  )
  const types = catalog.settings.eventTypes
  const isOther = beo.eventType === 'อื่นๆ' || (!!beo.eventType && !types.includes(beo.eventType))
  return (
    <div className="stack">
      <h2>งานประเภทไหน?</h2>
      <div className="choice-grid">
        {types.map((t) => {
          const on = t === 'อื่นๆ' ? isOther : beo.eventType === t
          return (
            <button key={t} type="button" className={`choice${on ? ' on' : ''}`} onClick={() => setBeo((b) => ({
              ...b,
              eventType: t === 'อื่นๆ' ? (other || 'อื่นๆ') : t,
              seating: {
                ...b.seating,
                layout: b.seating.layout || (t === 'ประชุม' ? 'ชั้นเรียน' : t === 'ส่งอาหารนอกสถานที่' ? 'ใส่จาน (ไม่จัดโต๊ะ)' : 'โต๊ะจีน'),
              },
              event: { ...b.event, room: b.event.room || (t === 'ส่งอาหารนอกสถานที่' ? 'นอกสถานที่' : '') },
            }))}>
              <span className="ico">{TYPE_ICON[t] ?? '•'}</span>
              <strong>{t}</strong>
            </button>
          )
        })}
      </div>
      {isOther && (
        <Field label="ระบุประเภทงาน">
          <input className="input" value={other} placeholder="เช่น งานแต่งงาน, งานบวช" onChange={(e) => {
            setOther(e.target.value)
            setBeo((b) => ({ ...b, eventType: e.target.value || 'อื่นๆ' }))
          }} />
        </Field>
      )}
      {errors.eventType && <div className="err">{errors.eventType}</div>}
    </div>
  )
}

export function StepCustomer({ beo, setBeo, errors, onRegular }: StepProps & { onRegular: (v: boolean) => void }) {
  const toast = useToast()
  const c = beo.customer
  const set = (k: keyof Beo['customer'], v: string) => setBeo((b) => ({ ...b, customer: { ...b.customer, [k]: v } }))
  const lookup = async () => {
    try {
      const found = await findCustomer(c.phone)
      if (!found) { onRegular(false); return }
      onRegular(found.beoCount > 0)
      setBeo((b) => ({
        ...b,
        customer: {
          ...b.customer,
          name: b.customer.name || found.name,
          organization: b.customer.organization || found.organization,
          address: b.customer.address || found.address,
          contactName: b.customer.contactName || found.contactName,
          contactPhone: b.customer.contactPhone || found.contactPhone,
        },
      }))
      toast(`พบข้อมูลลูกค้าเดิม (${found.beoCount} งาน)`)
    } catch { /* offline — ignore */ }
  }
  return (
    <div className="stack">
      <h2>ข้อมูลลูกค้า</h2>
      <Field label="เบอร์โทรศัพท์" required error={errors.phone} hint="ใส่เฉพาะตัวเลข ไม่ต้องใส่ขีด (-) เช่น 0812345678 — กรอกเบอร์ก่อน ระบบจะดึงข้อมูลลูกค้าเดิมให้">
        <input className={`input${errors.phone ? ' invalid' : ''}`} inputMode="numeric" autoComplete="off" value={c.phone}
          placeholder="0812345678" onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} onBlur={() => void lookup()} />
      </Field>
      <Field label="ชื่อลูกค้า" required error={errors.name}>
        <input className={`input${errors.name ? ' invalid' : ''}`} value={c.name} placeholder="เช่น คุณรุ่งโรจน์" onChange={(e) => set('name', e.target.value)} />
      </Field>
      <Field label="หน่วยงาน / บริษัท">
        <input className="input" value={c.organization} onChange={(e) => set('organization', e.target.value)} />
      </Field>
      <details>
        <summary className="muted small" style={{ cursor: 'pointer', padding: '8px 0' }}>ที่อยู่และผู้ประสานงาน (ไม่บังคับ)</summary>
        <div className="stack" style={{ marginTop: 8 }}>
          <Field label="ที่อยู่"><input className="input" value={c.address} onChange={(e) => set('address', e.target.value)} /></Field>
          <div className="grid2">
            <Field label="ผู้ประสานงานหน้างาน"><input className="input" value={c.contactName} onChange={(e) => set('contactName', e.target.value)} /></Field>
            <Field label="เบอร์ผู้ประสานงาน"><input className="input" inputMode="numeric" placeholder="0812345678" value={c.contactPhone} onChange={(e) => set('contactPhone', e.target.value.replace(/\D/g, '').slice(0, 10))} /></Field>
          </div>
        </div>
      </details>
    </div>
  )
}

export const DEFAULT_NAME_PRESETS = ['งานเลี้ยงรุ่น', 'งานเกษียณอายุราชการ', 'งานสังสรรค์ภายใน', 'งานอบรมภายใน']

const QUICK_TIMES: [string, string, string][] = [['เช้า', '09:00', '12:00'], ['กลางวัน', '11:30', '14:00'], ['เย็น', '18:00', '22:00']]

export function StepEvent({ beo, setBeo, catalog, errors }: StepProps) {
  const ev = beo.event
  const nameRef = useRef<HTMLInputElement>(null)
  const set = (k: keyof Beo['event'], v: string) => setBeo((b) => ({ ...b, event: { ...b.event, [k]: v } }))
  const [bookings, setBookings] = useState<Booking[]>([])
  useEffect(() => {
    if (!ev.date) return
    let alive = true
    bookingsOnDate(ev.date).then((r) => { if (alive) setBookings(r.filter((x) => x.beoId !== beo.id)) }).catch(() => {})
    return () => { alive = false }
  }, [ev.date, beo.id])
  const clash = bookings.filter((b) => b.room === ev.room && ev.room !== 'นอกสถานที่')
  const floors = new Map<string, string[]>()
  for (const r of catalog.settings.rooms) {
    const f = r.floor || (r.name.startsWith('ปัญจดารา') ? 'ห้องปัญจดารา' : 'อื่นๆ')
    floors.set(f, [...(floors.get(f) ?? []), r.name])
  }
  return (
    <div className="stack">
      <h2>รายละเอียดงาน</h2>
      <div className="card name-card stack" style={{ gap: 10 }}>
        <label htmlFor="event-name" className="name-label">ชื่องาน <span className="req">*</span></label>
        <input id="event-name" ref={nameRef} className={`input input-lg${errors.eventName ? ' invalid' : ''}`} value={ev.name}
          placeholder="พิมพ์ชื่องาน หรือเลือกจากปุ่มด้านล่าง" onChange={(e) => set('name', e.target.value)} />
        <div className="chips">
          {(catalog.settings.eventNamePresets?.length ? catalog.settings.eventNamePresets : DEFAULT_NAME_PRESETS).map((p) => (
            <button key={p} type="button" className={`chip small${ev.name.startsWith(p) ? ' on' : ''}`} onClick={() => {
              set('name', ev.name.startsWith(p) ? ev.name : `${p} `)
              nameRef.current?.focus()
            }}>{p}</button>
          ))}
        </div>
        {errors.eventName && <div className="err">{errors.eventName}</div>}
      </div>
      <Field label={`วันที่จัดงาน${ev.date ? ` — ${thaiDate(ev.date, { weekday: true })}` : ''}`} required error={errors.date}>
        <ThaiDatePicker value={ev.date} onChange={(v) => set('date', v)} />
      </Field>
      <Field label="เวลา" required error={errors.start || errors.end}>
        <div className="chips">
          {QUICK_TIMES.map(([label, s, e]) => (
            <button key={label} type="button" className={`chip${ev.start === s && ev.end === e ? ' on' : ''}`}
              onClick={() => setBeo((b) => ({ ...b, event: { ...b.event, start: s, end: e } }))}>{label} {s}–{e}</button>
          ))}
        </div>
        <div className="row" style={{ marginTop: 8 }}>
          <input className="input" type="time" step={1800} value={ev.start} onChange={(e) => set('start', e.target.value)} aria-label="เวลาเริ่ม" />
          <span>ถึง</span>
          <input className="input" type="time" step={1800} value={ev.end} onChange={(e) => set('end', e.target.value)} aria-label="เวลาเลิก" />
        </div>
      </Field>
      <Field label="ห้องจัดงาน" required error={errors.room}>
        <div className="stack" style={{ gap: 8 }}>
          {[...floors.entries()].map(([floor, rooms]) => (
            <div key={floor}>
              <div className="small muted" style={{ marginBottom: 4 }}>{floor}</div>
              <div className="chips">
                {rooms.map((r) => {
                  const busy = bookings.some((b) => b.room === r) && r !== 'นอกสถานที่'
                  return (
                    <button key={r} type="button" className={`chip${ev.room === r ? ' on' : ''}`} onClick={() => set('room', r)}>
                      {r}{busy && <span className="badge gold" style={{ marginLeft: 4 }}>มีงาน</span>}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Field>
      {clash.length > 0 && (
        <div className="notice gold">
          ห้อง {ev.room} มีงานในวันนี้แล้ว: {clash.map((c) => `${c.eventName} (${c.start}–${c.end}, ${c.salesName})`).join(', ')}
        </div>
      )}
    </div>
  )
}

export function StepSeating({ beo, setBeo, catalog, errors }: StepProps) {
  const s = beo.seating
  const [manualTables, setManualTables] = useState(s.tables > 0 && s.guests > 0 && s.tables !== Math.ceil(s.guests / (s.seatsPerTable || 10)))
  const noTables = s.layout.includes('ใส่จาน') || s.layout === 'ชั้นเรียน' || s.layout === 'ตัวยู'
  const update = (patch: Partial<Beo['seating']>) => setBeo((b) => {
    const next = { ...b.seating, ...patch }
    if (!manualTables && !('tables' in patch)) {
      const isNo = next.layout.includes('ใส่จาน') || next.layout === 'ชั้นเรียน' || next.layout === 'ตัวยู'
      next.tables = isNo || !next.guests ? 0 : Math.ceil(next.guests / (next.seatsPerTable || 10))
    }
    // keep set quantities in step with the number of tables
    const lines = b.lines.map((l) => (l.kind === 'set' && l.qty === b.seating.tables && next.tables > 0 ? { ...l, qty: next.tables } : l))
    return { ...b, seating: next, lines }
  })
  return (
    <div className="stack">
      <h2>แขกและการจัดโต๊ะ</h2>
      <Field label="จำนวนแขก (ท่าน)" required error={errors.guests}>
        <Stepper value={s.guests} min={0} max={5000} step={1} onChange={(v) => update({ guests: v })} />
      </Field>
      <Field label="รูปแบบการจัดโต๊ะ" required error={errors.layout}>
        <div className="choice-grid">
          {catalog.settings.tableLayouts.map((l) => (
            <button key={l} type="button" className={`choice${s.layout === l ? ' on' : ''}`} onClick={() => update({ layout: l })}>
              <span className="ico">{LAYOUT_ICON[l] ?? '▢'}</span><strong>{l}</strong>
            </button>
          ))}
        </div>
      </Field>
      {!noTables && (
        <div className="card flat stack">
          <div className="row between wrap">
            <span>ที่นั่งต่อโต๊ะ</span>
            <Stepper value={s.seatsPerTable} min={1} max={30} onChange={(v) => update({ seatsPerTable: v })} />
          </div>
          <div className="row between wrap">
            <span>จำนวนโต๊ะ {!manualTables && s.guests > 0 && <span className="small muted">(คำนวณอัตโนมัติ)</span>}</span>
            <Stepper value={s.tables} min={0} max={500} onChange={(v) => { setManualTables(true); update({ tables: v }) }} />
          </div>
          <div className="row between wrap">
            <span>โต๊ะสำรอง</span>
            <Stepper value={s.spareTables} min={0} max={50} onChange={(v) => update({ spareTables: v })} />
          </div>
        </div>
      )}
    </div>
  )
}
