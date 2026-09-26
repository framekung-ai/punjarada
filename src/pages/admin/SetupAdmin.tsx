import { useState } from 'react'
import seed from '../../seed/seed.json'
import type { Catalog, MenuItem } from '../../lib/types'
import { useCatalog } from '../../lib/catalog'
import { clearCatalogCache, newId, saveCatalogDoc, seedCatalog } from '../../lib/db'
import { num } from '../../lib/thai'
import { errorText, useToast } from '../../components/ui'

const seedData = seed as unknown as Omit<Catalog, 'version'> & { importNotes: string[] }

/** Map from the "ประเภท" column of the hotel CSV to our category ids */
const FILE_CAT: Record<string, string> = {
  'ออเดิร์ฟ': 'appetizer', 'ปลา': 'fish', 'ผัก': 'veg', 'ยำ': 'yum', 'ซุป': 'soup', 'กุ้ง': 'shrimp', 'ปู': 'crab',
  'ของหวาน': 'dessert', 'เครื่องดื่ม': 'drink', 'ข้าวราด': 'rice', 'อาหารเจ': 'veg', 'เมนูแนะนำ': 'main',
}

interface CsvRow { name: string; type: string; price: string }
type Change = { kind: 'price'; item: MenuItem; price: number } | { kind: 'new'; row: CsvRow; price: number }

function parseCsv(text: string): CsvRow[] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let q = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++
      cur.push(field); rows.push(cur); cur = []; field = ''
    } else field += ch
  }
  if (field || cur.length) { cur.push(field); rows.push(cur) }
  const [head, ...body] = rows.filter((r) => r.some((c) => c.trim()))
  const idx = (n: string) => head.findIndex((h) => h.replace(/^﻿/, '').trim().startsWith(n))
  const iName = idx('รายการ'), iType = idx('ประเภท'), iPrice = idx('ราคา')
  if (iName < 0 || iPrice < 0) throw new Error('ไฟล์ต้องมีคอลัมน์ “รายการ” และ “ราคา”')
  return body.map((r) => ({ name: (r[iName] ?? '').trim(), type: (r[iType] ?? '').trim(), price: (r[iPrice] ?? '').trim() })).filter((r) => r.name)
}

