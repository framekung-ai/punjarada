import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Minus, Plus, RotateCcw } from 'lucide-react'
import type { Beo, BeoLine, Catalog, DocFontScale, Settings } from '../../lib/types'
import { DEFAULT_DOC_FONT, docFont, FONT_MAX, FONT_MIN, FONT_STEPS, FONT_ZONES, pct, stepFont } from '../../lib/docFont'
import { newKey, priceBeo } from '../../lib/pricing'
import { BeoDocument } from '../../beo/BeoDocument'
import { ScaledDoc } from '../../beo/ScaledDoc'
import { planPages, type PagePlan } from '../../beo/export'
import { todayIso } from '../../lib/thai'

/** a realistic BEO built from the current menu, to preview the font size */
function sampleBeo(catalog: Catalog, long: boolean): Beo {
  const sets = catalog.menuSets.filter((s) => s.active).slice(0, long ? 2 : 1)
  const items = catalog.menuItems.filter((m) => m.active && !m.setOnly && m.price > 0 && m.priceType === 'fixed').slice(0, long ? 14 : 2)
  const svcs = catalog.services.filter((s) => s.active).slice(0, long ? 3 : 1)
  const lines: BeoLine[] = [
    ...sets.map((s) => ({ key: newKey(), kind: 'set' as const, refId: s.id, name: s.name, qty: 10, unit: 'โต๊ะ', unitPrice: s.pricePerTable, setItems: s.items.map((i) => i.name), detail: s.drinksText ? `เครื่องดื่ม: ${s.drinksText}` : undefined })),
    ...items.map((m) => ({ key: newKey(), kind: 'item' as const, refId: m.id, name: m.name, qty: 10, unit: m.unit, unitPrice: m.price, course: m.course })),
    ...svcs.map((s) => ({ key: newKey(), kind: 'service' as const, refId: s.id, name: s.name, qty: 1, unit: s.unit, unitPrice: s.price || 1500 })),
  ]
  const terms = catalog.settings.remarkPresets.filter((t) => !t.includes('____')).slice(0, long ? 4 : 2)
  const b: Beo = {
    docNo: 'BEO-ตัวอย่าง', status: 'confirmed', revision: 0, eventType: 'จัดเลี้ยง',
    customer: { name: 'คุณตัวอย่าง ใจดี', phone: '0986932917', organization: 'บริษัท ตัวอย่าง จำกัด', address: 'นครราชสีมา', contactName: '', contactPhone: '' },
    event: { name: 'งานเลี้ยงรุ่น (ตัวอย่าง)', date: todayIso(), start: '18:00', end: '22:00', room: catalog.settings.rooms[0]?.name ?? 'ห้องจัดเลี้ยง' },
    seating: { guests: 100, layout: 'โต๊ะจีน', tables: 10, seatsPerTable: 10, spareTables: 1 },
    lines, discount: 0, terms, note: long ? 'ขอจัดโต๊ะประธานหน้าเวที · มีพิธีมอบของที่ระลึกช่วง 19.00 น.' : '',
    totals: { subtotal: 0, discount: 0, vat: 0, grandTotal: 0, focValue: 0 },
    salesUid: 'sample', salesName: 'พนักงานขาย', approvedByName: 'ผู้อนุมัติ',
  }
  const priced = priceBeo(b, catalog)
  return { ...b, lines: priced.lines, totals: priced.totals }
}

function FontRow({ label, hint, value, onChange, strong }: { label: string; hint?: string; value: number | null; onChange: (dir: 1 | -1) => void; strong?: boolean }) {
  return (
    <div className={`font-row${strong ? ' strong' : ''}`}>
      <div className="grow">
        <div className="font-row-label">{label}</div>
        {hint && <div className="small muted">{hint}</div>}
      </div>
      <div className="font-ctl" role="group" aria-label={`ขนาดตัวอักษร ${label}`}>
        <button type="button" className="icon-btn" onClick={() => onChange(-1)} disabled={value !== null && value <= FONT_MIN} aria-label={`ลดขนาด ${label}`}><Minus size={18} aria-hidden /></button>
        <span className="font-val num" aria-live="polite">{value === null ? 'แยกโซน' : pct(value)}</span>
        <button type="button" className="icon-btn" onClick={() => onChange(1)} disabled={value !== null && value >= FONT_MAX} aria-label={`เพิ่มขนาด ${label}`}><Plus size={18} aria-hidden /></button>
      </div>
      {value !== null && (
        <div className="font-steps" aria-hidden>
          {FONT_STEPS.map((s) => <span key={s} className={s <= value + 0.001 ? 'on' : ''} />)}
        </div>
      )}
    </div>
  )
}

