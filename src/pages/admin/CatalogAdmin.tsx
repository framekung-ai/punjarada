import { useMemo, useState } from 'react'
import type { Category, CourseId, Cuisine, MenuItem, Service } from '../../lib/types'
import { COURSE_LABEL, CUISINE_LABEL, CUISINES } from '../../lib/types'
import { catCourse, catCuisine } from '../../lib/cuisine'
import { courseForItem } from '../../lib/menuCsv'
import { useCatalog, useReadyCatalog } from '../../lib/catalog'
import { deleteCatalogDoc, newId, saveCatalogDoc } from '../../lib/db'
import { num } from '../../lib/thai'
import { Empty, errorText, Field, Sheet, useToast , useConfirm } from '../../components/ui'

const COURSES = Object.keys(COURSE_LABEL) as CourseId[]

export function useSaver() {
  const { reload } = useCatalog()
  const toast = useToast()
  return async (fn: () => Promise<unknown>, msg = 'บันทึกแล้ว') => {
    try {
      await fn()
      await reload(true)
      toast(msg)
      return true
    } catch (e) {
      toast(`ไม่สำเร็จ: ${errorText(e)}`)
      return false
    }
  }
}

export function TagsInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [t, setT] = useState('')
  const add = () => { const v = t.trim(); if (v && !value.includes(v)) onChange([...value, v]); setT('') }
  return (
    <div className="stack" style={{ gap: 6 }}>
      <div className="chips">{value.map((x) => <span key={x} className="chip small on">{x}<button type="button" onClick={() => onChange(value.filter((y) => y !== x))} style={{ background: 'none', border: 0, color: '#fff', cursor: 'pointer' }} aria-label={`ลบ ${x}`}>×</button></span>)}</div>
      <div className="row"><input className="input" value={t} placeholder={placeholder} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} /><button type="button" className="btn" onClick={add}>เพิ่ม</button></div>
    </div>
  )
}

// ---------------- Menu items ----------------

const blankItem = (categoryId: string, course: CourseId = 'main'): MenuItem => ({
  id: '', name: '', categoryId, course, tags: [], variants: [], priceType: 'fixed', price: 0, unit: 'จาน',
  setOnly: false, active: true, sort: 9999,
})

