import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import type { Beo } from '../../lib/types'
import { useCatalog } from '../../lib/catalog'
import { Trash2, X } from 'lucide-react'
import { deleteBeos, listBeosBetween, listDeleteRequests, listPendingBeos } from '../../lib/db'
import { addDaysIso, money, num, thaiDate, timeRange, todayIso } from '../../lib/thai'
import { MonthPicker, monthRange } from '../../components/MonthPicker'
import { Empty, errorText, Spinner, StatusBadge, useConfirm, useToast } from '../../components/ui'
import { CategoriesAdmin, MenuAdmin, ServicesAdmin } from './CatalogAdmin'
import { SetsAdmin } from './SetsAdmin'
import { FocAdmin, SettingsAdmin, TemplatesAdmin } from './RulesAdmin'
import { UsersAdmin } from './UsersAdmin'
import { SetupAdmin } from './SetupAdmin'
import { CustomersAdmin } from './CustomersAdmin'

function NeedCatalog({ children }: { children: ReactNode }) {
  const { catalog } = useCatalog()
  if (!catalog) return <div className="notice info">ยังไม่มีข้อมูล — ไปที่หน้า “นำเข้าข้อมูล” ก่อน</div>
  return <>{children}</>
}

export default function AdminPages() {
  return (
    <Routes>
      <Route index element={<NeedCatalog><Dashboard /></NeedCatalog>} />
      <Route path="beos" element={<BeoList />} />
      <Route path="customers" element={<CustomersAdmin />} />
      <Route path="menu" element={<NeedCatalog><MenuAdmin /></NeedCatalog>} />
      <Route path="categories" element={<NeedCatalog><CategoriesAdmin /></NeedCatalog>} />
      <Route path="sets" element={<NeedCatalog><SetsAdmin /></NeedCatalog>} />
      <Route path="templates" element={<NeedCatalog><TemplatesAdmin /></NeedCatalog>} />
      <Route path="services" element={<NeedCatalog><ServicesAdmin /></NeedCatalog>} />
      <Route path="foc" element={<NeedCatalog><FocAdmin /></NeedCatalog>} />
      <Route path="settings" element={<NeedCatalog><SettingsAdmin /></NeedCatalog>} />
      <Route path="users" element={<UsersAdmin />} />
      <Route path="setup" element={<SetupAdmin />} />
    </Routes>
  )
}


function useMonthBeos(ym: string) {
  const [beos, setBeos] = useState<Beo[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    setBeos(null)
    const [from, to] = monthRange(ym)
    listBeosBetween(from, to).then(setBeos).catch((e) => setErr(errorText(e)))
  }, [ym])
  return { beos, err, setBeos }
}

/** group BEOs by event date (ascending), each day sorted by start time; at most `max` events */
function groupByDay(beos: Beo[], max: number): [string, Beo[]][] {
  const sorted = [...beos].sort((a, b) => a.event.date.localeCompare(b.event.date) || (a.event.start || '99').localeCompare(b.event.start || '99')).slice(0, max)
  const days = new Map<string, Beo[]>()
  for (const b of sorted) days.set(b.event.date, [...(days.get(b.event.date) ?? []), b])
  return [...days.entries()]
}

