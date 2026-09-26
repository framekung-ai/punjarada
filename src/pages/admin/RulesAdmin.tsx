import { useState } from 'react'
import type { CourseId, FocCondition, FocRule, MealTemplate, Settings } from '../../lib/types'
import { COURSE_LABEL } from '../../lib/types'
import { useReadyCatalog } from '../../lib/catalog'
import { deleteCatalogDoc, newId, saveCatalogDoc, saveSettings } from '../../lib/db'
import { ruleMatches } from '../../lib/pricing'
import { num } from '../../lib/thai'
import { Field, Sheet , useConfirm } from '../../components/ui'
import { TagsInput, useSaver } from './CatalogAdmin'
import { DEFAULT_NAME_PRESETS } from '../wizard/StepBasics'

const GROUP_LABEL: Record<string, string> = { drinks: 'เครื่องดื่ม', music: 'นักดนตรี' }
const OPS: FocCondition['op'][] = ['>=', '>', '<=', '<']
const OP_LABEL: Record<string, string> = { '>=': '≥', '>': '>', '<=': '≤', '<': '<' }

function condText(c: FocCondition) {
  return `${c.field === 'tables' ? 'จำนวนโต๊ะ' : 'ราคาต่อโต๊ะ'} ${OP_LABEL[c.op]} ${num(c.value)}${c.field === 'tables' ? ' โต๊ะ' : ' บาท'}`
}

export function FocAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const confirm = useConfirm()
  const [edit, setEdit] = useState<FocRule | null>(null)
  const [tPrice, setTPrice] = useState(3000)
  const [tTables, setTTables] = useState(5)
  const groups = [...new Set(catalog.focRules.map((r) => r.group))]
  const ctx = { tables: tTables, pricePerTable: tPrice, foodTotal: tPrice * tTables }
  const svcName = (id: string) => catalog.services.find((s) => s.id === id)?.name ?? id
  const effectText = (r: FocRule) => r.effect.kind === 'free'
    ? `ฟรี: ${r.effect.items.map((i) => i.label).join(' + ')}`
    : `${svcName(r.effect.serviceId)} ราคา ${r.effect.price === 0 ? 'ฟรี' : `${num(r.effect.price)} บาท`}`

  return (
    <div className="stack">
      <div className="page-head">
        <h1>กฎ FOC (ของแถม / ราคาพิเศษ)</h1>
        <button className="btn primary" onClick={() => setEdit({ id: '', group: groups[0] ?? 'drinks', order: 9, name: '', conditions: [{ field: 'pricePerTable', op: '>=', value: 3000 }], effect: { kind: 'free', items: [] }, active: true })}>+ เพิ่มกฎ</button>
      </div>
      <div className="small muted">ในแต่ละกลุ่ม ระบบตรวจจากลำดับบนลงล่างและใช้กฎข้อแรกที่เข้าเงื่อนไข “ราคาต่อโต๊ะ” = ราคาเซ็ต หรือ ยอดอาหาร ÷ จำนวนโต๊ะ</div>

      <div className="card stack">
        <strong>ทดลองคำนวณ</strong>
        <div className="row wrap">
          <label className="row">ราคาต่อโต๊ะ <input className="inline-input" value={tPrice} onChange={(e) => setTPrice(Number(e.target.value) || 0)} /></label>
          <label className="row">จำนวนโต๊ะ <input className="inline-input" value={tTables} onChange={(e) => setTTables(Number(e.target.value) || 0)} /></label>
        </div>
        {groups.map((g) => {
          const hit = catalog.focRules.filter((r) => r.group === g && r.active).sort((a, b) => a.order - b.order).find((r) => ruleMatches(r, ctx))
          return <div key={g} className="small"><strong>{GROUP_LABEL[g] ?? g}:</strong> {hit ? `${hit.name} → ${effectText(hit)}` : 'ไม่เข้าเงื่อนไข (ราคาปกติ)'}</div>
        })}
      </div>

      {groups.map((g) => (
        <section key={g} className="stack">
          <h2>{GROUP_LABEL[g] ?? g}</h2>
          {catalog.focRules.filter((r) => r.group === g).sort((a, b) => a.order - b.order).map((r) => (
            <div key={r.id} className="card flat row" style={r.active ? undefined : { opacity: .5 }}>
              <span className="badge gray">{r.order}</span>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{r.name}</div>
                <div className="small muted">ถ้า {r.conditions.map(condText).join(' และ ')} → {effectText(r)}</div>
              </div>
              <button className="btn small" onClick={() => setEdit(r)}>แก้ไข</button>
            </div>
          ))}
        </section>
      ))}

      {edit && <FocEditor rule={edit} onClose={() => setEdit(null)}
        onSave={async (r) => { const id = r.id || newId('focRules'); if (await save(() => saveCatalogDoc('focRules', id, r))) setEdit(null) }}
        onDelete={async (r) => { if (await confirm({ title: `ลบกฎ “${r.name}”?`, message: 'ถ้าต้องการหยุดชั่วคราว ให้เอาติ๊ก “เปิดใช้งาน” ออกแทน', confirmText: 'ลบกฎ', danger: true }) && await save(() => deleteCatalogDoc('focRules', r.id), 'ลบแล้ว')) setEdit(null) }} />}
    </div>
  )
}

