import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Trash2, X } from 'lucide-react'
import type { Beo, CustomerRecord } from '../../lib/types'
import { deleteCustomers, listBeosByPhone, listCustomers } from '../../lib/db'
import { money, phoneFormat, thaiDate } from '../../lib/thai'
import { Empty, errorText, Sheet, Spinner, StatusBadge, useConfirm, useToast } from '../../components/ui'

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

  useEffect(() => { listCustomers().then(setList).catch((e) => setErr(errorText(e))) }, [])

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
    setBeos(null)
    listBeosByPhone(c.phone).then(setBeos).catch(() => setBeos([]))
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
      <div className="page-head"><h1>ลูกค้า <span className="small muted">({list?.length ?? 0})</span></h1></div>
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

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}
        footer={open && (
          <button className="btn danger" disabled={deleting} onClick={() => void remove([open])}>
            <Trash2 size={17} aria-hidden /> {deleting ? 'กำลังลบ…' : 'ลบข้อมูลลูกค้า'}
          </button>
        )}>
        {open && (
          <>
            <div className="stack" style={{ gap: 4 }}>
              {open.organization && <div>{open.organization}</div>}
              {open.address && <div className="small muted">{open.address}</div>}
              <div className="row wrap">
                <a className="btn primary" href={tel(open.phone)}><Phone size={18} aria-hidden /> โทร {phoneFormat(open.phone)}</a>
                {open.contactPhone && <a className="btn" href={tel(open.contactPhone)}><Phone size={18} aria-hidden /> {open.contactName || 'ผู้ประสานงาน'} {phoneFormat(open.contactPhone)}</a>}
              </div>
            </div>
            <strong>งานของลูกค้า</strong>
            {!beos ? <Spinner /> : beos.length === 0 ? <div className="muted small">ไม่พบเอกสาร</div> : beos.map((b) => (
              <div key={b.id} className="row between card flat" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
                <div>
                  <div className="row"><strong>{b.event.name}</strong><StatusBadge status={b.status} /></div>
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
