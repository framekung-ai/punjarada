import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Phone, Trash2 } from 'lucide-react'
import type { Beo, CustomerRecord } from '../../lib/types'
import { deleteCustomer, listBeosByPhone, listCustomers } from '../../lib/db'
import { money, phoneFormat, thaiDate } from '../../lib/thai'
import { Empty, errorText, Sheet, Spinner, StatusBadge, useToast } from '../../components/ui'

/** Admin: find a customer by name / phone / organisation, call back, and see their events. */
export function CustomersAdmin() {
  const navigate = useNavigate()
  const toast = useToast()
  const [deleting, setDeleting] = useState(false)
  const [list, setList] = useState<CustomerRecord[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<CustomerRecord | null>(null)
  const [beos, setBeos] = useState<Beo[] | null>(null)

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

  const openCustomer = (c: CustomerRecord) => {
    setOpen(c)
    setBeos(null)
    listBeosByPhone(c.phone).then(setBeos).catch(() => setBeos([]))
  }

  const remove = async (c: CustomerRecord) => {
    const n = beos?.length ?? 0
    const msg = `ลบข้อมูลลูกค้า “${c.name}” (${phoneFormat(c.phone)}) ออกจากรายชื่อ?`
      + (n ? `\n\nเอกสาร BEO ${n} ใบของลูกค้านี้จะไม่ถูกลบ และยังเปิดดูได้ตามปกติ` : '')
      + '\n\nถ้าลูกค้าคนนี้จองงานใหม่ ระบบจะบันทึกรายชื่อกลับมาอัตโนมัติ'
    if (!window.confirm(msg)) return
    setDeleting(true)
    try {
      await deleteCustomer(c.id ?? c.phone)
      setList((l) => (l ?? []).filter((x) => (x.id ?? x.phone) !== (c.id ?? c.phone)))
      setOpen(null)
      toast('ลบข้อมูลลูกค้าแล้ว')
    } catch (e) {
      toast(`ลบไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setDeleting(false)
    }
  }

  const tel = (p: string) => `tel:${p.replace(/\D/g, '')}`

  return (
    <div className="stack">
      <div className="page-head"><h1>ลูกค้า <span className="small muted">({list?.length ?? 0})</span></h1></div>
      <input className="input" type="search" placeholder="ค้นหา ชื่อลูกค้า / เบอร์โทร / หน่วยงาน / ผู้ประสานงาน" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
      {err && <div className="notice warn">{err}</div>}
      {!list && !err ? <Spinner /> : shown.length === 0 ? <Empty>{q ? 'ไม่พบลูกค้า' : 'ยังไม่มีข้อมูลลูกค้า — ระบบจะบันทึกให้อัตโนมัติเมื่อมีการส่ง BEO'}</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>ลูกค้า</th><th>ติดต่อกลับ</th><th className="hide-mobile">ผู้ประสานงาน</th><th className="num">งาน</th></tr></thead>
            <tbody>
              {shown.map((c) => (
                <tr key={c.id ?? c.phone} className="click" onClick={() => openCustomer(c)}>
                  <td><div style={{ fontWeight: 600 }}>{c.name}</div>{c.organization && <div className="small muted">{c.organization}</div>}</td>
                  <td><a className="btn small" href={tel(c.phone)} onClick={(e) => e.stopPropagation()}><Phone size={15} aria-hidden /> {phoneFormat(c.phone)}</a></td>
                  <td className="hide-mobile small">{c.contactName}{c.contactPhone && <div><a href={tel(c.contactPhone)} onClick={(e) => e.stopPropagation()}>{phoneFormat(c.contactPhone)}</a></div>}</td>
                  <td className="num">{c.beoCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.name}
        footer={open && (
          <button className="btn danger" disabled={deleting || !beos} onClick={() => void remove(open)}>
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
