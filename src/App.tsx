import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { CatalogProvider, useCatalog } from './lib/catalog'
import { Spinner, ToastProvider } from './components/ui'
import { AppShell } from './components/Layout'
import { Login } from './pages/Login'
import { MyDocs, SalesHome } from './pages/sales/SalesPages'
import { Wizard } from './pages/wizard/Wizard'
import { BeoView } from './pages/BeoView'

// Admin pages are loaded on demand so Sales phones download less
const Admin = lazy(() => import('./pages/admin/AdminPages'))

function NeedCatalog({ children }: { children: ReactNode }) {
  const { catalog } = useCatalog()
  if (!catalog) return <div className="notice info">ยังไม่มีข้อมูลเมนู — ไปที่ “นำเข้าข้อมูล” เพื่อติดตั้งข้อมูลเริ่มต้น</div>
  return <>{children}</>
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (user?.role !== 'admin') return <Navigate to="/sales" replace />
  return <Suspense fallback={<Spinner />}>{children}</Suspense>
}

function Gate() {
  const { loading, user } = useAuth()
  if (loading) return <Spinner />
  if (!user) return <Login />
  const home = user.role === 'admin' ? '/admin' : '/sales'
  return (
    <CatalogProvider>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<Navigate to={home} replace />} />
          <Route path="/sales" element={user.role === 'admin' ? <Navigate to="/admin" replace /> : <SalesHome />} />
          <Route path="/sales/docs" element={<MyDocs />} />
          <Route path="/sales/new" element={<NeedCatalog><Wizard key="new" /></NeedCatalog>} />
          <Route path="/sales/beo/:id/edit" element={<NeedCatalog><Wizard /></NeedCatalog>} />
          <Route path="/beo/:id" element={<NeedCatalog><BeoView /></NeedCatalog>} />
          <Route path="/admin/beo/:id/edit" element={<AdminOnly><NeedCatalog><Wizard /></NeedCatalog></AdminOnly>} />
          <Route path="/admin/*" element={<AdminOnly><Admin /></AdminOnly>} />
          <Route path="*" element={<Navigate to={home} replace />} />
        </Route>
      </Routes>
    </CatalogProvider>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  )
}
