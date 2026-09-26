import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Beo } from '../../lib/types'
import { useAuth } from '../../lib/auth'
import { listMyBeos } from '../../lib/db'
import { addDaysIso, money, thaiDate, timeRange, todayIso } from '../../lib/thai'
import { Empty, errorText, Spinner, StatusBadge } from '../../components/ui'

function useMyBeos() {
  const { user } = useAuth()
  const [beos, setBeos] = useState<Beo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    if (!user) return
    listMyBeos(user.uid).then(setBeos).catch((e) => setErr(errorText(e)))
  }, [user])
  return { beos, err }
}

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

export function SalesHome() {
  const { user } = useAuth()
  const { beos, err } = useMyBeos()
  const today = todayIso()
  const in7 = addDaysIso(today, 7)
  const upcoming = (beos ?? []).filter((b) => b.status !== 'cancelled' && b.event.date >= today && b.event.date <= in7).sort((a, b) => a.event.date.localeCompare(b.event.date))
  const drafts = (beos ?? []).filter((b) => b.status === 'draft')
  return (
    <div className="stack">
      <div>
        <div className="muted">สวัสดี</div>
        <h1>{user?.displayName}</h1>
      </div>
      <Link to="/sales/new" className="btn primary big block">＋ สร้าง BEO ใหม่</Link>
      {err && <div className="notice warn">{err}</div>}
      {!beos && !err && <Spinner />}
      {drafts.length > 0 && (
        <section className="stack">
          <h2>แบบร่างที่ยังไม่ยืนยัน ({drafts.length})</h2>
          {drafts.slice(0, 5).map((b) => <BeoCard key={b.id} b={b} />)}
        </section>
      )}
      {beos && (
        <section className="stack">
          <h2>งานใน 7 วันนี้</h2>
          {upcoming.length ? upcoming.map((b) => <BeoCard key={b.id} b={b} />) : <Empty>ไม่มีงานในสัปดาห์นี้</Empty>}
        </section>
      )}
    </div>
  )
}

export function MyDocs() {
  const { beos, err } = useMyBeos()
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<string>('all')
  const list = useMemo(() => (beos ?? []).filter((b) => {
    if (status !== 'all' && b.status !== status) return false
    const t = q.trim()
    if (!t) return true
    return [b.customer.name, b.customer.phone, b.event.name, b.docNo ?? ''].some((x) => x.includes(t))
  }), [beos, q, status])
  return (
    <div className="stack">
      <h1>เอกสารของฉัน</h1>
      <input className="input" type="search" placeholder="ค้นหา ชื่อลูกค้า / เบอร์ / ชื่องาน / เลขที่" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="chips scroll">
        {[['all', 'ทั้งหมด'], ['draft', 'แบบร่าง'], ['confirmed', 'ยืนยันแล้ว'], ['completed', 'จัดงานแล้ว'], ['cancelled', 'ยกเลิก']].map(([k, l]) => (
          <button key={k} className={`chip small${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {err && <div className="notice warn">{err}</div>}
      {!beos && !err ? <Spinner /> : list.length ? list.map((b) => <BeoCard key={b.id} b={b} />) : <Empty>ไม่พบเอกสาร</Empty>}
      {beos && beos.length >= 50 && <div className="small muted center">แสดง 50 งานล่าสุด</div>}
    </div>
  )
}
