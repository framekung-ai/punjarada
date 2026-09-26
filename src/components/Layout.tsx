import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useCatalog } from '../lib/catalog'
import { Spinner } from './ui'

export const ADMIN_NAV: { group: string; items: [string, string][] }[] = [
  { group: 'งาน', items: [['/admin', 'แดชบอร์ด'], ['/admin/beos', 'เอกสาร BEO'], ['/sales/new', '+ สร้าง BEO']] },
  { group: 'เมนู', items: [['/admin/menu', 'เมนูอาหาร'], ['/admin/categories', 'หมวดหมู่'], ['/admin/sets', 'เซ็ตเมนู'], ['/admin/templates', 'โครงมื้อ']] },
  { group: 'ตั้งค่า', items: [['/admin/services', 'บริการ'], ['/admin/foc', 'กฎ FOC'], ['/admin/settings', 'ทั่วไป / ห้อง'], ['/admin/users', 'ผู้ใช้งาน'], ['/admin/setup', 'นำเข้าข้อมูล']] },
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { loading, error, empty } = useCatalog()
  const isAdmin = user?.role === 'admin'
  // the wizard has its own sticky footer (back / total / next) — no bottom nav there
  const inWizard = /\/(new|edit)$/.test(useLocation().pathname)

  return (
    <>
      <header className="topbar">
        <img src="/logo-256.jpg" alt="" />
        <div className="grow">
          <div className="title">PunjadaraPOS</div>
          <div className="small muted">{user?.displayName} · {isAdmin ? 'Admin' : 'Sales'}</div>
        </div>
        <button className="btn small ghost" onClick={() => void logout()}>ออกจากระบบ</button>
      </header>
      <div className="shell">
        {isAdmin && (
          <nav className="sidenav">
            {ADMIN_NAV.map((g) => (
              <div key={g.group} className="stack" style={{ gap: 2 }}>
                <div className="group">{g.group}</div>
                {g.items.map(([to, label]) => <NavLink key={to} to={to} end={to === '/admin'}>{label}</NavLink>)}
              </div>
            ))}
          </nav>
        )}
        <main className="main">
          {isAdmin && (
            <div className="admin-menu">
              {ADMIN_NAV.flatMap((g) => g.items).map(([to, label]) => (
                <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `chip small${isActive ? ' on' : ''}`}>{label}</NavLink>
              ))}
            </div>
          )}
          {loading ? <Spinner /> : error ? (
            <div className="notice warn">โหลดข้อมูลไม่สำเร็จ: {error}</div>
          ) : empty && !isAdmin ? (
            <div className="notice info">ระบบยังไม่มีข้อมูลเมนู — กรุณาแจ้ง Admin ให้นำเข้าข้อมูลเริ่มต้น</div>
          ) : <Outlet />}
        </main>
      </div>
      {!isAdmin && !inWizard && (
        <nav className="bottomnav">
          <NavLink to="/sales" end><span className="ico">⌂</span>หน้าแรก</NavLink>
          <NavLink to="/sales/new"><span className="ico">＋</span>สร้าง BEO</NavLink>
          <NavLink to="/sales/docs"><span className="ico">☰</span>เอกสารของฉัน</NavLink>
        </nav>
      )}
    </>
  )
}
