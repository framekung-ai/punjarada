import { useState } from 'react'
import seed from '../../seed/seed.json'
import thaiMenuCsv from '../../../data/import-menu-thai.csv?raw'
import thaiSetsCsv from '../../../data/import-sets-thai.csv?raw'
import type { Catalog, Cuisine } from '../../lib/types'
import { CUISINE_LABEL, CUISINES } from '../../lib/types'
import { useCatalog } from '../../lib/catalog'
import { catCuisine, setCuisine } from '../../lib/cuisine'
import { clearCatalogCache, newId, saveCatalogDocs, saveSettings, seedCatalog } from '../../lib/db'
import {
  detectKind, exportMenuCsv, exportSetsCsv, parseCsv, parseMenuRows, parseSetRows, planImport, planSize,
  type ImportPlan, type MenuRow, type SetRow,
} from '../../lib/menuCsv'
import { num } from '../../lib/thai'
import { errorText, useConfirm, useToast } from '../../components/ui'

const seedData = seed as unknown as Omit<Catalog, 'version'> & { importNotes: string[] }

function download(name: string, text: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

export function SetupAdmin() {
  const { catalog, empty, reload } = useCatalog()
  const toast = useToast()
  const confirm = useConfirm()
  const [busy, setBusy] = useState<string | null>(null)
  const [plan, setPlan] = useState<ImportPlan | null>(null)
  const [source, setSource] = useState('')
  const [fallback, setFallback] = useState<Cuisine>('cn')
  const install = async () => {
    if (!empty && !(await confirm({ title: 'ติดตั้งข้อมูลเริ่มต้นซ้ำ?', message: 'เมนู เซ็ต บริการ กฎ FOC และการตั้งค่าที่แก้ไว้ จะถูกเขียนทับด้วยข้อมูลเริ่มต้น', confirmText: 'เขียนทับ', danger: true, requireText: 'ยืนยัน' }))) return
    setBusy('install')
    try {
      await seedCatalog(seedData, (d, t) => setBusy(`install ${d}/${t}`))
      clearCatalogCache()
      await reload(true)
      toast('ติดตั้งข้อมูลเริ่มต้นแล้ว')
    } catch (e) { toast(errorText(e)) } finally { setBusy(null) }
  }

  /** read one or more CSV texts (menu and/or set files) and show what would change */
  const preview = (files: { name: string; text: string }[], label: string) => {
    if (!catalog) return
    try {
      const menu: MenuRow[] = []
      const sets: SetRow[] = []
      const skipped: string[] = []
      for (const f of files) {
        const rows = parseCsv(f.text)
        const kind = detectKind(rows)
        if (kind === 'menu') { const r = parseMenuRows(rows, fallback); menu.push(...r.rows); skipped.push(...r.skipped) }
        else if (kind === 'sets') { const r = parseSetRows(rows, fallback); sets.push(...r.rows); skipped.push(...r.skipped) }
        else throw new Error(`${f.name}: ไม่รู้จักรูปแบบไฟล์ — ต้องมีคอลัมน์ “รายการ, ราคา” (เมนู) หรือ “ชุด, รายการอาหาร” (เซ็ต)`)
      }
      setPlan(planImport(catalog, { menu, sets, skipped }, (k) => newId(k)))
      setSource(label)
    } catch (e) { toast(errorText(e)) }
  }

  const onFiles = async (list: FileList | null) => {
    if (!list?.length) return
    const files = await Promise.all([...list].map(async (f) => ({ name: f.name, text: await f.text() })))
    preview(files, files.map((f) => f.name).join(', '))
  }

  const apply = async () => {
    if (!plan || !catalog) return
    setBusy('apply')
    try {
      const ops = [
        ...plan.categories.map((c) => ({ name: 'categories' as const, id: c.id, data: c })),
        ...[...plan.newItems, ...plan.updatedItems].map((x) => ({ name: 'menuItems' as const, id: x.item.id, data: x.item })),
        ...[...plan.newSets, ...plan.updatedSets].map((x) => ({ name: 'menuSets' as const, id: x.set.id, data: x.set })),
      ]
      await saveCatalogDocs(ops)
      if (plan.addThaiTemplate) await saveSettings({ ...catalog.settings, mealTemplates: [...catalog.settings.mealTemplates, plan.addThaiTemplate] })
      await reload(true)
      toast(`บันทึก ${planSize(plan)} รายการแล้ว`)
      setPlan(null)
    } catch (e) { toast(errorText(e)) } finally { setBusy(null) }
  }

  const thaiCount = catalog ? {
    items: catalog.menuItems.filter((m) => catCuisine(catalog.categories.find((c) => c.id === m.categoryId)) === 'th').length,
    sets: catalog.menuSets.filter((x) => setCuisine(x) === 'th').length,
  } : { items: 0, sets: 0 }

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

      {!empty && catalog && (
        <section className="card stack">
          <h2>2. เมนูอาหารไทย</h2>
          <div className="small">
            เมนูเลือกเองไทยจากไฟล์ “อาหารปัญจดารา - อาหารไทย.csv” (88 เมนู, 8 หมวด) และเซ็ตเมนูไทย 9 ชุดจากภาพใน Set_Thai
            (ชุดอาหารไทย A–F ห้องอาหารสุพรรณหงส์ 2,500 บาท/โต๊ะ และชุดอาหารไทยประชุม A–C 2,000 บาท/โต๊ะ) — เมนูจีนเดิมไม่ถูกแก้ไข
          </div>
          <div className="row wrap">
            {thaiCount.items + thaiCount.sets > 0
              ? <span className="badge ok">มีเมนูไทย {thaiCount.items} รายการ · เซ็ตไทย {thaiCount.sets} ชุด</span>
              : <span className="badge gray">ยังไม่มีเมนูไทย</span>}
            <button className="btn primary" disabled={!!busy} onClick={() => preview([{ name: 'import-menu-thai.csv', text: thaiMenuCsv }, { name: 'import-sets-thai.csv', text: thaiSetsCsv }], 'เมนูอาหารไทย (ไฟล์ในระบบ)')}>
              {thaiCount.items + thaiCount.sets > 0 ? 'ตรวจ / อัปเดตเมนูไทย' : 'ติดตั้งเมนูอาหารไทย'}
            </button>
            <button className="btn small" onClick={() => download('นำเข้า - เมนูอาหารไทย.csv', thaiMenuCsv)}>ดาวน์โหลดไฟล์เมนูไทย</button>
            <button className="btn small" onClick={() => download('นำเข้า - เซ็ตเมนูไทย.csv', thaiSetsCsv)}>ดาวน์โหลดไฟล์เซ็ตไทย</button>
          </div>
        </section>
      )}

      {!empty && catalog && (
        <section className="card stack">
          <h2>3. นำเข้า / อัปเดตจากไฟล์ CSV</h2>
          <div className="small muted">
            เลือกได้หลายไฟล์พร้อมกัน ระบบดูจากหัวตารางเองว่าเป็นไฟล์เมนูหรือไฟล์เซ็ต แล้วแสดงสิ่งที่จะเปลี่ยนให้ตรวจก่อนบันทึก
            (เพิ่ม / แก้ไขเท่านั้น ไม่ลบเมนูที่ไม่มีในไฟล์)
          </div>
          <details className="small">
            <summary style={{ cursor: 'pointer' }}>รูปแบบไฟล์</summary>
            <ul>
              <li><strong>เมนู:</strong> รายการ, สไตล์ (จีน/ไทย), หมวด, ราคา (บาท), หน่วย, ตัวเลือก (เช่น หมู / ไก่), แท็ก (เช่น แนะนำ, เจ)
                — ราคาแบบขนาด ใส่ “20 / 50”, ราคาตามน้ำหนัก ใส่ “ขีดละ 400”</li>
              <li><strong>เซ็ต:</strong> ชุด, สไตล์, ราคาต่อโต๊ะ (บาท), ที่นั่ง, เครื่องดื่ม, รายการอาหาร (คั่นด้วย | ), หมายเหตุ</li>
              <li>ชื่อเดียวกันแต่คนละสไตล์ = คนละเมนู (เช่น ยำวุ้นเส้น จีน / ไทย) · หมวดที่ยังไม่มีจะถูกสร้างให้</li>
              <li>ไฟล์รูปแบบเดิมของโรงแรม (รายการ, ประเภท, ราคา) ใช้ได้ — เลือกสไตล์ด้านล่าง</li>
            </ul>
          </details>
          <div className="row wrap">
            <label className="small">ไฟล์ที่ไม่มีคอลัมน์ “สไตล์” ให้ถือเป็น</label>
            <select className="input" style={{ width: 'auto' }} value={fallback} onChange={(e) => setFallback(e.target.value as Cuisine)}>
              {CUISINES.map((k) => <option key={k} value={k}>อาหาร{CUISINE_LABEL[k]}</option>)}
            </select>
          </div>
          <input type="file" accept=".csv,text/csv" multiple onChange={(e) => { void onFiles(e.target.files); e.target.value = '' }} aria-label="เลือกไฟล์ CSV" />
          <div className="row wrap">
            <button className="btn small" onClick={() => download('เมนูปัญจดารา.csv', exportMenuCsv(catalog))}>ส่งออกเมนูทั้งหมด (CSV)</button>
            <button className="btn small" onClick={() => download('เซ็ตเมนูปัญจดารา.csv', exportSetsCsv(catalog))}>ส่งออกเซ็ตเมนู (CSV)</button>
          </div>
        </section>
      )}

      {plan && (
        <section className="card stack import-preview" aria-live="polite">
          <div className="row between wrap">
            <h2>ตรวจก่อนบันทึก</h2>
            <span className="small muted">{source}</span>
          </div>
          <div className="row wrap">
            {plan.categories.length > 0 && <span className="badge">หมวดใหม่ {plan.categories.length}</span>}
            {plan.newItems.length > 0 && <span className="badge ok">เมนูใหม่ {plan.newItems.length}</span>}
            {plan.updatedItems.length > 0 && <span className="badge gold">แก้ไขเมนู {plan.updatedItems.length}</span>}
            {plan.newSets.length > 0 && <span className="badge ok">เซ็ตใหม่ {plan.newSets.length}</span>}
            {plan.updatedSets.length > 0 && <span className="badge gold">แก้ไขเซ็ต {plan.updatedSets.length}</span>}
            {plan.unchanged > 0 && <span className="badge gray">ตรงกับระบบแล้ว {plan.unchanged}</span>}
            {plan.addThaiTemplate && <span className="badge">+ โครงมื้ออาหารไทย</span>}
          </div>
          {planSize(plan) === 0 && <div className="notice ok">ข้อมูลตรงกับระบบทั้งหมด ไม่มีอะไรต้องเปลี่ยน</div>}
          {plan.categories.length > 0 && (
            <details open><summary>หมวดใหม่ ({plan.categories.length})</summary>
              <div className="chips" style={{ marginTop: 6 }}>{plan.categories.map((c) => <span key={c.id} className="chip small">{c.name} · {CUISINE_LABEL[catCuisine(c)]}</span>)}</div>
            </details>
          )}
          {plan.newItems.length > 0 && (
            <details><summary>เมนูใหม่ ({plan.newItems.length})</summary>
              <div className="table-wrap" style={{ marginTop: 6 }}>
                <table className="list">
                  <thead><tr><th>เมนู</th><th>หมวด</th><th className="num">ราคา</th></tr></thead>
                  <tbody>{plan.newItems.map(({ item }) => {
                    const c = [...catalog!.categories, ...plan.categories].find((x) => x.id === item.categoryId)
                    return (
                      <tr key={item.id}>
                        <td>{item.name}{item.variants.length > 0 && <span className="muted"> ({item.variants.join('/')})</span>}</td>
                        <td className="small"><span className={`badge style-${catCuisine(c)}`}>{CUISINE_LABEL[catCuisine(c)]}</span> {c?.name}</td>
                        <td className="num">{item.options?.length ? item.options.map((o) => num(o.price)).join(' / ') : num(item.price)}</td>
                      </tr>
                    )
                  })}</tbody>
                </table>
              </div>
            </details>
          )}
          {plan.updatedItems.length > 0 && (
            <details open><summary>แก้ไขเมนู ({plan.updatedItems.length})</summary>
              <ul className="small">{plan.updatedItems.map(({ item, changes }) => <li key={item.id}><strong>{item.name}</strong> — {changes.join(', ')}</li>)}</ul>
            </details>
          )}
          {[...plan.newSets, ...plan.updatedSets].length > 0 && (
            <details open><summary>เซ็ตเมนู ({plan.newSets.length + plan.updatedSets.length})</summary>
              <div className="menu-list" style={{ marginTop: 6 }}>
                {[...plan.newSets, ...plan.updatedSets].map(({ set, before, changes }) => (
                  <div key={set.id} className="set-card">
                    <div className="row between"><strong>{set.name}</strong><span className={`badge ${before ? 'gold' : 'ok'}`}>{before ? `แก้ไข: ${changes.join(', ')}` : 'ใหม่'}</span></div>
                    <div className="price num">{num(set.pricePerTable)} <span className="small muted">บาท / โต๊ะ{set.seats ? ` · ${set.seats}` : ''} · {CUISINE_LABEL[setCuisine(set)]}</span></div>
                    <div className="small muted">{set.items.map((i) => i.name).join(' · ')}</div>
                    {set.drinksText && <div className="small">เครื่องดื่ม: {set.drinksText}</div>}
                  </div>
                ))}
              </div>
            </details>
          )}
          {plan.skipped.length > 0 && <div className="notice warn small">ข้าม {plan.skipped.length} แถว: {plan.skipped.join(', ')}</div>}
          <div className="row">
            <button className="btn" onClick={() => setPlan(null)}>ยกเลิก</button>
            {planSize(plan) > 0 && <button className="btn primary grow" disabled={!!busy} onClick={() => void apply()}>{busy === 'apply' ? 'กำลังบันทึก…' : `บันทึก ${planSize(plan)} รายการ`}</button>}
          </div>
        </section>
      )}

      <section className="card stack">
        <h2>4. แคชข้อมูลในเครื่องนี้</h2>
        <div className="small muted">แอปเก็บเมนูไว้ในเครื่องเพื่อประหยัดโควตา และจะโหลดใหม่เองเมื่อ Admin แก้ไขข้อมูล กดปุ่มนี้เมื่อข้อมูลดูไม่ตรง</div>
        <button className="btn small" onClick={() => { clearCatalogCache(); void reload(true).then(() => toast('โหลดข้อมูลใหม่แล้ว')) }}>ล้างแคชและโหลดใหม่</button>
      </section>
    </div>
  )
}
