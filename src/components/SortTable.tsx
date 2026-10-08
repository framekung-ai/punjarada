import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react'

export type SortDir = 'asc' | 'desc'
export interface SortState<K extends string> { key: K; dir: SortDir }

/** Sort rows by one column. Click the same column again to flip A→Z / Z→A. */
export function useSort<T, K extends string>(rows: T[], getters: Record<K, (r: T) => string | number>, initial: SortState<K>) {
  const [sort, setSort] = useState<SortState<K>>(initial)
  const sorted = useMemo(() => {
    const get = getters[sort.key]
    const mul = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const x = get(a), y = get(b)
      const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'th')
      return c * mul
    })
  // getters is a static object literal per call site
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort])
  const toggle = (key: K) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }))
  return { sorted, sort, toggle, setSort }
}

/** Table header cell with a small up/down arrow that shows the column can be sorted. */
export function SortTh<K extends string>({ k, sort, onSort, children, className }: {
  k: K; sort: SortState<K>; onSort: (k: K) => void; children: ReactNode; className?: string
}) {
  const on = sort.key === k
  const Icon = !on ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`sortable${on ? ' on' : ''}${className ? ` ${className}` : ''}`} aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)}>
        <span>{children}</span><Icon size={13} strokeWidth={2.2} aria-hidden />
      </button>
    </th>
  )
}
