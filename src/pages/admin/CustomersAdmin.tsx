import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Pencil, Phone, RefreshCw, Trash2, X } from 'lucide-react'
import type { Beo, CustomerRecord } from '../../lib/types'
import { deleteCustomers, findCustomer, listBeosByPhone, listCustomers, recountAllCustomers, recountCustomers, updateCustomer } from '../../lib/db'
import { jobCounts, phoneDigits, validCustomerPhone } from '../../lib/customers'
import { EventTitle } from '../../components/EventTitle'
import { money, phoneFormat, thaiDate } from '../../lib/thai'
import { Empty, errorText, Field, Sheet, Spinner, StatusBadge, useConfirm, useToast } from '../../components/ui'

const keyOf = (c: CustomerRecord) => c.id ?? c.phone

/** Admin: find a customer by name / phone / organisation, call back, see their events, delete one or many. */
export function CustomersAdmin() {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [deleting, setDeleting] = useState(false)
  const [list, setList] = useState<CustomerRecord[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<CustomerRecord | null>(null)
  const [beos, setBeos] = useState<Beo[] | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<{ name: string; phone: string; organization: string; syncBeos: boolean } | null>(null)
  const [saving, setSaving] = useState(false)
  const [recounting, setRecounting] = useState(false)

  const reloadList = () => listCustomers().then(setList).catch((e) => setErr(errorText(e)))
  useEffect(() => { void reloadList() }, [])

  /** Admin: fix every customer's job count from the BEOs that really exist */
  const recountAll = async () => {
    setRecounting(true)
    try {
      const n = await recountAllCustomers()
      await reloadList()
      toast(n ? `แก้จำนวนงานให้ถูกต้องแล้ว ${n} ราย` : 'จำนวนงานถูกต้องทุกรายแล้ว')
    } catch (e) { toast(errorText(e)) } finally { setRecounting(false) }
  }

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    const digits = t.replace(/\D/g, '')
    return (list ?? []).filter((c) => !t
      || c.name.toLowerCase().includes(t)
      || (c.organization ?? '').toLowerCase().includes(t)
      || (c.contactName ?? '').toLowerCase().includes(t)
      || (digits.length >= 3 && (c.phone.replace(/\D/g, '').includes(digits) || (c.contactPhone ?? '').replace(/\D/g, '').includes(digits))))
  }, [list, q])

  const allShownSelected = shown.length > 0 && shown.every((c) => selected.has(keyOf(c)))
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s)
    if (allShownSelected) shown.forEach((c) => n.delete(keyOf(c)))
    else shown.forEach((c) => n.add(keyOf(c)))
    return n
  })

  const openCustomer = (c: CustomerRecord) => {
    setOpen(c)
    setEditing(null)
    setBeos(null)
    listBeosByPhone(c.phone).then((bs) => {
      setBeos(bs)
      // the stored count can be out of date (e.g. a BEO was deleted) → correct it from the real BEOs
      const n = jobCounts(bs).get(phoneDigits(c.phone)) ?? 0
      if (n !== c.beoCount) {
        void recountCustomers([c.phone]).catch(() => {})
        setList((l) => (l ?? []).map((x) => (keyOf(x) === keyOf(c) ? { ...x, beoCount: n } : x)))
        setOpen((o) => (o && keyOf(o) === keyOf(c) ? { ...o, beoCount: n } : o))
      }
    }).catch(() => setBeos([]))
  }

  const startEdit = () => open && setEditing({ name: open.name, phone: phoneDigits(open.phone), organization: open.organization ?? '', syncBeos: true })

  const saveEdit = async () => {
    if (!open || !editing) return
    const name = editing.name.trim()
    const phone = phoneDigits(editing.phone)
    if (!name) { toast('กรอกชื่อลูกค้า'); return }
    if (!validCustomerPhone(phone)) { toast('เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก'); return }
    const oldId = keyOf(open)
    if (phone !== oldId) {
      const other = await findCustomer(phone).catch(() => null)
      if (other && !(await confirm({
        title: 'เบอร์นี้มีในรายชื่อลูกค้าแล้ว',
        message: `${phoneFormat(phone)} เป็นของ “${other.name}” — ถ้าบันทึก จะรวมเป็นลูกค้ารายเดียวกันโดยใช้ชื่อ “${name}”`,
        confirmText: 'รวมเป็นรายเดียวกัน',
      }))) return
    }
    setSaving(true)
    try {
      const ids = editing.syncBeos ? (beos ?? []).map((b) => b.id!).filter(Boolean) : []
      const newId = await updateCustomer(oldId, { name, phone, organization: editing.organization }, ids)
      const fresh = await listCustomers()
      setList(fresh)
      const now = fresh.find((x) => keyOf(x) === newId) ?? null
      setEditing(null)
      if (now) openCustomer(now); else setOpen(null)
      toast(ids.length ? `บันทึกแล้ว — อัปเดตเอกสาร BEO ${ids.length} ใบด้วย` : 'บันทึกข้อมูลลูกค้าแล้ว')
    } catch (e) { toast(`บันทึกไม่สำเร็จ: ${errorText(e)}`) } finally { setSaving(false) }
  }

  /** delete one or many customers (directory only — BEO documents stay) */
  const remove = async (targets: CustomerRecord[]) => {
    if (!targets.length) return
    const one = targets.length === 1 ? targets[0] : null
    const beoCount = targets.reduce((s, c) => s + (c.beoCount || 0), 0)
    const ok = await confirm({
      title: one ? `ลบข้อมูลลูกค้า “${one.name}”?` : `ลบข้อมูลลูกค้า ${targets.length} รายการ?`,
      message: (
        <>
          {one ? <div>{phoneFormat(one.phone)}{one.organization ? ` · ${one.organization}` : ''}</div> : (
            <ul>{targets.slice(0, 8).map((c) => <li key={keyOf(c)}>{c.name} · {phoneFormat(c.phone)}</li>)}{targets.length > 8 && <li>และอีก {targets.length - 8} รายการ</li>}</ul>
          )}
          <p style={{ marginBottom: 0 }}>
            {beoCount > 0 ? `เอกสาร BEO ${beoCount} ใบของลูกค้า${one ? 'นี้' : 'เหล่านี้'}จะไม่ถูกลบ และยังเปิดดูได้ตามปกติ · ` : ''}
            ถ้าลูกค้าจองงานใหม่ ระบบจะบันทึกรายชื่อกลับมาอัตโนมัติ
          </p>
        </>
      ),
      confirmText: one ? 'ลบข้อมูลลูกค้า' : `ลบ ${targets.length} รายการ`,
      danger: true,
    })
    if (!ok) return
    setDeleting(true)
    try {
      const ids = targets.map(keyOf)
      await deleteCustomers(ids)
      const gone = new Set(ids)
      setList((l) => (l ?? []).filter((x) => !gone.has(keyOf(x))))
      setSelected((s) => { const n = new Set(s); ids.forEach((id) => n.delete(id)); return n })
      setOpen(null)
      toast(one ? 'ลบข้อมูลลูกค้าแล้ว' : `ลบข้อมูลลูกค้า ${ids.length} รายการแล้ว`)
    } catch (e) {
      toast(`ลบไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setDeleting(false)
    }
  }

  const tel = (p: string) => `tel:${p.replace(/\D/g, '')}`
  const selectedList = (list ?? []).filter((c) => selected.has(keyOf(c)))

  return (
    <div className="stack">
      <div className="page-head">
        <h1>ลูกค้า <span className="small muted">({list?.length ?? 0})</span></h1>
        <button className="btn small" disabled={recounting || !list} onClick={() => void recountAll()} title="นับจำนวนงานของลูกค้าทุกรายใหม่จากเอกสาร BEO ที่มีอยู่จริง">
          <RefreshCw size={16} aria-hidden className={recounting ? 'spin' : undefined} /> {recounting ? 'กำลังนับ…' : 'นับจำนวนงานใหม่'}
        </button>
      </div>
      <input className="input" type="search" placeholder="ค้นหา ชื่อลูกค้า / เบอร์โทร / หน่วยงาน / ผู้ประสานงาน" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />

      {selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="รายการที่เลือก">
          <strong>เลือก {selected.size} รายการ</strong>
          <button className="btn small" onClick={() => setSelected(new Set())}><X size={16} aria-hidden /> ล้างที่เลือก</button>
          <button className="btn small danger-solid" style={{ marginLeft: 'auto' }} disabled={deleting} onClick={() => void remove(selectedList)}>
            <Trash2 size={16} aria-hidden /> {deleting ? 'กำลังลบ…' : `ลบ ${selected.size} รายการ`}
          </button>
        </div>
      )}

      {err && <div className="notice warn">{err}</div>}
      {!list && !err ? <Spinner /> : shown.length === 0 ? <Empty>{q ? 'ไม่พบลูกค้า' : 'ยังไม่มีข้อมูลลูกค้า — ระบบจะบันทึกให้อัตโนมัติเมื่อมีการส่ง BEO'}</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr>
              <th className="sel"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="เลือกทั้งหมดที่แสดง" /></th>
              <th>ลูกค้า</th><th>ติดต่อกลับ</th><th className="hide-mobile">ผู้ประสานงาน</th><th className="num">งาน</th>
            </tr></thead>
            <tbody>
              {shown.map((c) => {
                const k = keyOf(c)
                return (
                  <tr key={k} className={`click${selected.has(k) ? ' selected' : ''}`} onClick={() => openCustomer(c)}>
                    <td className="sel" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={selected.has(k)} onChange={() => toggle(k)} aria-label={`เลือก ${c.name}`} />
                    </td>
                    <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.organization && <div className="small muted">{c.organization}</div>}</td>
                    <td><a className="btn small" href={tel(c.phone)} onClick={(e) => e.stopPropagation()}><Phone size={15} aria-hidden /> {phoneFormat(c.phone)}</a></td>
                    <td className="hide-mobile small">{c.contactName}{c.contactPhone && <div><a href={tel(c.contactPhone)} onClick={(e) => e.stopPropagation()}>{phoneFormat(c.contactPhone)}</a></div>}</td>
                    <td className="num">{c.beoCount}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="small muted">ติ๊กช่องหน้าชื่อเพื่อเลือกหลายรายการ · ติ๊กช่องบนหัวตารางเพื่อเลือกทั้งหมดที่แสดงอยู่ (ใช้ร่วมกับช่องค้นหาได้)</div>

      <Sheet open={!!open} onClose={() => { setOpen(null); setEditing(null) }} title={editing ? 'แก้ไขข้อมูลลูกค้า' : open?.name}
        footer={open && (editing ? (
          <div className="row">
            <button className="btn" disabled={saving} onClick={() => setEditing(null)}>ยกเลิก</button>
            <button className="btn primary grow" disabled={saving} onClick={() => void saveEdit()}>{saving ? 'กำลังบันทึก…' : 'บันทึก'}</button>
          </div>
        ) : (
          <div className="row">
            <button className="btn danger" disabled={deleting} onClick={() => void remove([open])}>
              <Trash2 size={17} aria-hidden /> {deleting ? 'กำลังลบ…' : 'ลบข้อมูลลูกค้า'}
            </button>
            <button className="btn primary" style={{ marginLeft: 'auto' }} onClick={startEdit}><Pencil size={17} aria-hidden /> แก้ไข</button>
          </div>
        ))}>
        {open && editing && (
          <div className="stack">
            <Field label="ชื่อลูกค้า" required>
              <input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} autoFocus />
            </Field>
            <Field label="เบอร์โทรศัพท์" required hint="ใส่เฉพาะตัวเลข 9–10 หลัก — ระบบเว้นขีดให้เอง">
              <input className="input" inputMode="tel" value={phoneFormat(editing.phone)} onChange={(e) => setEditing({ ...editing, phone: e.target.value.replace(/\D/g, '') })} />
            </Field>
            <Field label="หน่วยงาน / บริษัท">
              <input className="input" value={editing.organization} onChange={(e) => setEditing({ ...editing, organization: e.target.value })} />
            </Field>
            {(beos?.length ?? 0) > 0 && (
              <label className="row small" style={{ gap: 8, alignItems: 'flex-start' }}>
                <input type="checkbox" checked={editing.syncBeos} onChange={(e) => setEditing({ ...editing, syncBeos: e.target.checked })} style={{ marginTop: 3 }} />
                <span>อัปเดตชื่อ เบอร์ และหน่วยงานในเอกสาร BEO เดิมของลูกค้านี้ด้วย ({beos!.length} ใบ)
                  <span className="muted"> — ถ้าไม่เลือก เอกสารเดิมจะยังเป็นข้อมูลเก่า และถ้าเปลี่ยนเบอร์ จะไม่นับเป็นงานของลูกค้านี้</span></span>
              </label>
            )}
          </div>
        )}
        {open && !editing && (
          <>
            <div className="stack" style={{ gap: 4 }}>
              {open.organization && <div>{open.organization}</div>}
              {open.address && <div className="small muted">{open.address}</div>}
              <div className="row wrap">
                <a className="btn primary" href={tel(open.phone)}><Phone size={18} aria-hidden /> โทร {phoneFormat(open.phone)}</a>
                {open.contactPhone && <a className="btn" href={tel(open.contactPhone)}><Phone size={18} aria-hidden /> {open.contactName || 'ผู้ประสานงาน'} {phoneFormat(open.contactPhone)}</a>}
              </div>
            </div>
            <strong>งานของลูกค้า {beos && <span className="muted small">({jobCounts(beos).get(phoneDigits(open.phone)) ?? 0} งาน{beos.some((b) => b.status === 'draft') ? ` · แบบร่าง ${beos.filter((b) => b.status === 'draft').length}` : ''})</span>}</strong>
            {!beos ? <Spinner /> : beos.length === 0 ? <div className="muted small">ไม่พบเอกสาร</div> : beos.map((b) => (
              <div key={b.id} className="row between card flat" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
                <div>
                  <div className="row"><strong><EventTitle beo={b} /></strong><StatusBadge status={b.status} /></div>
                  <div className="small muted">{thaiDate(b.event.date, { short: true })} · {b.event.room} · {b.docNo ?? 'แบบร่าง'}</div>
                </div>
                <span className="num small">{money(b.totals.grandTotal)}</span>
              </div>
            ))}
          </>
        )}
      </Sheet>
    </div>
  )
}