function FocEditor({ rule, onClose, onSave, onDelete }: { rule: FocRule; onClose: () => void; onSave: (r: FocRule) => Promise<void>; onDelete: (r: FocRule) => Promise<void> }) {
  const catalog = useReadyCatalog()
  const [r, setR] = useState<FocRule>(rule)
  const setCond = (i: number, c: Partial<FocCondition>) => setR({ ...r, conditions: r.conditions.map((x, k) => (k === i ? { ...x, ...c } : x)) })
  return (
    <Sheet open onClose={onClose} title={r.id ? 'แก้ไขกฎ' : 'เพิ่มกฎ'} footer={
      <div className="row">
        {r.id && <button className="btn danger" onClick={() => void onDelete(r)}>ลบ</button>}
        <button className="btn primary grow" disabled={!r.name.trim()} onClick={() => void onSave(r)}>บันทึก</button>
      </div>}>
      <Field label="ชื่อกฎ (แสดงบนเอกสาร)"><input className="input" value={r.name} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
      <div className="grid2">
        <Field label="กลุ่ม" hint="กฎในกลุ่มเดียวกันใช้ได้ข้อเดียว"><input className="input" value={r.group} onChange={(e) => setR({ ...r, group: e.target.value })} list="foc-groups" />
          <datalist id="foc-groups"><option value="drinks" /><option value="music" /></datalist></Field>
        <Field label="ลำดับ (น้อย = ตรวจก่อน)"><input className="input num" value={r.order} onChange={(e) => setR({ ...r, order: Number(e.target.value) || 0 })} /></Field>
      </div>
      <Field label="เงื่อนไข (ต้องเข้าทุกข้อ)">
        {r.conditions.map((c, i) => (
          <div key={i} className="row">
            <select className="input" value={c.field} onChange={(e) => setCond(i, { field: e.target.value as FocCondition['field'] })}>
              <option value="pricePerTable">ราคาต่อโต๊ะ</option><option value="tables">จำนวนโต๊ะ</option>
            </select>
            <select className="input" style={{ width: 80 }} value={c.op} onChange={(e) => setCond(i, { op: e.target.value as FocCondition['op'] })}>
              {OPS.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
            </select>
            <input className="input num" style={{ width: 110 }} value={c.value} onChange={(e) => setCond(i, { value: Number(e.target.value) || 0 })} />
            <button className="icon-btn" onClick={() => setR({ ...r, conditions: r.conditions.filter((_, k) => k !== i) })}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => setR({ ...r, conditions: [...r.conditions, { field: 'tables', op: '>=', value: 3 }] })}>+ เงื่อนไข</button>
      </Field>
      <Field label="ผลลัพธ์">
        <div className="chips">
          <button type="button" className={`chip small${r.effect.kind === 'free' ? ' on' : ''}`} onClick={() => setR({ ...r, effect: { kind: 'free', items: [] } })}>ให้ของแถมฟรี</button>
          <button type="button" className={`chip small${r.effect.kind === 'setPrice' ? ' on' : ''}`} onClick={() => setR({ ...r, effect: { kind: 'setPrice', serviceId: catalog.services[0]?.id ?? '', price: 0 } })}>กำหนดราคาบริการใหม่</button>
        </div>
      </Field>
      {r.effect.kind === 'free' ? (
        <div className="stack" style={{ gap: 6 }}>
          {r.effect.items.map((it, i) => {
            const eff = r.effect as Extract<FocRule['effect'], { kind: 'free' }>
            const upd = (p: Partial<typeof it>) => setR({ ...r, effect: { ...eff, items: eff.items.map((x, k) => (k === i ? { ...x, ...p } : x)) } })
            return (
              <div key={i} className="card flat stack" style={{ gap: 6 }}>
                <div className="row"><input className="input" placeholder="ชื่อของแถม" value={it.label} onChange={(e) => upd({ label: e.target.value })} /><button className="icon-btn" onClick={() => setR({ ...r, effect: { ...eff, items: eff.items.filter((_, k) => k !== i) } })}>×</button></div>
                <div className="row wrap small">
                  <label className="row">รหัส <select className="input" style={{ width: 150 }} value={it.key} onChange={(e) => upd({ key: e.target.value })}><option value="water">water (น้ำ-น้ำแข็ง)</option><option value="chrysanthemum">chrysanthemum (เก๊กฮวย)</option><option value="other">อื่นๆ</option></select></label>
                  <label className="row">จำนวน <input className="inline-input" value={it.qty} onChange={(e) => upd({ qty: Number(e.target.value) || 0 })} /></label>
                  <select className="input" style={{ width: 110 }} value={it.qtyPer} onChange={(e) => upd({ qtyPer: e.target.value as 'table' | 'event' })}><option value="table">ต่อโต๊ะ</option><option value="event">ต่องาน</option></select>
                  <label className="row">มูลค่า/หน่วย <input className="inline-input" value={it.unitValue} onChange={(e) => upd({ unitValue: Number(e.target.value) || 0 })} /></label>
                </div>
              </div>
            )
          })}
          <button className="btn small" onClick={() => {
            const eff = r.effect as Extract<FocRule['effect'], { kind: 'free' }>
            setR({ ...r, effect: { ...eff, items: [...eff.items, { key: 'other', label: '', qtyPer: 'table', qty: 1, unit: 'ชุด/โต๊ะ', unitValue: 0 }] } })
          }}>+ ของแถม</button>
          <div className="small muted">รหัส water / chrysanthemum ใช้กันไม่ให้แถมซ้ำกับเครื่องดื่มที่รวมในเซ็ต · มูลค่า/หน่วยใช้แสดง “มูลค่าของแถมรวม” (ใส่ 0 = ไม่แสดง)</div>
        </div>
      ) : (
        <div className="grid2">
          <Field label="บริการ">
            <select className="input" value={r.effect.serviceId} onChange={(e) => setR({ ...r, effect: { ...(r.effect as { kind: 'setPrice'; serviceId: string; price: number }), serviceId: e.target.value } })}>
              {catalog.services.map((s) => <option key={s.id} value={s.id}>{s.name} (ปกติ {num(s.price)})</option>)}
            </select>
          </Field>
          <Field label="ราคาใหม่ (0 = ฟรี)">
            <input className="input num" value={r.effect.price} onChange={(e) => setR({ ...r, effect: { ...(r.effect as { kind: 'setPrice'; serviceId: string; price: number }), price: Number(e.target.value) || 0 } })} />
          </Field>
        </div>
      )}
      <label className="row"><input type="checkbox" checked={r.active} onChange={(e) => setR({ ...r, active: e.target.checked })} /> เปิดใช้งาน</label>
    </Sheet>
  )
}

// ---------------- Meal templates ----------------

export function TemplatesAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const [tpls, setTpls] = useState<MealTemplate[]>(catalog.settings.mealTemplates)
  const courses = (Object.keys(COURSE_LABEL) as CourseId[]).filter((c) => c !== 'drink')
  const upd = (ti: number, fn: (t: MealTemplate) => MealTemplate) => setTpls(tpls.map((t, i) => (i === ti ? fn(t) : t)))
  return (
    <div className="stack">
      <div className="page-head">
        <h1>โครงมื้อ</h1>
        <button className="btn primary" onClick={() => void save(() => saveSettings({ ...catalog.settings, mealTemplates: tpls }))}>บันทึก</button>
      </div>
      <div className="small muted">ใช้เช็กว่ามื้ออาหารครบหรือยัง แล้วแนะนำเมนูในช่องที่ขาด · “โต๊ะจีน” ใช้กับทุกรูปแบบ ยกเว้น “ใส่จาน”</div>
      {tpls.map((t, ti) => (
        <section key={t.id} className="card stack">
          <input className="input" value={t.name} onChange={(e) => upd(ti, (x) => ({ ...x, name: e.target.value }))} />
          {t.slots.map((s, si) => (
            <div key={si} className="card flat stack" style={{ gap: 6 }}>
              <div className="row">
                <input className="input" value={s.label} onChange={(e) => upd(ti, (x) => ({ ...x, slots: x.slots.map((y, k) => (k === si ? { ...y, label: e.target.value } : y)) }))} />
                <button className="icon-btn" onClick={() => upd(ti, (x) => ({ ...x, slots: x.slots.filter((_, k) => k !== si) }))}>×</button>
              </div>
              <div className="chips">
                {courses.map((c) => (
                  <button key={c} type="button" className={`chip small${s.courses.includes(c) ? ' on' : ''}`} onClick={() => upd(ti, (x) => ({
                    ...x, slots: x.slots.map((y, k) => (k === si ? { ...y, courses: y.courses.includes(c) ? y.courses.filter((z) => z !== c) : [...y.courses, c] } : y)),
                  }))}>{COURSE_LABEL[c]}</button>
                ))}
              </div>
            </div>
          ))}
          <button className="btn small" onClick={() => upd(ti, (x) => ({ ...x, slots: [...x.slots, { label: 'ช่องใหม่', courses: [] }] }))}>+ เพิ่มช่อง</button>
        </section>
      ))}
    </div>
  )
}

// ---------------- General settings ----------------

export function SettingsAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const [s, setS] = useState<Settings>(catalog.settings)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS({ ...s, [k]: v })
  return (
    <div className="stack">
      <div className="page-head">
        <h1>ตั้งค่าทั่วไป</h1>
        <button className="btn primary" onClick={() => void save(() => saveSettings(s))}>บันทึก</button>
      </div>
      <section className="card stack">
        <h2>ข้อมูลโรงแรม (หัวเอกสาร)</h2>
        <div className="grid2">
          <Field label="ชื่อโรงแรม"><input className="input" value={s.hotelName} onChange={(e) => set('hotelName', e.target.value)} /></Field>
          <Field label="ชื่อภาษาอังกฤษ"><input className="input" value={s.hotelNameEn} onChange={(e) => set('hotelNameEn', e.target.value)} /></Field>
        </div>
        <Field label="ที่อยู่"><input className="input" value={s.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <div className="grid2">
          <Field label="โทรศัพท์"><input className="input" value={s.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
          <Field label="VAT (%)"><input className="input num" value={Math.round(s.vatRate * 1000) / 10} onChange={(e) => set('vatRate', (Number(e.target.value) || 0) / 100)} /></Field>
        </div>
      </section>
      <section className="card stack">
        <h2>ห้องจัดงาน</h2>
        {s.rooms.map((r, i) => (
          <div key={i} className="row">
            <input className="input grow" value={r.name} onChange={(e) => set('rooms', s.rooms.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} />
            <input className="input" style={{ width: 110 }} placeholder="ชั้น" value={r.floor} onChange={(e) => set('rooms', s.rooms.map((x, k) => (k === i ? { ...x, floor: e.target.value } : x)))} />
            <button className="icon-btn" onClick={() => set('rooms', s.rooms.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => set('rooms', [...s.rooms, { name: '', floor: '' }])}>+ เพิ่มห้อง</button>
      </section>
      <section className="card stack">
        <h2>ตัวเลือกในฟอร์ม</h2>
        <Field label="ประเภทงาน"><TagsInput value={s.eventTypes} onChange={(v) => set('eventTypes', v)} /></Field>
        <Field label="รูปแบบการจัดโต๊ะ"><TagsInput value={s.tableLayouts} onChange={(v) => set('tableLayouts', v)} /></Field>
        <Field label="ชื่องานสำเร็จรูป (ปุ่มลัดในขั้นรายละเอียดงาน)"><TagsInput value={s.eventNamePresets ?? DEFAULT_NAME_PRESETS} onChange={(v) => set('eventNamePresets', v)} /></Field>
        <Field label="หมายเหตุสำเร็จรูป" hint="ใช้ ____ แทนช่องที่ Sales ต้องเติม เช่น ยอดมัดจำ"><TagsInput value={s.remarkPresets} onChange={(v) => set('remarkPresets', v)} /></Field>
      </section>
    </div>
  )
}
