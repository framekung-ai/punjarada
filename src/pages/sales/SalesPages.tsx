import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import type { Beo } from '../../lib/types'
import { useAuth } from '../../lib/auth'
import { listBeosBetween, listMyBeos } from '../../lib/db'
import { money, thaiDate, timeRange, todayIso } from '../../lib/thai'
import { Empty, errorText, Spinner, StatusBadge } from '../../components/ui'
import { MonthPicker, monthRange } from '../../components/MonthPicker'
import { SortTh, useSort } from '../../components/SortTable'

function useMyBeos() {
  const { user } = useAuth()
  const [beos, setBeos] = useState<Beo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    listMyBeos(user.uid, 100).then(setBeos).catch((e) => setErr(errorText(e)))
  }, [user])
  return { beos, err }
}

/** kept for other pages that list BEOs as cards */
export function BeoCard({ b }: { b: Beo }) {
  const navigate = useNavigate()
  return (
    <div className="card row" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
      <div className="grow">
        <div className="row wrap"><strong>{b.event.name || '(ยังไม่มีชื่องาน)'}</strong><StatusBadge status={b.status} /></div>
        <div className="small muted">{b.customer.name} · {b.event.date ? thaiDate(b.event.date, { short: true }) : 'ยังไม่กำหนดวัน'} · {timeRange(b.event.start, b.event.end)} · {b.event.room}</div>
      </div>
      <div className="right">
        <div className="num" style={{ fontWeight: 700 }}>{money(b.totals.grandTotal)}</div>
        <div className="small muted">{b.docNo ?? 'แบบร่าง'}</div>
      </div>
    </div>
  )
}

const STATUS_CHIPS: [string, string][] = [['all', 'ทั้งหมด'], ['draft', 'แบบร่าง'], ['pending', 'รอการยืนยัน'], ['confirmed', 'ยืนยันแล้ว'], ['completed', 'จัดงานแล้ว'], ['cancelled', 'ยกเลิก']]
const STATUS_ORDER: Record<string, number> = { draft: 0, pending: 1, confirmed: 2, completed: 3, cancelled: 4 }

type MyKey = 'date' | 'name' | 'customer' | 'status' | 'total'

