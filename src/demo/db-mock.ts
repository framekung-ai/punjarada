// Offline stand-in for src/lib/db.ts, used by `npm run demo`.
// Same exports, data kept in localStorage — lets you try the whole app with ZERO Firebase usage.
import seed from '../seed/seed.json'
import type { AppUser, Beo, Catalog, CustomerRecord, Settings } from '../lib/types'
import { buddhistYear } from '../lib/thai'
import { approverAfterSave } from '../lib/approver'

export const CATALOG_COLLECTIONS = ['categories', 'menuItems', 'menuSets', 'services', 'focRules'] as const
export type CatalogCollection = (typeof CATALOG_COLLECTIONS)[number]

interface Store {
  catalog: Catalog | null
  beos: Record<string, Beo & { _rev?: Beo[] }>
  customers: Record<string, CustomerRecord>
  users: AppUser[]
  counters: Record<string, number>
}

const KEY = 'pjd-demo-store'
const fresh = (): Store => ({
  catalog: { ...(seed as unknown as Omit<Catalog, 'version'>), version: 1 },
  beos: {},
  customers: {},
  users: [
    { uid: 'demo-admin', email: 'admin@demo', displayName: 'ผู้ดูแลระบบ (เดโม)', role: 'admin', active: true },
    { uid: 'demo-sales', email: 'sales@demo', displayName: 'สุชัญญา ทรายมูล', role: 'sales', active: true },
  ],
  counters: {},
})
function load(): Store {
  try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw) as Store } catch { /* ignore */ }
  return fresh()
}
let store = load()
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(store)) } catch { /* ignore */ } }
const delay = <T,>(v: T) => new Promise<T>((r) => setTimeout(() => r(structuredClone(v)), 60))
const now = () => ({ toDate: () => new Date() })
/** strip timestamp wrappers ({toDate}) so the object can be stored / cloned */
const plain = <T,>(v: T): T => {
  const { createdAt: _c, updatedAt: _u, confirmedAt: _cf, ...rest } = v as T & { createdAt?: unknown; updatedAt?: unknown; confirmedAt?: unknown }
  void _c; void _u; void _cf
  return JSON.parse(JSON.stringify(rest)) as T
}
let n = 0
const rid = () => `d${Date.now().toString(36)}${(n++).toString(36)}`

export function resetDemo() { store = fresh(); persist() }
export function clearCatalogCache() {}
export async function loadCatalog(): Promise<Catalog | null> { return delay(store.catalog) }
function bump() { if (store.catalog) store.catalog.version += 1; persist() }
export async function saveCatalogDoc(name: CatalogCollection, id: string, data: object) {
  if (!store.catalog) return
  const list = store.catalog[name] as { id: string }[]
  const doc = { ...(data as object), id } as { id: string }
  const i = list.findIndex((x) => x.id === id)
  if (i >= 0) list[i] = doc; else list.push(doc)
  bump()
}
export async function saveCatalogDocs(ops: { name: CatalogCollection; id: string; data: object }[]) {
  if (!store.catalog) return
  for (const { name, id, data } of ops) {
    const list = store.catalog[name] as { id: string }[]
    const d = { ...(data as object), id } as { id: string }
    const i = list.findIndex((x) => x.id === id)
    if (i >= 0) list[i] = d; else list.push(d)
  }
  bump()
}
export async function deleteCatalogDoc(name: CatalogCollection, id: string) {
  if (!store.catalog) return
  ;(store.catalog[name] as { id: string }[]) = (store.catalog[name] as { id: string }[]).filter((x) => x.id !== id)
  bump()
}
export async function saveSettings(s: Settings) { if (store.catalog) store.catalog.settings = s; bump() }
export function newId(): string { return rid() }
export async function seedCatalog(s: Omit<Catalog, 'version'>) { store.catalog = { ...structuredClone(s), version: Date.now() }; persist() }

export async function getAppUser(uid: string) { return delay(store.users.find((u) => u.uid === uid) ?? null) }
export async function listUsers() { return delay(store.users) }
export async function saveUser(u: AppUser) { store.users = [...store.users.filter((x) => x.uid !== u.uid), u]; persist() }
export async function createUserAccount(email: string, _p: string, displayName: string, role: AppUser['role']) {
  const u: AppUser = { uid: rid(), email, displayName, role, active: true }
  await saveUser(u)
  return u
}

export const phoneKey = (p: string) => p.replace(/\D/g, '')
export async function findCustomer(phone: string) { return delay(store.customers[phoneKey(phone)] ?? null) }

