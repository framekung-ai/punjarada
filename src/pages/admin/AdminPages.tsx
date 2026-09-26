import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Route, Routes, useNavigate } from 'react-router-dom'
import type { Beo } from '../../lib/types'
import { useCatalog } from '../../lib/catalog'
import { listBeosBetween } from '../../lib/db'
import { money, num, THAI_MONTHS, thaiDate, timeRange, todayIso } from '../../lib/thai'
import { Empty, errorText, Spinner, StatusBadge } from '../../components/ui'
import { CategoriesAdmin, MenuAdmin, ServicesAdmin } from './CatalogAdmin'
import { SetsAdmin } from './SetsAdmin'
import { FocAdmin, SettingsAdmin, TemplatesAdmin } from './RulesAdmin'
import { UsersAdmin } from './UsersAdmin'
import { SetupAdmin } from './SetupAdmin'

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

function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number)
  const last = new Date(y, m, 0).getDate()
  return [`${ym}-01`, `${ym}-${String(last).padStart(2, '0')}`]
}

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [y, m] = value.split('-').map(Number)
  const move = (d: number) => {
    const dt = new Date(y, m - 1 + d, 1)
    onChange(`${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`)
  }
  return (
    <div className="row">
      <button className="icon-btn" onClick={() => move(-1)} aria-label="เดือนก่อน">‹</button>
      <strong style={{ minWidth: 130, textAlign: 'center' }}>{THAI_MONTHS[m - 1]} {y + 543}</strong>
      <button className="icon-btn" onClick={() => move(1)} aria-label="เดือนถัดไป">›</button>
    </div>
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
  return { beos, err }
}

function Dashboard() {
  const navigate = useNavigate()
  const [ym, setYm] = useState(todayIso().slice(0, 7))
  const { beos, err } = useMonthBeos(ym)
  const stats = useMemo(() => {
    const list = beos ?? []
    const live = list.filter((b) => b.status === 'confirmed' || b.status === 'completed')
    const revenue = live.reduce((s, b) => s + b.totals.grandTotal, 0)
    const counts = new Map<string, number>()
    for (const b of live) for (const l of b.lines) {
      if (l.kind === 'set' || l.kind === 'item') counts.set(l.name, (counts.get(l.name) ?? 0) + 1)
    }
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
    return {
      total: list.length, live: live.length, drafts: list.filter((b) => b.status === 'draft').length,
      cancelled: list.filter((b) => b.status === 'cancelled').length, revenue, top,
      guests: live.reduce((s, b) => s + (b.seating.guests || 0), 0),
    }
  }, [beos])
  const today = todayIso()
  const upcoming = (beos ?? []).filter((b) => b.status === 'confirmed' && b.event.date >= today).sort((a, b) => a.event.date.localeCompare(b.event.date)).slice(0, 10)
  return (
    <div className="stack">
      <div className="page-head"><h1>แดชบอร์ด</h1><MonthPicker value={ym} onChange={setYm} /></div>
      {err && <div className="notice warn">{err}</div>}
      {!beos ? <Spinner /> : (
        <>
          <div className="stat-grid">
            <div className="card stat"><div className="small muted">รายรับ (ยืนยันแล้ว รวม VAT)</div><div className="v num">{money(stats.revenue)}</div></div>
            <div className="card stat"><div className="small muted">งานที่ยืนยัน</div><div className="v num">{stats.live}</div></div>
            <div className="card stat"><div className="small muted">แขกรวม</div><div className="v num">{num(stats.guests)}</div></div>
            <div className="card stat"><div className="small muted">แบบร่าง / ยกเลิก</div><div className="v num">{stats.drafts} / {stats.cancelled}</div></div>
          </div>
          <div className="grid2">
            <section className="card stack">
              <h2>งานที่กำลังจะถึง</h2>
              {upcoming.length ? upcoming.map((b) => (
                <div key={b.id} className="row between" style={{ cursor: 'pointer' }} onClick={() => navigate(`/beo/${b.id}`)}>
                  <div><strong>{thaiDate(b.event.date, { short: true })}</strong> <span className="small muted">{timeRange(b.event.start, b.event.end)}</span><div className="small">{b.event.name} · {b.event.room}</div></div>
                  <span className="num small">{money(b.totals.grandTotal)}</span>
                </div>
              )) : <div className="muted">ไม่มีงาน</div>}
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
  const { beos, err } = useMonthBeos(ym)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [sales, setSales] = useState('all')
  const salesNames = [...new Set((beos ?? []).map((b) => b.salesName))]
  const list = (beos ?? []).filter((b) => (status === 'all' || b.status === status) && (sales === 'all' || b.salesName === sales)
    && (!q.trim() || [b.customer.name, b.customer.phone, b.event.name, b.docNo ?? '', b.event.room].some((x) => x.includes(q.trim()))))
    .sort((a, b) => a.event.date.localeCompare(b.event.date))

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
        <div className="row wrap"><MonthPicker value={ym} onChange={setYm} /><button className="btn small" onClick={exportCsv} disabled={!list.length}>ส่งออก Excel (CSV)</button></div>
      </div>
      <div className="row wrap">
        <input className="input grow" style={{ minWidth: 220 }} type="search" placeholder="ค้นหา ลูกค้า / เบอร์ / ชื่องาน / เลขที่ / ห้อง" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" style={{ width: 'auto' }} value={sales} onChange={(e) => setSales(e.target.value)}>
          <option value="all">Sales ทุกคน</option>{salesNames.map((n) => <option key={n}>{n}</option>)}
        </select>
      </div>
      <div className="chips scroll">
        {[['all', 'ทั้งหมด'], ['draft', 'แบบร่าง'], ['confirmed', 'ยืนยันแล้ว'], ['completed', 'จัดงานแล้ว'], ['cancelled', 'ยกเลิก']].map(([k, l]) => (
          <button key={k} className={`chip small${status === k ? ' on' : ''}`} onClick={() => setStatus(k)}>{l}</button>
        ))}
      </div>
      {err && <div className="notice warn">{err}</div>}
      {!beos ? <Spinner /> : list.length === 0 ? <Empty>ไม่มีเอกสารในเดือนนี้</Empty> : (
        <div className="table-wrap">
          <table className="list">
            <thead><tr><th>วันที่งาน</th><th>ชื่องาน / ลูกค้า</th><th className="hide-mobile">ห้อง</th><th className="hide-mobile">Sales</th><th className="num">รวม</th><th>สถานะ</th></tr></thead>
            <tbody>
              {list.map((b) => (
                <tr key={b.id} className="click" onClick={() => navigate(`/beo/${b.id}`)}>
                  <td><div>{thaiDate(b.event.date, { short: true })}</div><div className="small muted">{b.docNo ?? '-'}</div></td>
                  <td><div style={{ fontWeight: 600 }}>{b.event.name}</div><div className="small muted">{b.customer.name}</div></td>
                  <td className="hide-mobile">{b.event.room}</td>
                  <td className="hide-mobile">{b.salesName}</td>
                  <td className="num">{money(b.totals.grandTotal)}</td>
                  <td><StatusBadge status={b.status} /></td>
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
