import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen, CalendarDays, ClipboardList, Contact, FilePlus2, FileText, Gift, LayoutDashboard, LayoutList, LogOut,
  Settings, Tags, UploadCloud, UserCog, UtensilsCrossed, Wrench, type LucideIcon,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useCatalog } from '../lib/catalog'
import { Spinner } from './ui'

type NavItem = [to: string, label: string, icon: LucideIcon]

export const ADMIN_NAV: { group: string; items: NavItem[] }[] = [
  {
    group: 'งาน', items: [
      ['/admin', 'แดชบอร์ด', LayoutDashboard],
      ['/admin/beos', 'เอกสาร BEO', FileText],
      ['/admin/customers', 'ลูกค้า', Contact],
      ['/sales/new', 'สร้าง BEO', FilePlus2],
    ],
  },
  {
    group: 'เมนู', items: [
      ['/admin/menu', 'เมนูอาหาร', UtensilsCrossed],
      ['/admin/categories', 'หมวดหมู่', Tags],
      ['/admin/sets', 'เซ็ตเมนู', BookOpen],
      ['/admin/templates', 'โครงมื้อ', LayoutList],
    ],
  },
  {
    group: 'ตั้งค่า', items: [
      ['/admin/services', 'บริการ', Wrench],
      ['/admin/foc', 'กฎ FOC', Gift],
      ['/admin/settings', 'ทั่วไป / ห้อง', Settings],
      ['/admin/users', 'ผู้ใช้งาน', UserCog],
      ['/admin/setup', 'นำเข้าข้อมูล', UploadCloud],
    ],
  },
]

const SALES_NAV: NavItem[] = [
  ['/sales', 'เอกสารของฉัน', ClipboardList],
  ['/sales/new', 'สร้าง BEO', FilePlus2],
  ['/sales/all', 'เอกสารทั้งหมด', CalendarDays],
]

export function AppShell() {
  const { user, logout } = useAuth()
  const { loading, error, empty } = useCatalog()
  const isAdmin = user?.role === 'admin'

  return (
    <>
      <header className="topbar">
        <img src="/logo-256.jpg" alt="" />
        <div className="grow">
          <div className="title">PunjadaraPOS</div>
          <div className="small muted">{user?.displayName} · {isAdmin ? 'Admin' : 'Sales'}</div>
        </div>
        <button className="btn small ghost" onClick={() => void logout()} aria-label="ออกจากระบบ" title="ออกจากระบบ"><LogOut size={18} aria-hidden /> <span className="hide-mobile">ออกจากระบบ</span></button>
      </header>
      {!isAdmin && (
        // Sales: always-visible navigator (also inside the form) so earlier documents are one tap away
        <nav className="sales-tabs" aria-label="เมนูหลัก">
          {SALES_NAV.map(([to, label, Icon]) => (
            <NavLink key={to} to={to} end={to === '/sales'}><Icon size={20} aria-hidden /><span>{label}</span></NavLink>
          ))}
        </nav>
      )}
      <div className="shell">
        {isAdmin && (
          <nav className="sidenav" aria-label="เมนู Admin">
            {ADMIN_NAV.map((g) => (
              <div key={g.group} className="stack" style={{ gap: 2 }}>
                <div className="group">{g.group}</div>
                {g.items.map(([to, label, Icon]) => (
                  <NavLink key={to} to={to} end={to === '/admin'}><Icon size={19} strokeWidth={1.9} aria-hidden /><span>{label}</span></NavLink>
                ))}
              </div>
            ))}
          </nav>
        )}
        <main className="main">
          {isAdmin && (
            <div className="admin-menu">
              {ADMIN_NAV.flatMap((g) => g.items).map(([to, label, Icon]) => (
                <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => `chip small${isActive ? ' on' : ''}`}>
                  <Icon size={16} aria-hidden />{label}
                </NavLink>
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
    </>
  )
}
