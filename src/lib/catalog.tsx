import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { loadCatalog } from './db'
import type { Catalog } from './types'

interface CatalogState {
  catalog: Catalog | null
  loading: boolean
  error: string | null
  /** true when the database has no catalog yet (Admin must run the setup page) */
  empty: boolean
  reload: (force?: boolean) => Promise<void>
}

const Ctx = createContext<CatalogState | null>(null)

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)

  const reload = useCallback(async (force = false) => {
    setLoading(true)
    setError(null)
    try {
      const c = await loadCatalog(force)
      setCatalog(c)
      setEmpty(c === null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  return <Ctx.Provider value={{ catalog, loading, error, empty, reload }}>{children}</Ctx.Provider>
}

export function useCatalog(): CatalogState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useCatalog outside CatalogProvider')
  return v
}

/** For pages that need a loaded catalog. */
export function useReadyCatalog(): Catalog {
  const { catalog } = useCatalog()
  if (!catalog) throw new Error('catalog not loaded')
  return catalog
}
