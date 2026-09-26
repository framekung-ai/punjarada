import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User } from 'firebase/auth'
import { auth } from './firebase'
import { getAppUser } from './db'
import type { AppUser } from './types'

interface AuthState {
  loading: boolean
  firebaseUser: User | null
  user: AppUser | null // null = signed in but no active profile
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null)
  const [user, setUser] = useState<AppUser | null>(null)

  useEffect(() => onAuthStateChanged(auth, async (fu) => {
    setLoading(true)
    setFirebaseUser(fu)
    if (fu) {
      try {
        const u = await getAppUser(fu.uid)
        setUser(u && u.active ? u : null)
      } catch {
        setUser(null)
      }
    } else {
      setUser(null)
    }
    setLoading(false)
  }), [])

  const value: AuthState = {
    loading, firebaseUser, user,
    login: async (email, password) => { await signInWithEmailAndPassword(auth, email.trim(), password) },
    logout: async () => { await signOut(auth) },
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