export function MenuAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const confirm = useConfirm()
  const [q, setQ] = useState('')
  const [style, setStyle] = useState<Cuisine | 'all'>('all')
  const [cat, setCat] = useState('all')
  const [edit, setEdit] = useState<MenuItem | null>(null)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const catOf = (id: string) => catalog.categories.find((c) => c.id === id)
  const catName = (id: string) => catOf(id)?.name ?? id
  const styleOf = (m: MenuItem) => catCuisine(catOf(m.categoryId))
  const styleCats = catalog.categories.filter((c) => style === 'all' || catCuisine(c) === style)
  const list = useMemo(() => catalog.menuItems.filter((m) =>
    (style === 'all' || catCuisine(catalog.categories.find((c) => c.id === m.categoryId)) === style)
    && (cat === 'all' || (cat === 'review' ? !!m.needsReview : cat === 'setOnly' ? m.setOnly : m.categoryId === cat))
    && (!q.trim() || m.name.includes(q.trim()))), [catalog, style, cat, q])
  const newItem = () => {
    const c = styleCats[0] ?? catalog.categories[0]
    setEdit(blankItem(c?.id ?? 'main', c ? catCourse(c) : 'main'))
  }
  const reviewCount = catalog.menuItems.filter((m) => m.needsReview && (style === 'all' || styleOf(m) === style)).length

  const savePrice = async (m: MenuItem) => {
    const raw = prices[m.id]
    if (raw === undefined) return
    const p = Number(raw)
    if (!Number.isFinite(p) || p < 0 || p === m.price) { setPrices((s) => { const n = { ...s }; delete n[m.id]; return n }); return }
    const ok = await save(() => saveCatalogDoc('menuItems', m.id, { ...m, price: p }), `ราคา ${m.name} = ${num(p)}`)
    if (ok) setPrices((s) => { const n = { ...s }; delete n[m.id]; return n })
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>เมนูอาหาร <span className="muted small">({catalog.menuItems.length})</span></h1>
        <button className="btn primary" onClick={newItem}>+ เพิ่มเมนู{style !== 'all' ? CUISINE_LABEL[style] : ''}</button>
      </div>
      <div className="seg" role="tablist" aria-label="สไตล์อาหาร">
        {(['all', ...CUISINES] as (Cuisine | 'all')[]).map((k) => (
          <button key={k} role="tab" aria-selected={style === k} className={style === k ? 'on' : ''} onClick={() => { setStyle(k); setCat('all') }}>
            {k === 'all' ? 'ทุกสไตล์' : `อาหาร${CUISINE_LABEL[k]}`}
            <span className="n">{k === 'all' ? catalog.menuItems.length : catalog.menuItems.filter((m) => styleOf(m) === k).length}</span>
          </button>
        ))}
      </div>
      <input className="input" type="search" placeholder="ค้นหาเมนู" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips scroll">
        <button className={`chip small${cat === 'all' ? ' on' : ''}`} onClick={() => setCat('all')}>ทุกหมวด</button>
        {reviewCount > 0 && <button className={`chip small${cat === 'review' ? ' on' : ''}`} onClick={() => setCat('review')}>⚠ ต้องตรวจสอบ ({reviewCount})</button>}
        {styleCats.map((c) => <button key={c.id} className={`chip small${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        <button className={`chip small${cat === 'setOnly' ? ' on' : ''}`} onClick={() => setCat('setOnly')}>เฉพาะเซ็ต</button>
      </div>
      {list.length === 0 ? <Empty>ไม่พบเมนู</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>เมนู</th><th className="hide-mobile">หมวด / ประเภทจาน</th><th className="num">ราคา (บาท)</th><th>ขาย</th><th></th></tr></thead>
            <tbody>
              {list.map((m) => (
                <tr key={m.id} style={m.active ? undefined : { opacity: .5 }}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{m.name}{m.variants.length > 0 && <span className="muted"> ({m.variants.join('/')})</span>}</div>
                    <div className="row wrap" style={{ gap: 4 }}>
                      {m.tags.map((t) => <span key={t} className={`badge ${t === 'แนะนำ' ? 'gold' : 'gray'}`}>{t}</span>)}
                      {m.setOnly && <span className="badge">เฉพาะเซ็ต</span>}
                      {m.needsReview && <span className="badge danger" title={m.needsReview}>⚠ {m.needsReview}</span>}
                    </div>
                  </td>
                  <td className="hide-mobile small"><span className={`badge style-${styleOf(m)}`}>{CUISINE_LABEL[styleOf(m)]}</span> {catName(m.categoryId)}<div className="muted">{COURSE_LABEL[m.course]}</div></td>
                  <td className="num">
                    <input className="inline-input" inputMode="decimal" value={prices[m.id] ?? String(m.price)}
                      onChange={(e) => setPrices((s) => ({ ...s, [m.id]: e.target.value }))}
                      onBlur={() => void savePrice(m)} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }} />
                    <div className="small muted">{m.priceType === 'perWeight' ? '/ขีด' : `/${m.unit}`}</div>
                  </td>
                  <td><input type="checkbox" checked={m.active} onChange={() => void save(() => saveCatalogDoc('menuItems', m.id, { ...m, active: !m.active }), m.active ? 'ปิดการขายแล้ว' : 'เปิดการขายแล้ว')} aria-label="เปิดขาย" /></td>
                  <td><button className="btn small" onClick={() => setEdit(m)}>แก้ไข</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MenuItemSheet item={edit} onClose={() => setEdit(null)} onSave={async (m) => {
        const id = m.id || newId('menuItems')
        const ok = await save(() => saveCatalogDoc('menuItems', id, { ...m, id }))
        if (ok) setEdit(null)
      }} onDelete={async (m) => {
        if (!(await confirm({ title: `ลบเมนู “${m.name}”?`, message: 'เอกสารเก่ายังแสดงชื่อและราคาเดิม\nแนะนำให้ “ปิดการขาย” แทน เพื่อเปิดกลับมาได้ง่าย', confirmText: 'ลบเมนู', danger: true }))) return
        const ok = await save(() => deleteCatalogDoc('menuItems', m.id), 'ลบแล้ว')
        if (ok) setEdit(null)
      }} />
    </div>
  )
}

function MenuItemSheet({ item, onClose, onSave, onDelete }: {
  item: MenuItem | null; onClose: () => void; onSave: (m: MenuItem) => Promise<void>; onDelete: (m: MenuItem) => Promise<void>
}) {
  const catalog = useReadyCatalog()
  const [m, setM] = useState<MenuItem | null>(item)
  const [key, setKey] = useState<MenuItem | null>(item)
  if (item !== key) { setKey(item); setM(item) }
  if (!m) return null
  const set = <K extends keyof MenuItem>(k: K, v: MenuItem[K]) => setM({ ...m, [k]: v })
  return (
    <Sheet open onClose={onClose} title={m.id ? 'แก้ไขเมนู' : 'เพิ่มเมนู'}
      footer={<div className="row">
        {m.id && <button className="btn danger" onClick={() => void onDelete(m)}>ลบ</button>}
        <button className="btn primary grow" disabled={!m.name.trim()} onClick={() => { const { needsReview: _n, ...rest } = m; void _n; void onSave(rest as MenuItem) }}>บันทึก</button>
      </div>}>
      <Field label="ชื่อเมนู" required><input className="input" value={m.name} onChange={(e) => set('name', e.target.value)} /></Field>
      {m.needsReview && <div className="notice warn">{m.needsReview} — กดบันทึกเพื่อยืนยันว่าตรวจแล้ว</div>}
      <div className="grid2">
        <Field label="หมวด (กำหนดสไตล์ จีน / ไทย)" hint={`สไตล์: อาหาร${CUISINE_LABEL[catCuisine(catalog.categories.find((c) => c.id === m.categoryId))]}`}>
          <select className="input" value={m.categoryId} onChange={(e) => {
            const c = catalog.categories.find((x) => x.id === e.target.value)
            // new dish: follow the category's default dish type
            setM({ ...m, categoryId: e.target.value, ...(!m.id && c ? { course: courseForItem(m.name, catCourse(c)) } : {}) })
          }}>
            {CUISINES.map((cu) => (
              <optgroup key={cu} label={`อาหาร${CUISINE_LABEL[cu]}`}>
                {catalog.categories.filter((c) => catCuisine(c) === cu).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </optgroup>
            ))}
          </select>
        </Field>
        <Field label="ประเภทจาน (ใช้เช็กความครบของมื้อ)">
          <select className="input" value={m.course} onChange={(e) => set('course', e.target.value as CourseId)}>
            {COURSES.map((c) => <option key={c} value={c}>{COURSE_LABEL[c]}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid2">
        <Field label="แบบราคา">
          <select className="input" value={m.priceType} onChange={(e) => set('priceType', e.target.value as MenuItem['priceType'])}>
            <option value="fixed">คงที่</option><option value="perWeight">ตามน้ำหนัก (ต่อขีด)</option><option value="byOption">ตามตัวเลือก (ขนาด)</option>
          </select>
        </Field>
        <Field label={m.priceType === 'perWeight' ? 'ราคาต่อขีด (บาท)' : 'ราคา (บาท)'}>
          <input className="input num" inputMode="decimal" value={m.price} onChange={(e) => set('price', Number(e.target.value) || 0)} />
        </Field>
      </div>
      {m.priceType === 'byOption' && (
        <Field label="ตัวเลือกราคา">
          {(m.options ?? []).map((o, i) => (
            <div key={i} className="row">
              <input className="input" value={o.label} onChange={(e) => set('options', (m.options ?? []).map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} />
              <input className="input num" style={{ width: 110 }} value={o.price} onChange={(e) => set('options', (m.options ?? []).map((x, k) => (k === i ? { ...x, price: Number(e.target.value) || 0 } : x)))} />
              <button className="icon-btn" onClick={() => set('options', (m.options ?? []).filter((_, k) => k !== i))}>×</button>
            </div>
          ))}
          <button className="btn small" onClick={() => set('options', [...(m.options ?? []), { label: '', price: 0 }])}>+ ตัวเลือก</button>
        </Field>
      )}
      <Field label="หน่วย"><input className="input" value={m.unit} onChange={(e) => set('unit', e.target.value)} /></Field>
      <Field label="ตัวเลือกย่อย (เช่น หมู, ไก่ / น้ำข้น, น้ำใส)"><TagsInput value={m.variants} onChange={(v) => set('variants', v)} placeholder="พิมพ์แล้วกด Enter" /></Field>
      <Field label="แท็ก (แนะนำ, เจ, ทะเล)"><TagsInput value={m.tags} onChange={(v) => set('tags', v)} placeholder="พิมพ์แล้วกด Enter" /></Field>
      <label className="row"><input type="checkbox" checked={m.setOnly} onChange={(e) => set('setOnly', e.target.checked)} /> เมนูเฉพาะเซ็ต (ไม่แสดงให้สั่งเดี่ยว)</label>
      <label className="row"><input type="checkbox" checked={m.active} onChange={(e) => set('active', e.target.checked)} /> เปิดขาย</label>
    </Sheet>
  )
}

// ---------------- Categories ----------------

export function CategoriesAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const confirm = useConfirm()
  const [name, setName] = useState('')
  const [newStyle, setNewStyle] = useState<Cuisine>('th')
  const [newCourse, setNewCourse] = useState<CourseId>('main')
  const cats = catalog.categories
  const count = (id: string) => catalog.menuItems.filter((m) => m.categoryId === id).length
  const swap = async (a: Category, b: Category) => {
    await save(async () => {
      await saveCatalogDoc('categories', a.id, { ...a, sort: b.sort })
      await saveCatalogDoc('categories', b.id, { ...b, sort: a.sort })
    }, 'จัดลำดับแล้ว')
  }
  return (
    <div className="stack">
      <h1>หมวดหมู่อาหาร</h1>
      <div className="small muted">
        แต่ละหมวดเป็นของสไตล์เดียว (จีน หรือ ไทย) — เมนูในหมวดจะเป็นสไตล์นั้น และแสดงในแท็บ “เลือกเอง จีน / ไทย” ของ Sales ตามลำดับที่นี่ ·
        “ประเภทจานเริ่มต้น” ใช้ตั้งค่าให้เมนูใหม่ในหมวด (เช็กความครบของมื้อ)
      </div>
      {CUISINES.map((cu) => {
        const list = cats.filter((c) => catCuisine(c) === cu)
        return (
          <section key={cu} className="stack" style={{ gap: 8 }}>
            <h2><span className={`badge style-${cu}`}>{CUISINE_LABEL[cu]}</span> หมวดอาหาร{CUISINE_LABEL[cu]} <span className="small muted">({list.length})</span></h2>
            {list.length === 0 ? <div className="small muted">ยังไม่มีหมวด — เพิ่มด้านล่าง หรือนำเข้าไฟล์ CSV ที่หน้า “นำเข้าข้อมูล”</div> : (
              <div className="table-wrap">
                <table className="list">
                  <thead><tr><th>ลำดับ</th><th>ชื่อหมวด</th><th className="hide-mobile">ประเภทจานเริ่มต้น</th><th>สไตล์</th><th className="num">เมนู</th><th>แสดง</th><th></th></tr></thead>
                  <tbody>
                    {list.map((c, i) => (
                      <tr key={c.id}>
                        <td><div className="row" style={{ gap: 4 }}>
                          <button className="icon-btn" aria-label="เลื่อนขึ้น" disabled={i === 0} onClick={() => void swap(c, list[i - 1])}>▲</button>
                          <button className="icon-btn" aria-label="เลื่อนลง" disabled={i === list.length - 1} onClick={() => void swap(c, list[i + 1])}>▼</button>
                        </div></td>
                        <td><input className="input" defaultValue={c.name} aria-label="ชื่อหมวด" onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) void save(() => saveCatalogDoc('categories', c.id, { ...c, name: v })) }} /></td>
                        <td className="hide-mobile">
                          <select className="input" value={catCourse(c)} aria-label="ประเภทจานเริ่มต้น" onChange={(e) => void save(() => saveCatalogDoc('categories', c.id, { ...c, course: e.target.value as CourseId }))}>
                            {COURSES.map((k) => <option key={k} value={k}>{COURSE_LABEL[k]}</option>)}
                          </select>
                        </td>
                        <td>
                          <select className="input" style={{ width: 'auto' }} value={catCuisine(c)} aria-label="สไตล์" onChange={async (e) => {
                            const to = e.target.value as Cuisine
                            const n = count(c.id)
                            if (n > 0 && !(await confirm({ title: `เปลี่ยนหมวด “${c.name}” เป็นอาหาร${CUISINE_LABEL[to]}?`, message: `เมนู ${n} รายการในหมวดนี้จะเป็นอาหาร${CUISINE_LABEL[to]}ด้วย (เอกสารเก่าไม่เปลี่ยน)`, confirmText: 'เปลี่ยนสไตล์' }))) return
                            void save(() => saveCatalogDoc('categories', c.id, { ...c, cuisine: to }))
                          }}>
                            {CUISINES.map((k) => <option key={k} value={k}>{CUISINE_LABEL[k]}</option>)}
                          </select>
                        </td>
                        <td className="num">{count(c.id)}</td>
                        <td><input type="checkbox" checked={c.active} aria-label="แสดงให้ Sales เห็น" onChange={() => void save(() => saveCatalogDoc('categories', c.id, { ...c, active: !c.active }))} /></td>
                        <td><button className="btn small danger" disabled={count(c.id) > 0} title={count(c.id) ? 'ย้ายเมนูออกก่อน' : ''} onClick={async () => { if (await confirm({ title: `ลบหมวด “${c.name}”?`, confirmText: 'ลบหมวด', danger: true })) void save(() => deleteCatalogDoc('categories', c.id), 'ลบแล้ว') }}>ลบ</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )
      })}
      <section className="card stack">
        <h2>เพิ่มหมวดใหม่</h2>
        <div className="row wrap">
          <input className="input grow" style={{ minWidth: 180 }} placeholder="ชื่อหมวดใหม่ เช่น ต้ม - แกง" value={name} onChange={(e) => setName(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={newStyle} onChange={(e) => setNewStyle(e.target.value as Cuisine)} aria-label="สไตล์">
            {CUISINES.map((k) => <option key={k} value={k}>อาหาร{CUISINE_LABEL[k]}</option>)}
          </select>
          <select className="input" style={{ width: 'auto' }} value={newCourse} onChange={(e) => setNewCourse(e.target.value as CourseId)} aria-label="ประเภทจานเริ่มต้น">
            {COURSES.map((k) => <option key={k} value={k}>{COURSE_LABEL[k]}</option>)}
          </select>
          <button className="btn primary" disabled={!name.trim()} onClick={() => {
            const id = newId('categories')
            const doc: Omit<Category, 'id'> = { name: name.trim(), cuisine: newStyle, course: newCourse, sort: Math.max(0, ...cats.map((c) => c.sort ?? 0)) + 1, active: true }
            void save(() => saveCatalogDoc('categories', id, doc)).then(() => setName(''))
          }}>เพิ่มหมวด</button>
        </div>
      </section>
    </div>
  )
}

// ---------------- Services ----------------

export function ServicesAdmin() {
  const catalog = useReadyCatalog()
  const save = useSaver()
  const confirm = useConfirm()
  const [edit, setEdit] = useState<Service | null>(null)
  const TYPES: [Service['type'], string][] = [['music', 'ดนตรี'], ['decor', 'ตกแต่ง'], ['equipment', 'อุปกรณ์'], ['room', 'ห้องพัก'], ['overtime', 'ล่วงเวลา'], ['other', 'อื่นๆ']]
  return (
    <div className="stack">
      <div className="page-head">
        <h1>บริการ</h1>
        <button className="btn primary" onClick={() => setEdit({ id: '', name: '', type: 'other', price: 0, unit: 'รายการ', priceEditable: true, active: true, sort: 999 })}>+ เพิ่มบริการ</button>
      </div>
      <div className="small muted">ราคาเป็นบาท ยังไม่รวม VAT · ราคา 0 = ให้ Sales กรอกราคาตอนเพิ่ม · ราคานักดนตรีถูกปรับอัตโนมัติตามกฎ FOC</div>
      <div className="table-wrap">
        <table className="list">
          <thead><tr><th>บริการ</th><th className="num">ราคา</th><th>หน่วย</th><th>ใช้งาน</th><th></th></tr></thead>
          <tbody>
            {catalog.services.map((s) => (
              <tr key={s.id} style={s.active ? undefined : { opacity: .5 }}>
                <td><div style={{ fontWeight: 600 }}>{s.name}</div><div className="small muted">{TYPES.find((t) => t[0] === s.type)?.[1]}{s.priceEditable ? ' · Sales แก้ราคาได้' : ''}</div></td>
                <td className="num">{s.price ? num(s.price) : '-'}</td>
                <td>{s.unit}</td>
                <td><input type="checkbox" checked={s.active} onChange={() => void save(() => saveCatalogDoc('services', s.id, { ...s, active: !s.active }))} /></td>
                <td><button className="btn small" onClick={() => setEdit(s)}>แก้ไข</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <Sheet open onClose={() => setEdit(null)} title={edit.id ? 'แก้ไขบริการ' : 'เพิ่มบริการ'} footer={
          <div className="row">
            {edit.id && <button className="btn danger" onClick={async () => { if (await confirm({ title: `ลบบริการ “${edit.name}”?`, confirmText: 'ลบบริการ', danger: true })) void save(() => deleteCatalogDoc('services', edit.id), 'ลบแล้ว').then((ok) => ok && setEdit(null)) }}>ลบ</button>}
            <button className="btn primary grow" disabled={!edit.name.trim()} onClick={() => {
              const id = edit.id || newId('services')
              void save(() => saveCatalogDoc('services', id, edit)).then((ok) => ok && setEdit(null))
            }}>บันทึก</button>
          </div>}>
          <Field label="ชื่อบริการ" required><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></Field>
          <Field label="ประเภท">
            <div className="chips">{TYPES.map(([t, l]) => <button key={t} type="button" className={`chip small${edit.type === t ? ' on' : ''}`} onClick={() => setEdit({ ...edit, type: t })}>{l}</button>)}</div>
          </Field>
          <div className="grid2">
            <Field label="ราคา (บาท)"><input className="input num" inputMode="decimal" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) || 0 })} /></Field>
            <Field label="หน่วย"><input className="input" value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} /></Field>
          </div>
          <label className="row"><input type="checkbox" checked={edit.priceEditable} onChange={(e) => setEdit({ ...edit, priceEditable: e.target.checked })} /> ให้ Sales กรอก/แก้ราคาได้</label>
        </Sheet>
      )}
    </div>
  )
}
