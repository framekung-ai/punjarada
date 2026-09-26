import { useMemo, useState } from 'react'
import type { CourseId, DrinkKey, MenuSet, SetItem } from '../../lib/types'
import { COURSE_LABEL } from '../../lib/types'
import { useReadyCatalog } from '../../lib/catalog'
import { deleteCatalogDoc, newId, saveCatalogDoc } from '../../lib/db'
import { displayName } from '../../lib/pricing'
import { num } from '../../lib/thai'
import { Field, Sheet } from '../../components/ui'
import { useSaver } from './CatalogAdmin'

const COURSES = Object.keys(COURSE_LABEL) as CourseId[]

const blankSet = (): MenuSet => ({
  id: '', name: '', pricePerTable: 3000, servingSize: 'large', seats: '10–12 ที่', items: [], drinksText: '',
  includes: [], addOnOffers: [], visibility: 'all', note: '', active: true, sort: 99,
})

export function SetsAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const [edit, setEdit] = useState<MenuSet | null>(null)
  return (
    <div className="stack">
      <div className="page-head">
        <h1>เซ็ตเมนู</h1>
        <button className="btn primary" onClick={() => setEdit(blankSet())}>+ สร้างเซ็ต</button>
      </div>
      <div className="menu-list">
        {catalog.menuSets.map((s) => (
          <div key={s.id} className="set-card" style={s.active ? undefined : { opacity: .55 }}>
            <div className="row between"><strong>{s.name}</strong>
              <span className={`badge ${s.visibility === 'all' ? 'ok' : s.visibility === 'regularOnly' ? 'gold' : 'gray'}`}>
                {s.visibility === 'all' ? 'ทุกคน' : s.visibility === 'regularOnly' ? 'ลูกค้าประจำ' : 'ซ่อน'}
              </span>
            </div>
            <div className="price num">{num(s.pricePerTable)} <span className="small muted">บาท / โต๊ะ · {s.seats}</span></div>
            <div className="small muted">{s.items.map((i) => i.name).join(' · ')}</div>
            <div className="row">
              <button className="btn small" onClick={() => setEdit(s)}>แก้ไข</button>
              <button className="btn small" onClick={() => setEdit({ ...s, id: '', name: `${s.name} (สำเนา)` })}>คัดลอก</button>
              {!s.active && <span className="badge gray" style={{ marginLeft: 'auto' }}>ปิดใช้งาน</span>}
            </div>
          </div>
        ))}
      </div>
      {edit && <SetEditor value={edit} onClose={() => setEdit(null)}
        onSave={async (s) => { const id = s.id || newId('menuSets'); if (await save(() => saveCatalogDoc('menuSets', id, s))) setEdit(null) }}
        onDelete={async (s) => { if (window.confirm(`ลบ ${s.name}?`) && await save(() => deleteCatalogDoc('menuSets', s.id), 'ลบแล้ว')) setEdit(null) }} />}
    </div>
  )
}