/** Admin → ตั้งค่าทั่วไป: font size of the printed BEO, per zone, with a live A4 preview. */
export function DocFontSettings({ settings, catalog, onChange, onSave, dirty }: {
  settings: Settings; catalog: Catalog; onChange: (f: DocFontScale) => void; onSave: () => void; dirty: boolean
}) {
  const f = docFont(settings)
  const [long, setLong] = useState(false)
  const beo = useMemo(() => sampleBeo(catalog, long), [catalog, long])
  const docRef = useRef<HTMLDivElement>(null)
  const [plan, setPlan] = useState<PagePlan | null>(null)

  // where the PDF will break pages, for the dashed lines and the page count
  useLayoutEffect(() => {
    const el = docRef.current
    if (!el) return
    let alive = true
    const measure = () => { if (alive && docRef.current) setPlan(planPages(docRef.current)) }
    measure()
    void document.fonts?.ready.then(measure)
    return () => { alive = false }
  }, [f.header, f.info, f.items, f.summary, long])

  const all = new Set(Object.values(f)).size === 1 ? f.header : null
  const setAll = (dir: 1 | -1) => {
    const base = all ?? (dir > 0 ? Math.min(...Object.values(f)) : Math.max(...Object.values(f)))
    const v = stepFont(base, dir)
    onChange({ header: v, info: v, items: v, summary: v })
  }
  const setZone = (k: keyof DocFontScale, dir: 1 | -1) => onChange({ ...f, [k]: stepFont(f[k], dir) })
  const isDefault = Object.values(f).every((v) => v === 1)

  const pages = plan?.breaks.length ?? 1
  const status = !plan ? '' : pages > 1
    ? `${pages} หน้า A4 — แบ่งหน้าระหว่างแถว ไม่ตัดกลางรายการ (เส้นประสีแดง = ขึ้นหน้าใหม่)`
    : plan.shrink < 0.995 ? `1 หน้า A4 (ย่อลงเล็กน้อยเหลือ ${pct(plan.shrink)} ให้พอดีหน้า)` : '1 หน้า A4 พอดี'

  return (
    <section className="card stack">
      <div className="row between wrap">
        <h2>ขนาดตัวอักษรในเอกสาร BEO</h2>
        <button type="button" className="btn small" disabled={isDefault} onClick={() => onChange(DEFAULT_DOC_FONT)}><RotateCcw size={16} aria-hidden /> ค่าเริ่มต้น</button>
      </div>
      <div className="small muted">
        ใช้กับเอกสารทุกใบ ทั้งบนหน้าจอ PDF และ JPG · ปรับทั้งเอกสาร หรือเฉพาะบางส่วนก็ได้ (90%–150%) ·
        ถ้าตัวอักษรใหญ่จนเกิน 1 หน้า ระบบจะขึ้นหน้าใหม่ระหว่างแถว และย้ายสรุปยอด หมายเหตุ และผู้ลงนามไปด้วยกัน
      </div>

      <div className="font-grid">
        <div className="stack" style={{ gap: 8 }}>
          <FontRow label="ทั้งเอกสาร" value={all} onChange={setAll} strong />
          {FONT_ZONES.map((z) => <FontRow key={z.key} label={z.label} hint={z.hint} value={f[z.key]} onChange={(d) => setZone(z.key, d)} />)}
          <button type="button" className="btn primary" disabled={!dirty} onClick={onSave}>บันทึกขนาดตัวอักษร</button>
        </div>

        <div className="stack" style={{ gap: 8 }}>
          <div className="row between wrap">
            <div className="chips">
              <button type="button" className={`chip small${!long ? ' on' : ''}`} onClick={() => setLong(false)}>ตัวอย่างงานทั่วไป</button>
              <button type="button" className={`chip small${long ? ' on' : ''}`} onClick={() => setLong(true)}>ตัวอย่างรายการเยอะ</button>
            </div>
            <span className={`badge ${pages > 1 ? 'gold' : 'ok'}`}>{pages} หน้า</span>
          </div>
          <div className="small">{status}</div>
          <div className="font-preview">
            <ScaledDoc>
              <div style={{ position: 'relative' }}>
                <BeoDocument ref={docRef} beo={beo} settings={settings} />
                {plan && plan.breaks.slice(1).map(([from], i) => (
                  <div key={i} className="page-break-line" style={{ top: from }}><span>ขึ้นหน้า {i + 2}</span></div>
                ))}
              </div>
            </ScaledDoc>
          </div>
        </div>
      </div>
    </section>
  )
}