function Dashboard() {
  const navigate = useNavigate()
  const [ym, setYm] = useState(todayIso().slice(0, 7))
  const { beos, err } = useMonthBeos(ym)
  const [pending, setPending] = useState<Beo[] | null>(null)
  const [delReq, setDelReq] = useState<Beo[] | null>(null)
  useEffect(() => {
    listPendingBeos().then(setPending).catch(() => setPending([]))
    listDeleteRequests().then(setDelReq).catch(() => setDelReq([]))
  }, [])
  const stats = useMemo(() => {
    const list = beos ?? []
    const live = list.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const revenue = live.reduce((s, b) => s + b.totals.grandTotal, 0)
    const counts = new Map<string, number>()
    for (const b of live) for (const l of b.lines) {
      if (l.kind === 'set' || l.kind === 'item') {
        const k = l.cuisine === 'th' && !l.name.includes('ไทย') ? `${l.name} (ไทย)` : l.name
        counts.set(k, (counts.get(k) ?? 0) + 1)
      }
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      total: list.length, live: live.length, drafts: list.filter((b) => b.status === 'draft').length,
      cancelled: list.filter((b) => b.status === 'cancelled').length, revenue, top,
      guests: live.reduce((s, b) => s + (b.seating.guests || 0), 0),
    }
  }, [beos])
  const today = todayIso()
  // next 30 days of confirmed work, independent of the month picker (so the 30th also shows next month)
  const [upcoming, setUpcoming] = useState<Beo[] | null>(null)
  useEffect(() => {
    listBeosBetween(today, addDaysIso(today, 30))
      .then((r) => setUpcoming(r.filter((b) => b.status === 'confirmed')))
      .catch(() => setUpcoming([]))
  }, [today])
  const upcomingDays = useMemo(() => groupByDay(upcoming ?? [], 25), [upcoming])
  return (
    <div className="stack">
      <div className="page-head"><h1>แดชบอร์ด</h1><MonthPicker value={ym} onChange={setYm} /></div>
      {err && <div className="notice warn">{err}</div>}
      {!beos ? <Spinner /> : (
        <>
          {pending && pending.length > 0 && (
            <section className="card stack" style={{ borderLeft: '4px solid var(--gold)' }}>
              <h2>รอการยืนยัน ({pending.length})</h2>
              {pending.map((b) => (
                <div key={b.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
                  <div><strong>{thaiDate(b.event.date, { short: true })}</strong> <span className="small muted">{b.docNo}</span>
                    <div className="small">{b.event.name} · {b.customer.name} · โดย {b.salesName}</div></div>
                  <span className="btn small">ตรวจ / ยืนยัน</span>
                </div>
              ))}
            </section>
          )}
          {delReq && delReq.length > 0 && (
            <section className="card stack" style={{ borderLeft: '4px solid var(--danger)' }}>
              <h2>คำขอลบจาก Sales ({delReq.length})</h2>
              {delReq.map((b) => (
                <div key={b.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
                  <div><strong>{b.docNo}</strong> <span className="small muted">{thaiDate(b.event.date, { short: true })}</span>
                    <div className="small">{b.event.name} · ขอโดย {b.deleteRequest?.byName}</div></div>
                  <span className="btn small">พิจารณา</span>
                </div>
              ))}
            </section>
          )}
          <div className="stat-grid">
            <div className="card stat"><div className="small muted">รายรับ (ยืนยันแล้ว รวม VAT)</div><div className="v num">{money(stats.revenue)}</div></div>
            <div className="card stat"><div className="small muted">งานที่ยืนยัน</div><div className="v num">{stats.live}</div></div>
            <div className="card stat"><div className="small muted">แขกรวม</div><div className="v num">{num(stats.guests)}</div></div>
            <div className="card stat"><div className="small muted">แบบร่าง / ยกเลิก</div><div className="v num">{stats.drafts} / {stats.cancelled}</div></div>
          </div>
          <div className="grid2">
            <section className="card stack">
              <div className="row between"><h2>งานที่กำลังจะถึง</h2><span className="small muted">30 วันข้างหน้า</span></div>
              {!upcoming ? <Spinner /> : upcomingDays.length === 0 ? <div className="muted">ไม่มีงานที่ยืนยันแล้ว</div> : (
                <div className="up-days">
                  {upcomingDays.map(([date, list]) => (
                    <div key={date} className="up-day">
                      <div className="up-date">
                        <strong>{thaiDate(date, { short: true, dow: true })}</strong>
                        {date === today && <span className="badge ok">วันนี้</span>}
                        {date === addDaysIso(today, 1) && <span className="badge">พรุ่งนี้</span>}
                        <span className="small muted" style={{ marginLeft: 'auto' }}>{list.length} งาน</span>
                      </div>
                      {list.map((b) => (
                        <button key={b.id} type="button" className="up-row" onClick={() => navigate(`/beo/${b.id}`)}>
                          <span className="up-time num">{timeRange(b.event.start, b.event.end)}</span>
                          <span className="up-name">
                            <strong>{b.event.name}</strong>{b.seating.guests > 0 && <span className="muted"> ({num(b.seating.guests)} คน)</span>}
                            <span className="muted"> · {b.event.room}</span>
                          </span>
                          <span className="up-amt num">{money(b.totals.grandTotal)}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="card stack">
              <h2>เมนู / เซ็ตที่ขายบ่อย</h2>
              {stats.top.length ? stats.top.map(([n, c]) => <div key={n} className="row between"><span>{n}</span><span className="badge">{c} งาน</span></div>) : <div className="muted">ยังไม่มีข้อมูล</div>}
            </section>
          </div>
        </>
      )}
    </div>
  )
}

function BeoList() {
  const navigate = useNavigate()
  const [ym, setYm] = useState(todayIso().slice(0, 7))
  const { beos, err, setBeos } = useMonthBeos(ym)
  const confirm = useConfirm()
  const toast = useToast()
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [sales, setSales] = useState('all')
  const salesNames = [...new Set((beos ?? []).map((b) => b.salesName))]
  const list = (beos ?? []).filter((b) => (status === 'all' || b.status === status) && (sales === 'all' || b.salesName === sales)
    && (!q.trim() || [b.customer.name, b.customer.phone, b.event.name, b.docNo ?? '', b.event.room].some((x) => x.includes(q.trim()))))
    .sort((a, b) => a.event.date.localeCompare(b.event.date))

  const allShownSelected = list.length > 0 && list.every((b) => selected.has(b.id!))
  const toggle = (k: string) => setSelected((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n })
  const toggleAll = () => setSelected((s) => {
    const n = new Set(s)
    if (allShownSelected) list.forEach((b) => n.delete(b.id!))
    else list.forEach((b) => n.add(b.id!))
    return n
  })
  const selectedList = (beos ?? []).filter((b) => selected.has(b.id!))

  const removeSelected = async () => {
    const targets = selectedList
    if (!targets.length) return
    const live = targets.filter((b) => b.status === 'confirmed' || b.status === 'completed').length
    const ok = await confirm({
      title: `ลบเอกสาร BEO ${targets.length} ใบ?`,
      message: (
        <>
          <ul>{targets.slice(0, 8).map((b) => <li key={b.id}>{b.docNo ?? 'แบบร่าง'} · {b.event.name} · {b.customer.name}</li>)}{targets.length > 8 && <li>และอีก {targets.length - 8} ใบ</li>}</ul>
          <p style={{ marginBottom: 0 }}>
            ลบถาวร กู้คืนไม่ได้ และห้องที่จองไว้จะว่างทันที
            {live > 0 ? ` · มี ${live} ใบที่ยืนยันแล้ว/จัดงานแล้ว — ถ้าต้องการเก็บประวัติ แนะนำให้ “ยกเลิกงาน” แทนการลบ` : ''}
          </p>
        </>
      ),
      confirmText: `ลบ ${targets.length} ใบ`,
      danger: true,
      requireText: 'ลบ',
    })
    if (!ok) return
    setDeleting(true)
    try {
      const ids = targets.map((b) => b.id!)
      await deleteBeos(ids)
      const gone = new Set(ids)
      setBeos((l) => (l ?? []).filter((b) => !gone.has(b.id!)))
      setSelected(new Set())
      toast(`ลบเอกสาร ${ids.length} ใบแล้ว`)
    } catch (e) {
      toast(`ลบไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setDeleting(false)
    }
  }

  const exportCsv = () => {
    const rows = [['เลขที่', 'สถานะ', 'วันที่งาน', 'เวลา', 'ห้อง', 'ชื่องาน', 'ลูกค้า', 'โทร', 'หน่วยงาน', 'แขก', 'โต๊ะ', 'ก่อน VAT', 'VAT', 'รวม', 'Sales']]
    for (const b of list) rows.push([b.docNo ?? '', b.status, thaiDate(b.event.date), timeRange(b.event.start, b.event.end), b.event.room, b.event.name, b.customer.name, b.customer.phone, b.customer.organization, String(b.seating.guests), String(b.seating.tables), String(b.totals.subtotal), String(b.totals.vat), String(b.totals.grandTotal), b.salesName])
    const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `BEO_${ym}.csv`
    a.click()
  }

  return (
    <div className="stack">
      <div className="page-head">
        <h1>เอกสาร BEO</h1>
        <div className="row wrap"><MonthPicker value={ym} onChange={(v) => { setYm(v); setSelected(new Set()) }} /><button className="btn small" onClick={exportCsv} disabled={!list.length}>ส่งออก Excel (CSV)</button></div>
      </div>
      <div className="row wrap">
        <input className="input grow" style={{ minWidth: 220 }} type="search" placeholder="ค้นหา ลูกค้า / เบอร์ / ชื่องาน / เลขที่ / ห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={sales} onChange={(e) => setSales(e.target.value)}>
          <option value="all">Sales ทุกคน</option>{salesNames.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div className="chips scroll">
        {[['all', 'ทั้งหมด'], ['draft', 'แบบร่าง'], ['pending', 'รอการยืนยัน'], ['confirmed', 'ยืนยันแล้ว'], ['completed', 'จัดงานแล้ว'], ['cancelled', 'ยกเลิก']].map(([k, l]) => (
          <button key={k} className={`chip small${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {selected.size > 0 && (
        <div className="bulkbar" role="region" aria-label="รายการที่เลือก">
          <strong>เลือก {selected.size} ใบ</strong>
          <button className="btn small" onClick={() => setSelected(new Set())}><X size={16} aria-hidden /> ล้างที่เลือก</button>
          <button className="btn small danger-solid" style={{ marginLeft: 'auto' }} disabled={deleting} onClick={() => void removeSelected()}>
            <Trash2 size={16} aria-hidden /> {deleting ? 'กำลังลบ…' : `ลบ ${selected.size} ใบ`}
          </button>
        </div>
      )}
      {err && <div className="notice warn">{err}</div>}
      {!beos ? <Spinner /> : list.length === 0 ? <Empty>ไม่มีเอกสารในเดือนนี้</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th className="sel"><input type="checkbox" checked={allShownSelected} onChange={toggleAll} aria-label="เลือกทั้งหมดที่แสดง" /></th><th>วันที่งาน</th><th>ชื่องาน / ลูกค้า</th><th className="hide-mobile">ห้อง</th><th className="hide-mobile">Sales</th><th className="num">รวม</th><th>สถานะ</th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className={`click${selected.has(b.id!) ? ' selected' : ''}`} onClick={() => navigate(`/beo/${b.id}`)}>
                  <td className="sel" onClick={(e) => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(b.id!)} onChange={() => toggle(b.id!)} aria-label={`เลือก ${b.docNo ?? b.event.name}`} />
                  </td>
                  <td><div>{thaiDate(b.event.date, { short: true })}</div><div className="small muted">{b.docNo ?? '-'}</div></td>
                  <td><div style={{ fontWeight: 600 }}>{b.event.name}</div><div className="small muted">{b.customer.name}</div></td>
                  <td className="hide-mobile">{b.event.room}</td>
                  <td className="hide-mobile">{b.salesName}</td>
                  <td className="num">{money(b.totals.grandTotal)}</td>
                  <td><StatusBadge status={b.status} />{b.deleteRequest && <div><span className="badge req-del" style={{ marginTop: 4 }}>ขอลบ</span></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="small muted">แสดงเฉพาะงานที่มีวันที่จัดงานในเดือนที่เลือก (แบบร่างที่ยังไม่ระบุวันจะไม่แสดง)</div>
    </div>
  )
}
