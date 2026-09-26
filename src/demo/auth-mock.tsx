// Offline stand-in for src/lib/auth.tsx (used by `npm run demo`).
// Sign in with any email containing "admin" to be Admin, anything else = Sales.
import { createContext, useContext, useState, type ReactNode } from 'react'
import type { AppUser } from '../lib/types'
import { listUsers } from './db-mock'

interface AuthState {
  loading: boolean
  firebaseUser: { uid: string; email: string } | null
  user: AppUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}
const Ctx = createContext<AuthState | null>(null)
const KEY = 'pjd-demo-user'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(() => {
    try { const raw = sessionStorage.getItem(KEY); return raw ? (JSON.parse(raw) as AppUser) : null } catch { return null }
  })
  const value: AuthState = {
    loading: false,
    firebaseUser: user ? { uid: user.uid, email: user.email } : null,
    user,
    login: async (email) => {
      const users = await listUsers()
      const u = users.find((x) => x.role === (email.includes('admin') ? 'admin' : 'sales'))!
      sessionStorage.setItem(KEY, JSON.stringify(u))
      setUser(u)
    },
    logout: async () => { sessionStorage.removeItem(KEY); setUser(null) },
  }
  return (
    <Ctx.Provider value={value}>
      <div style={{ background: '#fff6dc', color: '#6e5200', textAlign: 'center', fontSize: 13, padding: 4 }}>
        โหมดทดลอง (ไม่เชื่อมต่อ Firebase) — ล็อกอินด้วยอีเมลที่มีคำว่า admin เพื่อเข้า Admin
      </div>
      {children}
    </Ctx.Provider>
  )
}
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