function SetEditor({ value, onClose, onSave, onDelete }: {
  value: MenuSet; onClose: () => void; onSave: (s: MenuSet) => Promise<void>; onDelete: (s: MenuSet) => Promise<void>
}) {
  const catalog = useReadyCatalog()
  const [s, setS] = useState<MenuSet>(value)
  const [q, setQ] = useState('')
  const set = <K extends keyof MenuSet>(k: K, v: MenuSet[K]) => setS((x) => ({ ...x, [k]: v }))
  const matches = useMemo(() => {
    const t = q.trim()
    if (!t) return []
    return catalog.menuItems.filter((m) => m.active && m.course !== 'drink' && m.name.includes(t)).slice(0, 8)
  }, [q, catalog.menuItems])
  const alaCarte = s.items.reduce((sum, it) => sum + (catalog.menuItems.find((m) => m.id === it.menuItemId)?.price ?? 0), 0)
  const unpriced = s.items.filter((it) => !(catalog.menuItems.find((m) => m.id === it.menuItemId)?.price)).length
  const move = (i: number, d: number) => setS((x) => {
    const items = [...x.items]
    const j = i + d
    if (j < 0 || j >= items.length) return x
    ;[items[i], items[j]] = [items[j], items[i]]
    return { ...x, items }
  })
  const addItem = (mId: string, variant?: string) => {
    const m = catalog.menuItems.find((x) => x.id === mId)
    if (!m) return
    const it: SetItem = { course: m.course, menuItemId: m.id, name: variant ? `${m.name}${variant}` : m.name, ...(variant ? { variant } : {}) }
    set('items', [...s.items, it])
    setQ('')
  }
  const toggleInclude = (k: DrinkKey) => set('includes', s.includes.includes(k) ? s.includes.filter((x) => x !== k) : [...s.includes, k])

  return (
    <Sheet open onClose={onClose} title={s.id ? `แก้ไข ${value.name}` : 'สร้างเซ็ตเมนู'} footer={
      <div className="row">
        {s.id && <button className="btn danger" onClick={() => void onDelete(s)}>ลบ</button>}
        <button className="btn primary grow" disabled={!s.name.trim() || s.items.length === 0} onClick={() => void onSave(s)}>บันทึกเซ็ต</button>
      </div>}>
      <Field label="ชื่อเซ็ต" required><input className="input" value={s.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid2">
        <Field label="ราคาต่อโต๊ะ (บาท)"><input className="input num" inputMode="decimal" value={s.pricePerTable} onChange={(e) => set('pricePerTable', Number(e.target.value) || 0)} /></Field>
        <Field label="ขนาดเสิร์ฟ">
          <div className="chips">
            <button type="button" className={`chip small${s.servingSize === 'large' ? ' on' : ''}`} onClick={() => setS({ ...s, servingSize: 'large', seats: '10–12 ที่' })}>จานใหญ่ 10–12 ที่</button>
            <button type="button" className={`chip small${s.servingSize === 'medium' ? ' on' : ''}`} onClick={() => setS({ ...s, servingSize: 'medium', seats: '5–6 ที่' })}>จานกลาง 5–6 ที่</button>
          </div>
        </Field>
      </div>

      <Field label={`รายการอาหารในเซ็ต (${s.items.length})`}>
        <div className="stack" style={{ gap: 6 }}>
          {s.items.map((it, i) => (
            <div key={i} className="row card flat" style={{ padding: 8 }}>
              <span className="muted num" style={{ width: 20 }}>{i + 1}</span>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{it.name}</div>
                <select className="input" style={{ minHeight: 32, padding: '2px 8px', fontSize: '.85rem', width: 'auto' }} value={it.course}
                  onChange={(e) => set('items', s.items.map((x, k) => (k === i ? { ...x, course: e.target.value as CourseId } : x)))}>
                  {COURSES.map((c) => <option key={c} value={c}>{COURSE_LABEL[c]}</option>)}
                </select>
              </div>
              <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0}>▲</button>
              <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === s.items.length - 1}>▼</button>
              <button className="icon-btn" onClick={() => set('items', s.items.filter((_, k) => k !== i))} aria-label="ลบ">×</button>
            </div>
          ))}
          <input className="input" placeholder="🔍 พิมพ์ชื่อเมนูเพื่อเพิ่มเข้าเซ็ต" value={q} onChange={(e) => setQ(e.target.value)} />
          {matches.map((m) => (
            <div key={m.id} className="row">
              <span className="grow">{displayName(m)} <span className="small muted">{m.price ? num(m.price) : 'เฉพาะเซ็ต'}</span></span>
              {m.variants.length ? m.variants.map((v) => <button key={v} className="btn small" onClick={() => addItem(m.id, v)}>+ {v}</button>)
                : <button className="btn small" onClick={() => addItem(m.id)}>+ เพิ่ม</button>}
            </div>
          ))}
          {q.trim() && matches.length === 0 && (
            <div className="small muted">ไม่พบเมนู — เพิ่มเป็น “เมนูเฉพาะเซ็ต” ได้ที่หน้าเมนูอาหาร</div>
          )}
          <div className="notice info small">
            มูลค่าเมนูเดี่ยวรวม {num(alaCarte)} บาท{unpriced ? ` (ไม่นับ ${unpriced} เมนูที่ไม่มีราคาเดี่ยว)` : ''} · ราคาเซ็ต {num(s.pricePerTable)} บาท
            {alaCarte > s.pricePerTable ? ` · ลูกค้าประหยัด ${num(alaCarte - s.pricePerTable)} บาท` : ''}
          </div>
        </div>
      </Field>

      <Field label="เครื่องดื่มในเซ็ต (ข้อความบนเอกสาร)"><input className="input" value={s.drinksText} placeholder="เช่น เก๊กฮวย ร้อน-เย็น, น้ำดื่ม-น้ำแข็ง" onChange={(e) => set('drinksText', e.target.value)} /></Field>
      <div className="row wrap">
        <label className="row"><input type="checkbox" checked={s.includes.includes('water')} onChange={() => toggleInclude('water')} /> รวมน้ำเปล่า-น้ำแข็งแล้ว</label>
        <label className="row"><input type="checkbox" checked={s.includes.includes('chrysanthemum')} onChange={() => toggleInclude('chrysanthemum')} /> รวมเก๊กฮวยแล้ว</label>
      </div>
      <div className="small muted">ติ๊กเพื่อไม่ให้ระบบเพิ่ม FOC เครื่องดื่มซ้ำกับที่มีในเซ็ต</div>

      <Field label="สิทธิแลกซื้อราคาพิเศษ">
        {s.addOnOffers.map((o, i) => (
          <div key={i} className="row">
            <select className="input grow" value={o.menuItemId} onChange={(e) => {
              const m = catalog.menuItems.find((x) => x.id === e.target.value)
              set('addOnOffers', s.addOnOffers.map((x, k) => (k === i ? { ...x, menuItemId: e.target.value, name: m?.name ?? '' } : x)))
            }}>
              {catalog.menuItems.filter((m) => m.active && !m.setOnly).map((m) => <option key={m.id} value={m.id}>{displayName(m)} ({num(m.price)})</option>)}
            </select>
            <input className="input num" style={{ width: 100 }} value={o.specialPrice} onChange={(e) => set('addOnOffers', s.addOnOffers.map((x, k) => (k === i ? { ...x, specialPrice: Number(e.target.value) || 0 } : x)))} aria-label="ราคาพิเศษ" />
            <button className="icon-btn" onClick={() => set('addOnOffers', s.addOnOffers.filter((_, k) => k !== i))}>×</button>
          </div>
        ))}
        <button className="btn small" onClick={() => {
          const m = catalog.menuItems.find((x) => x.active && !x.setOnly)
          if (m) set('addOnOffers', [...s.addOnOffers, { menuItemId: m.id, name: m.name, specialPrice: m.price, maxQty: 1 }])
        }}>+ เพิ่มสิทธิแลกซื้อ</button>
      </Field>

      <Field label="ใครเห็นเซ็ตนี้">
        <div className="chips">
          {([['all', 'ทุกคน'], ['regularOnly', 'เฉพาะลูกค้าประจำ'], ['hidden', 'ซ่อน']] as [MenuSet['visibility'], string][]).map(([v, l]) => (
            <button key={v} type="button" className={`chip small${s.visibility === v ? ' on' : ''}`} onClick={() => set('visibility', v)}>{l}</button>
          ))}
        </div>
      </Field>
      <Field label="หมายเหตุ (Sales เห็น)"><input className="input" value={s.note} onChange={(e) => set('note', e.target.value)} /></Field>
      <label className="row"><input type="checkbox" checked={s.active} onChange={(e) => set('active', e.target.checked)} /> เปิดใช้งาน</label>
    </Sheet>
  )
}
