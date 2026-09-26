import { useState } from 'react'
import type { Beo, Catalog } from '../../lib/types'
import { Field } from '../../components/ui'
import { BeoDocument } from '../../beo/BeoDocument'
import { ScaledDoc } from '../../beo/ScaledDoc'
import { money } from '../../lib/thai'

export function StepConfirm({ beo, setBeo, catalog, isAdmin }: {
  beo: Beo; setBeo: (fn: (b: Beo) => Beo) => void; catalog: Catalog; isAdmin: boolean
}) {
  const [custom, setCustom] = useState('')
  const presets = catalog.settings.remarkPresets
  const toggle = (t: string) => setBeo((b) => ({ ...b, terms: b.terms.includes(t) ? b.terms.filter((x) => x !== t) : [...b.terms, t] }))
  const extra = beo.terms.filter((t) => !presets.includes(t))
  return (
    <div className="stack">
      <h2>สรุปและยืนยัน</h2>
      <Field label="เงื่อนไข / หมายเหตุสำเร็จรูป" hint="แตะเพื่อเลือก — ข้อความที่มี ____ แก้ไขได้หลังเลือก">
        <div className="chips">
          {presets.map((t) => <button key={t} type="button" className={`chip small${beo.terms.includes(t) ? ' on' : ''}`} onClick={() => toggle(t)}>{t}</button>)}
        </div>
      </Field>
      {beo.terms.map((t, i) => t.includes('____') && (
        <input key={i} className="input" value={t} onChange={(e) => setBeo((b) => ({ ...b, terms: b.terms.map((x, k) => (k === i ? e.target.value : x)) }))} />
      ))}
      {extra.filter((t) => !t.includes('____')).map((t) => (
        <div key={t} className="row"><span className="grow">• {t}</span><button className="btn small ghost" onClick={() => toggle(t)}>ลบ</button></div>
      ))}
      <div className="row">
        <input className="input" placeholder="เพิ่มเงื่อนไขเอง" value={custom} onChange={(e) => setCustom(e.target.value)} />
        <button type="button" className="btn" disabled={!custom.trim()} onClick={() => { toggle(custom.trim()); setCustom('') }}>เพิ่ม</button>
      </div>
      <Field label="หมายเหตุเพิ่มเติม">
        <textarea className="input" value={beo.note} placeholder="เช่น ขอโต๊ะหน้าใหญ่, จัดซุ้มถ่ายรูปหน้าห้อง" onChange={(e) => setBeo((b) => ({ ...b, note: e.target.value }))} />
      </Field>
      {isAdmin && (
        <Field label="ส่วนลด (บาท) — เฉพาะ Admin">
          <input className="input num" inputMode="decimal" value={beo.discount || ''} placeholder="0"
            onChange={(e) => setBeo((b) => ({ ...b, discount: Number(e.target.value.replace(/[^\d.]/g, '')) || 0 }))} />
        </Field>
      )}
      <div className="card flat stack" style={{ gap: 8 }}>
        <strong>ภาษีมูลค่าเพิ่ม</strong>
        <div className="chips">
          <button type="button" className={`chip${beo.applyVat !== false ? ' on' : ''}`} onClick={() => setBeo((x) => ({ ...x, applyVat: true }))}>คิด VAT 7%</button>
          <button type="button" className={`chip${beo.applyVat === false ? ' on' : ''}`} onClick={() => setBeo((x) => ({
            ...x, applyVat: false, terms: x.terms.filter((t) => !t.includes('ภาษีมูลค่าเพิ่ม')),
          }))}>ไม่คิด VAT</button>
        </div>
        <div className="row between"><span>ยอดก่อน VAT</span><span className="num">{money(beo.totals.subtotal)}</span></div>
        {beo.applyVat !== false && <div className="row between"><span>VAT 7%</span><span className="num">{money(beo.totals.vat)}</span></div>}
        <div className="row between" style={{ fontWeight: 700, fontSize: '1.1rem' }}><span>รวมทั้งสิ้น</span><span className="num">{money(beo.totals.grandTotal)}</span></div>
      </div>
      <strong>ตัวอย่างเอกสาร</strong>
      <ScaledDoc><BeoDocument beo={beo} settings={catalog.settings} /></ScaledDoc>
    </div>
  )
}