export async function createBeo(b: Beo) {
  const id = rid()
  store.beos[id] = { ...plain(b), id, createdAt: Date.now(), updatedAt: Date.now() }
  persist()
  return id
}
export async function updateBeo(id: string, b: Beo) { store.beos[id] = { ...store.beos[id], ...plain(b), deleteRequest: store.beos[id]?.deleteRequest ?? null, id, updatedAt: Date.now() }; persist() }
export async function submitBeo(id: string | undefined, b: Beo, actor: { uid: string; name: string; isAdmin: boolean }) {
  const bid = id ?? rid()
  const cur = store.beos[bid]
  const cs = cur?.status ?? null
  const wasSubmitted = !!cs && cs !== 'draft'
  const wasConfirmed = cs === 'confirmed' || cs === 'completed' || cs === 'cancelled'
  let docNo = cur?.docNo ?? b.docNo
  if (!docNo) {
    const y = buddhistYear(b.event.date || undefined)
    const next = (store.counters[y] ?? 0) + 1
    store.counters[y] = next
    docNo = `BEO-${y}-${(b.event.date || '').slice(5, 7)}-${String(next).padStart(4, '0')}`
  }
  const status: Beo['status'] = actor.isAdmin ? (b.status === 'draft' || b.status === 'pending' ? 'confirmed' : b.status) : 'pending'
  const revision = wasConfirmed ? (b.revision ?? 0) + 1 : (b.revision ?? 0)
  const approver = approverAfterSave(status, cs, cur ? { uid: cur.approvedByUid ?? null, name: cur.approvedByName ?? null } : null, actor)
  const saved = { ...plain(b), deleteRequest: cur?.deleteRequest ?? null, editedByUid: actor.uid, editedByName: actor.name, approvedByUid: approver.uid, approvedByName: approver.name, id: bid, docNo, revision, status, confirmedAt: status === 'confirmed' ? (cur?.confirmedAt ?? Date.now()) : cur?.confirmedAt, updatedAt: Date.now() } as Beo & { _rev?: Beo[] }
  const action = actor.isAdmin ? (status === 'confirmed' && cs !== 'confirmed' ? 'confirm' : 'edit') : (cs === 'pending' ? 'edit' : 'submit')
  saved._rev = [...(cur?._rev ?? []), { ...plain(b), docNo, revision, status, action, prevStatus: cs ?? 'new', savedBy: actor.uid, savedByName: actor.name, savedAt: Date.now() } as unknown as Beo]
  store.beos[bid] = saved
  const k = phoneKey(b.customer.phone)
  if (k.length >= 9 && k.length <= 10 && !wasSubmitted) store.customers[k] = { ...b.customer, phone: k, beoCount: (store.customers[k]?.beoCount ?? 0) + 1, updatedAt: Date.now() as never }
  persist()
  return { id: bid, docNo, status }
}
export async function listCustomers() {
  return Object.entries(structuredClone(store.customers)).map(([id, c]) => ({ ...c, id, updatedAt: { toDate: () => new Date((c.updatedAt as unknown as number) || Date.now()) } }))
}
export async function listBeosByPhone(phone: string) {
  return Object.values(structuredClone(store.beos)).filter((b) => phoneKey(b.customer.phone) === phoneKey(phone)).map(out)
}
function out(b: Beo & { _rev?: Beo[] }): Beo {
  const { _rev, ...rest } = b
  void _rev
  const toTs = (v: unknown) => (typeof v === 'number' ? { toDate: () => new Date(v) } : v)
  return { ...rest, confirmedAt: toTs(rest.confirmedAt), updatedAt: toTs(rest.updatedAt), createdAt: toTs(rest.createdAt) }
}
export async function getBeo(id: string) { const b = store.beos[id]; return b ? out(structuredClone(b)) : null }
export interface Actor { uid: string; name: string }
export async function setBeoStatus(id: string, status: Beo['status'], actor?: Actor, beo?: Beo) {
  const cur = store.beos[id]
  if (actor && beo) cur._rev = [...(cur._rev ?? []), { revision: beo.revision ?? 0, status, prevStatus: beo.status, action: 'status', docNo: beo.docNo, totals: beo.totals, savedBy: actor.uid, savedByName: actor.name, savedAt: Date.now() } as unknown as Beo]
  cur.status = status
  if (status === 'confirmed') cur.confirmedAt = Date.now()
  if (status === 'confirmed' && actor) { cur.approvedByUid = actor.uid; cur.approvedByName = actor.name }
  persist()
}
export async function requestDeleteBeo(id: string, by: Actor | null, reason = '') {
  store.beos[id].deleteRequest = by ? { byUid: by.uid, byName: by.name, at: Date.now(), reason } : null
  persist()
}
export async function listDeleteRequests() {
  return Object.values(structuredClone(store.beos)).filter((b) => !!b.deleteRequest).map(out)
}
export async function deleteBeo(id: string) { delete store.beos[id]; persist() }
export async function listMyBeos(uid: string) {
  return Object.values(structuredClone(store.beos)).filter((b) => b.salesUid === uid).map(out).sort((a, b) => b.event.date.localeCompare(a.event.date))
}
export async function listBeosBetween(from: string, to: string) {
  return Object.values(structuredClone(store.beos)).filter((b) => b.event.date >= from && b.event.date <= to).map(out)
}
export interface Booking { beoId: string; date: string; room: string; start: string; end: string; eventName: string; salesName: string; status: Beo['status'] }
export async function bookingsOnDate(date: string): Promise<Booking[]> {
  return Object.values(store.beos).filter((b) => b.event.date === date && b.status !== 'draft' && b.status !== 'cancelled')
    .map((b) => ({ beoId: b.id!, date, room: b.event.room, start: b.event.start, end: b.event.end, eventName: b.event.name, salesName: b.salesName, status: b.status }))
}
export type Revision = Beo & {
  savedBy?: string
  savedByName?: string
  savedAt?: { toDate(): Date }
  action?: 'submit' | 'edit' | 'confirm' | 'status'
  prevStatus?: Beo['status'] | 'new'
}
export async function listRevisions(id: string): Promise<Revision[]> {
  return (store.beos[id]?._rev ?? []).map((r) => {
    const at = (r as unknown as { savedAt?: number }).savedAt
    return { ...r, savedAt: typeof at === 'number' ? { toDate: () => new Date(at) } : now() }
  }).reverse() as Revision[]
}
export async function listPendingBeos() {
  return Object.values(structuredClone(store.beos)).filter((b) => b.status === 'pending').map(out).sort((a, b) => a.event.date.localeCompare(b.event.date))
}
export async function deleteCustomer(id: string) { delete store.customers[id]; persist() }
export async function deleteCustomers(ids: string[]) { ids.forEach((id) => delete store.customers[id]); persist() }
export async function deleteBeos(ids: string[]) { ids.forEach((id) => delete store.beos[id]); persist() }