export function SetupAdmin() {
  const { catalog, empty, reload } = useCatalog()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)
  const [changes, setChanges] = useState<Change[] | null>(null)
  const [skipped, setSkipped] = useState<string[]>([])

  const install = async () => {
    if (!empty && !window.confirm('ข้อมูลเมนู/เซ็ต/บริการ/กฎ FOC/ตั้งค่า ที่มี id เดียวกันจะถูกเขียนทับด้วยข้อมูลเริ่มต้น ดำเนินการต่อ?')) return
    setBusy('install')
    try {
      await seedCatalog(seedData, (d, t) => setBusy(`install ${d}/${t}`))
      clearCatalogCache()
      await reload(true)
      toast('ติดตั้งข้อมูลเริ่มต้นแล้ว')
    } catch (e) { toast(errorText(e)) } finally { setBusy(null) }
  }

  const onFile = async (f: File) => {
    try {
      const rows = parseCsv(await f.text())
      const items = catalog?.menuItems ?? []
      const norm = (s: string) => s.replace(/\s+/g, '')
      const out: Change[] = []
      const skip: string[] = []
      const seen = new Set<string>()
      for (const r of rows) {
        const key = norm(r.name)
        if (seen.has(key)) continue
        seen.add(key)
        if (!/^\d+(\.\d+)?$/.test(r.price)) { skip.push(`${r.name} (ราคา “${r.price}”)`); continue }
        const price = Number(r.price)
        const hit = items.find((m) => norm(m.name) === key || norm(m.name + m.variants.join('/')) === key.replace(/\//g, '/'))
        if (hit) { if (hit.price !== price) out.push({ kind: 'price', item: hit, price }) }
        else out.push({ kind: 'new', row: r, price })
      }
      setChanges(out)
      setSkipped(skip)
    } catch (e) { toast(errorText(e)) }
  }

  const apply = async () => {
    if (!changes) return
    setBusy('apply')
    try {
      for (const c of changes) {
        if (c.kind === 'price') await saveCatalogDoc('menuItems', c.item.id, { ...c.item, price: c.price })
        else {
          const cat = FILE_CAT[c.row.type] ?? 'main'
          const m: Omit<MenuItem, 'id'> = { name: c.row.name, categoryId: cat, course: (cat === 'shrimp' || cat === 'crab' ? 'main' : cat) as MenuItem['course'], tags: c.row.type === 'อาหารเจ' ? ['เจ'] : [], variants: [], priceType: 'fixed', price: c.price, unit: 'จาน', setOnly: false, active: true, sort: 9000, needsReview: 'เพิ่มจาก CSV — ตรวจหมวด/ประเภทจาน' }
          await saveCatalogDoc('menuItems', newId('menuItems'), m)
        }
      }
      await reload(true)
      toast(`อัปเดต ${changes.length} รายการแล้ว`)
      setChanges(null)
    } catch (e) { toast(errorText(e)) } finally { setBusy(null) }
  }

  const exportCsv = () => {
    if (!catalog) return
    const cat = (id: string) => catalog.categories.find((c) => c.id === id)?.name ?? id
    const rows = [['รายการ', 'ประเภท', 'ราคา (บาท)'], ...catalog.menuItems.filter((m) => !m.setOnly).map((m) => [m.variants.length ? `${m.name}${m.variants.join(' / ')}` : m.name, cat(m.categoryId), m.priceType === 'perWeight' ? `ขีดละ ${m.price}` : String(m.price)])]
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = 'เมนูปัญจดารา.csv'
    a.click()
  }

  return (
    <div className="stack">
      <h1>นำเข้าข้อมูล</h1>

      <section className="card stack">
        <h2>1. ข้อมูลเริ่มต้น</h2>
        <div>
          เมนู {seedData.menuItems.length} รายการ (จากไฟล์ “อาหารปัญจดารา - อาหาร.csv” ที่รวมรายการซ้ำและแก้คำผิดแล้ว),
          เซ็ต {seedData.menuSets.length} ชุด, บริการ {seedData.services.length} รายการ, กฎ FOC {seedData.focRules.length} ข้อ,
          ห้องจัดงาน {seedData.settings.rooms.length} ห้อง
        </div>
        <details>
          <summary className="small" style={{ cursor: 'pointer' }}>สิ่งที่ปรับจากไฟล์เดิม ({seedData.importNotes.length})</summary>
          <ul className="small">{seedData.importNotes.map((n) => <li key={n}>{n}</li>)}</ul>
        </details>
        {empty ? (
          <button className="btn primary big" disabled={!!busy} onClick={() => void install()}>{busy ? `กำลังติดตั้ง… ${busy.split(' ')[1] ?? ''}` : 'ติดตั้งข้อมูลเริ่มต้น'}</button>
        ) : (
          <div className="row wrap">
            <span className="badge ok">ติดตั้งแล้ว</span>
            <button className="btn small danger" disabled={!!busy} onClick={() => void install()}>ติดตั้งซ้ำ (เขียนทับ)</button>
          </div>
        )}
        <div className="small muted">ใช้การเขียนประมาณ {seedData.menuItems.length + 30} ครั้ง ครั้งเดียว (โควตาฟรี 20,000 ครั้ง/วัน)</div>
      </section>

      {!empty && (
        <section className="card stack">
          <h2>2. อัปเดตราคาจากไฟล์ CSV</h2>
          <div className="small muted">ใช้ไฟล์รูปแบบเดียวกับ “อาหารปัญจดารา - อาหาร.csv” (คอลัมน์ รายการ, ประเภท, ราคา) — ระบบจะแสดงรายการที่เปลี่ยนให้ตรวจก่อนบันทึก</div>
          <input type="file" accept=".csv,text/csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f) }} />
          {changes && (
            <div className="stack">
              {changes.length === 0 ? <div className="notice ok">ราคาตรงกับระบบทั้งหมด ไม่มีอะไรต้องเปลี่ยน</div> : (
                <div className="table-wrap">
                  <table className="list">
                    <thead><tr><th>รายการ</th><th>การเปลี่ยนแปลง</th></tr></thead>
                    <tbody>{changes.map((c, i) => (
                      <tr key={i}>
                        <td>{c.kind === 'price' ? c.item.name : c.row.name}</td>
                        <td>{c.kind === 'price' ? <>ราคา {num(c.item.price)} → <strong>{num(c.price)}</strong></> : <span className="badge gold">เมนูใหม่ {num(c.price)} ({c.row.type})</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              )}
              {skipped.length > 0 && <div className="notice warn small">ข้ามรายการที่ราคาไม่ใช่ตัวเลข: {skipped.join(', ')} — แก้ในหน้าเมนูอาหาร</div>}
              {changes.length > 0 && <button className="btn primary" disabled={!!busy} onClick={() => void apply()}>{busy === 'apply' ? 'กำลังบันทึก…' : `บันทึก ${changes.length} รายการ`}</button>}
            </div>
          )}
          <button className="btn small" onClick={exportCsv}>ส่งออกเมนูปัจจุบันเป็น CSV</button>
        </section>
      )}

      <section className="card stack">
        <h2>3. แคชข้อมูลในเครื่องนี้</h2>
        <div className="small muted">แอปเก็บเมนูไว้ในเครื่องเพื่อประหยัดโควตา และจะโหลดใหม่เองเมื่อ Admin แก้ไขข้อมูล กดปุ่มนี้เมื่อข้อมูลดูไม่ตรง</div>
        <button className="btn small" onClick={() => { clearCatalogCache(); void reload(true).then(() => toast('โหลดข้อมูลใหม่แล้ว')) }}>ล้างแคชและโหลดใหม่</button>
      </section>
    </div>
  )
}