/** หน้าแรกของ Sales = เอกสารของฉัน (เฉพาะเอกสารที่ตัวเองสร้าง) */
export function SalesHome() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { beos, err } = useMyBeos()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const counts = useMemo(() => {
    const m = new Map<string, number>()
    for (const b of beos ?? []) m.set(b.status, (m.get(b.status) ?? 0) + 1)
    return m
  }, [beos])
  const rows = useMemo(() => (beos ?? []).filter((b) => {
    if (status !== 'all' && b.status !== status) return false
    const t = q.trim()
    return !t || [b.customer.name, b.customer.phone, b.event.name, b.docNo ?? '', b.event.room].some((x) => x.includes(t))
  }), [beos, q, status])
  const { sorted, sort, toggle } = useSort<Beo, MyKey>(rows, {
    date: (b) => b.event.date || '9999',
    name: (b) => b.event.name,
    customer: (b) => b.customer.name,
    status: (b) => STATUS_ORDER[b.status] ?? 9,
    total: (b) => b.totals.grandTotal,
  }, { key: 'date', dir: 'desc' })

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="small muted">สวัสดี {user?.displayName}</div>
          <h1>เอกสารของฉัน</h1>
        </div>
        <Link to="/sales/new" className="btn primary"><Plus size={18} aria-hidden /> สร้าง BEO ใหม่</Link>
      </div>
      <input className="input" type="search" placeholder="ค้นหา ชื่องาน / ลูกค้า / เบอร์ / เลขที่ / ห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips scroll">
        {STATUS_CHIPS.map(([k, l]) => (
          <button key={k} className={`chip small${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>
            {l}{k !== 'all' && counts.get(k) ? ` (${counts.get(k)})` : ''}
          </button>
        ))}
      </div>
      {err && <div className="notice warn">{err}</div>}
      {!beos && !err ? <Spinner /> : sorted.length === 0 ? (
        <Empty>{beos?.length ? 'ไม่พบเอกสาร' : 'ยังไม่มีเอกสาร — กด “สร้าง BEO ใหม่” เพื่อเริ่ม'}</Empty>
      ) : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr>
              <SortTh k="date" sort={sort} onSort={toggle}>วันที่งาน</SortTh>
              <SortTh k="name" sort={sort} onSort={toggle}>ชื่องาน</SortTh>
              <SortTh k="customer" sort={sort} onSort={toggle} className="hide-mobile">ลูกค้า</SortTh>
              <SortTh k="total" sort={sort} onSort={toggle} className="num hide-mobile">รวม</SortTh>
              <SortTh k="status" sort={sort} onSort={toggle}>สถานะ</SortTh>
            </tr></thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} className="click" onClick={() => navigate(`/beo/${b.id}`)}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div>{b.event.date ? thaiDate(b.event.date, { short: true }) : <span className="muted">ยังไม่กำหนด</span>}</div>
                    <div className="small muted">{b.docNo ?? 'แบบร่าง'}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.event.name || '(ยังไม่มีชื่องาน)'}</div>
                    <div className="small muted">{b.event.room}<span className="hide-desktop"> · {b.customer.name}</span></div>
                  </td>
                  <td className="hide-mobile">{b.customer.name}</td>
                  <td className="num hide-mobile">{money(b.totals.grandTotal)}</td>
                  <td>
                    <StatusBadge status={b.status} />
                    {b.deleteRequest && <div><span className="badge req-del" style={{ marginTop: 4 }}>ขอลบ</span></div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {beos && beos.length >= 100 && <div className="small muted center">แสดง 100 งานล่าสุด (ตามวันที่งาน)</div>}
    </div>
  )
}

type AllKey = 'date' | 'name' | 'sales' | 'room'

/** เอกสารทั้งหมดที่ Admin ยืนยันแล้ว (ของทุกคน) — ใช้ดูตารางงานและ cross-check */
export function AllDocs() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [ym, setYm] = useState(todayIso().slice(0, 7))
  const [beos, setBeos] = useState<Beo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [who, setWho] = useState('all')
  useEffect(() => {
    let alive = true
    const [from, to] = monthRange(ym)
    listBeosBetween(from, to)
      .then((r) => { if (alive) { setBeos(r.filter((b) => b.status === 'confirmed' || b.status === 'completed')); setErr(null) } })
      .catch((e) => { if (alive) setErr(errorText(e)) })
    return () => { alive = false }
  }, [ym])
  const salesNames = useMemo(() => [...new Set((beos ?? []).map((b) => b.salesName))].sort((a, b) => a.localeCompare(b, 'th')), [beos])
  const rows = useMemo(() => (beos ?? []).filter((b) => {
    if (who === 'me' ? b.salesUid !== user?.uid : who !== 'all' && b.salesName !== who) return false
    const t = q.trim()
    return !t || [b.event.name, b.customer.name, b.docNo ?? '', b.event.room, b.salesName].some((x) => x.includes(t))
  }), [beos, q, who, user])
  const { sorted, sort, toggle } = useSort<Beo, AllKey>(rows, {
    date: (b) => `${b.event.date} ${b.event.start}`,
    name: (b) => b.event.name,
    sales: (b) => b.salesName,
    room: (b) => b.event.room,
  }, { key: 'date', dir: 'asc' })

  return (
    <div className="stack">
      <div className="page-head" style={{ marginBottom: 0 }}>
        <h1>เอกสารทั้งหมด</h1>
        <MonthPicker value={ym} onChange={(v) => { setBeos(null); setYm(v) }} />
      </div>
      <div className="small muted">งานที่ Admin ยืนยันแล้วของทุกคน ในเดือนที่เลือก · กดหัวตารางเพื่อเรียง</div>
      <div className="row wrap">
        <input className="input grow" style={{ minWidth: 200 }} type="search" placeholder="ค้นหา ชื่องาน / ลูกค้า / เลขที่ / ห้อง / ผู้รับงาน" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={who} onChange={(e) => setWho(e.target.value)} aria-label="ผู้รับงาน">
          <option value="all">ผู้รับงานทุกคน</option>
          <option value="me">เฉพาะของฉัน</option>
          {salesNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>
      {err && <div className="notice warn">{err}</div>}
      {!beos && !err ? <Spinner /> : sorted.length === 0 ? <Empty>ไม่มีงานที่ยืนยันแล้วในเดือนนี้</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr>
              <SortTh k="date" sort={sort} onSort={toggle}>วันที่งาน</SortTh>
              <SortTh k="name" sort={sort} onSort={toggle}>ชื่องาน</SortTh>
              <SortTh k="room" sort={sort} onSort={toggle} className="hide-mobile">ห้อง</SortTh>
              <SortTh k="sales" sort={sort} onSort={toggle}>ผู้รับงาน</SortTh>
            </tr></thead>
            <tbody>
              {sorted.map((b) => (
                <tr key={b.id} className="click" onClick={() => navigate(`/beo/${b.id}`)}>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <div>{thaiDate(b.event.date, { short: true })}</div>
                    <div className="small muted">{timeRange(b.event.start, b.event.end)}</div>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.event.name}</div>
                    <div className="small muted">{b.docNo} · {b.customer.name}<span className="hide-desktop"> · {b.event.room}</span></div>
                  </td>
                  <td className="hide-mobile">{b.event.room}</td>
                  <td>
                    {b.salesName}
                    {b.salesUid === user?.uid && <span className="badge" style={{ marginLeft: 6 }}>ฉัน</span>}
                    {b.status === 'completed' && <div className="small muted">จัดงานแล้ว</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
