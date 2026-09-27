import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, increment, limit, orderBy, query,
  runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import { deleteApp, initializeApp } from 'firebase/app'
import { createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { db, firebaseConfig } from './firebase'
import type {
  AppUser, Beo, Catalog, Category, CustomerRecord, FocRule, MenuItem, MenuSet, Service, Settings,
} from './types'
import { buddhistYear } from './thai'

// ---------------- Catalog (menu, sets, services, FOC, settings) ----------------
// Quota saver: the whole catalog (~170 docs) is cached in localStorage together with
// meta/catalog.version. On app start we read ONE document; the full catalog is only
// downloaded again when an Admin has changed something (version bumped).

export const CATALOG_COLLECTIONS = ['categories', 'menuItems', 'menuSets', 'services', 'focRules'] as const
export type CatalogCollection = (typeof CATALOG_COLLECTIONS)[number]

const LS_KEY = 'pjd-catalog'

function readCache(): Catalog | null {
  try {
    const raw = localStorage.getItem(LS_KEY)
    return raw ? (JSON.parse(raw) as Catalog) : null
  } catch {
    return null
  }
}
function writeCache(c: Catalog) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(c)) } catch { /* storage full or blocked */ }
}
export function clearCatalogCache() {
  try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
}

async function getAll<T>(name: string): Promise<T[]> {
  const snap = await getDocs(collection(db, name))
  return snap.docs.map((d) => ({ ...(d.data() as object), id: d.id }) as T)
}

/** Returns null when the database has not been seeded yet. */
export async function loadCatalog(force = false): Promise<Catalog | null> {
  const meta = await getDoc(doc(db, 'meta', 'catalog'))
  if (!meta.exists()) return null
  const version = Number(meta.data().version ?? 0)
  const cached = readCache()
  if (!force && cached && cached.version === version) return cached
  const [categories, menuItems, menuSets, services, focRules, settingsSnap] = await Promise.all([
    getAll<Category>('categories'),
    getAll<MenuItem>('menuItems'),
    getAll<MenuSet>('menuSets'),
    getAll<Service>('services'),
    getAll<FocRule>('focRules'),
    getDoc(doc(db, 'settings', 'app')),
  ])
  const bySort = <T extends { sort?: number }>(a: T, b: T) => (a.sort ?? 0) - (b.sort ?? 0)
  const catalog: Catalog = {
    version,
    categories: categories.sort(bySort),
    menuItems: menuItems.sort(bySort),
    menuSets: menuSets.sort(bySort),
    services: services.sort(bySort),
    focRules,
    settings: settingsSnap.data() as Settings,
  }
  writeCache(catalog)
  return catalog
}

async function bumpCatalog() {
  await setDoc(doc(db, 'meta', 'catalog'), { version: increment(1), updatedAt: serverTimestamp() }, { merge: true })
}

function clean<T extends object>(o: T): T {
  // Firestore rejects `undefined`
  return JSON.parse(JSON.stringify(o)) as T
}

export async function saveCatalogDoc(name: CatalogCollection, id: string, data: object) {
  const { id: _omit, ...rest } = data as { id?: string }
  void _omit
  await setDoc(doc(db, name, id), clean(rest))
  await bumpCatalog()
}

/** Write many catalog docs at once (CSV import) — batches of 400, one version bump. */
export async function saveCatalogDocs(ops: { name: CatalogCollection; id: string; data: object }[], onProgress?: (done: number, total: number) => void) {
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const { name, id, data } of ops.slice(i, i + 400)) {
      const { id: _omit, ...rest } = data as { id?: string }
      void _omit
      batch.set(doc(db, name, id), clean(rest))
    }
    await batch.commit()
    onProgress?.(Math.min(i + 400, ops.length), ops.length)
  }
  await bumpCatalog()
}

export async function deleteCatalogDoc(name: CatalogCollection, id: string) {
  await deleteDoc(doc(db, name, id))
  await bumpCatalog()
}

export async function saveSettings(s: Settings) {
  await setDoc(doc(db, 'settings', 'app'), clean(s))
  await bumpCatalog()
}

export function newId(name: CatalogCollection): string {
  return doc(collection(db, name)).id
}

/** One-time import of the starter data (menu CSV, 5 sets, services, FOC rules, settings). */
export async function seedCatalog(seed: Omit<Catalog, 'version'>, onProgress?: (done: number, total: number) => void) {
  const ops: [string, string, object][] = []
  for (const name of CATALOG_COLLECTIONS) {
    for (const d of seed[name] as { id: string }[]) {
      const { id, ...rest } = d
      ops.push([name, id, rest])
    }
  }
  ops.push(['settings', 'app', seed.settings])
  const total = ops.length
  for (let i = 0; i < ops.length; i += 400) {
    const batch = writeBatch(db)
    for (const [name, id, data] of ops.slice(i, i + 400)) batch.set(doc(db, name, id), clean(data))
    await batch.commit()
    onProgress?.(Math.min(i + 400, total), total)
  }
  await setDoc(doc(db, 'meta', 'catalog'), { version: Date.now(), updatedAt: serverTimestamp() })
}

// ---------------- Users ----------------

export async function getAppUser(uid: string): Promise<AppUser | null> {
  const s = await getDoc(doc(db, 'users', uid))
  return s.exists() ? ({ ...(s.data() as Omit<AppUser, 'uid'>), uid }) : null
}

export async function listUsers(): Promise<AppUser[]> {
  const snap = await getDocs(collection(db, 'users'))
  return snap.docs.map((d) => ({ ...(d.data() as Omit<AppUser, 'uid'>), uid: d.id }))
}

export async function saveUser(u: AppUser) {
  const { uid, ...rest } = u
  await setDoc(doc(db, 'users', uid), rest)
}

/** Creates a login without signing the Admin out (uses a throw-away secondary app). */
export async function createUserAccount(email: string, password: string, displayName: string, role: AppUser['role']) {
  const secondary = initializeApp(firebaseConfig, `create-${Date.now()}`)
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(secondary), email, password)
    await signOut(getAuth(secondary))
    const u: AppUser = { uid: cred.user.uid, email, displayName, role, active: true }
    await saveUser(u)
    return u
  } finally {
    await deleteApp(secondary)
  }
}

// ---------------- Customers ----------------

export const phoneKey = (p: string) => p.replace(/\D/g, '')

/** Admin: customer directory (newest first). */
export async function listCustomers(max = 500): Promise<CustomerRecord[]> {
  const snap = await getDocs(query(collection(db, 'customers'), orderBy('updatedAt', 'desc'), limit(max)))
  return snap.docs.map((d) => ({ ...(d.data() as CustomerRecord), id: d.id }))
}

/** Admin only (rules). Removes the directory entry; BEO documents keep their own copy of the customer details. */
export async function deleteCustomer(id: string) {
  await deleteDoc(doc(db, 'customers', id))
}

/** Admin only. Bulk delete of directory entries (BEOs are not touched). */
export async function deleteCustomers(ids: string[]) {
  for (let i = 0; i < ids.length; i += 450) {
    const batch = writeBatch(db)
    ids.slice(i, i + 450).forEach((id) => batch.delete(doc(db, 'customers', id)))
    await batch.commit()
  }
}

/** Admin: every BEO of one customer (by phone digits). */
export async function listBeosByPhone(phone: string): Promise<Beo[]> {
  const snap = await getDocs(query(collection(db, 'beos'), where('customer.phone', '==', phoneKey(phone))))
  return snap.docs.map((d) => ({ ...(d.data() as Beo), id: d.id })).sort((a, b) => b.event.date.localeCompare(a.event.date))
}

export async function findCustomer(phone: string): Promise<CustomerRecord | null> {
  const k = phoneKey(phone)
  if (k.length < 9) return null
  const s = await getDoc(doc(db, 'customers', k))
  return s.exists() ? (s.data() as CustomerRecord) : null
}

// ---------------- BEO ----------------

const beosCol = collection(db, 'beos')

function beoPayload(b: Beo) {
  // deleteRequest is written only by requestDeleteBeo, so normal saves never clear or forge it
  const { id: _id, createdAt: _c, updatedAt: _u, confirmedAt: _cf, deleteRequest: _dr, ...rest } = b
  void _id; void _c; void _u; void _cf; void _dr
  return clean(rest)
}

export async function createBeo(b: Beo): Promise<string> {
  const ref = await addDoc(beosCol, { ...beoPayload(b), createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  return ref.id
}

export async function updateBeo(id: string, b: Beo) {
  await updateDoc(doc(db, 'beos', id), { ...beoPayload(b), updatedAt: serverTimestamp() })
}

/**
 * Submit a BEO.
 * - Sales: status -> "pending" (รอการยืนยัน). Admin reviews and confirms later.
 * - Admin: status -> "confirmed" (or keeps completed/cancelled when re-saving).
 * Gives a running number on first submit, bumps the revision when a confirmed BEO is edited,
 * stores an append-only revision snapshot, the public room booking and the customer record.
 */
export async function submitBeo(
  id: string | undefined, b: Beo, actor: { uid: string; name: string; isAdmin: boolean },
): Promise<{ id: string; docNo: string; status: Beo['status'] }> {
  const ref = id ? doc(db, 'beos', id) : doc(beosCol)
  return runTransaction(db, async (tx) => {
    const current = id ? await tx.get(ref) : null
    const cs = current?.exists() ? (current.data().status as Beo['status']) : null
    const wasSubmitted = !!cs && cs !== 'draft'
    const wasConfirmed = cs === 'confirmed' || cs === 'completed' || cs === 'cancelled'
    let docNo = (current?.data()?.docNo as string | null) ?? b.docNo
    const custKey = phoneKey(b.customer.phone)
    const custRef = custKey.length >= 9 ? doc(db, 'customers', custKey) : null
    const cust = custRef ? await tx.get(custRef) : null
    if (!docNo) {
      const year = buddhistYear(b.event.date || undefined)
      const cRef = doc(db, 'counters', `beo-${year}`)
      const c = await tx.get(cRef)
      const next = (c.exists() ? Number(c.data().seq) : 0) + 1
      if (c.exists()) tx.update(cRef, { seq: next })
      else tx.set(cRef, { seq: next })
      const mm = (b.event.date || '').slice(5, 7) || '00'
      docNo = `BEO-${year}-${mm}-${String(next).padStart(4, '0')}`
    }
    const status: Beo['status'] = actor.isAdmin
      ? (b.status === 'draft' || b.status === 'pending' ? 'confirmed' : b.status)
      : 'pending'
    const revision = wasConfirmed ? (b.revision ?? 0) + 1 : (b.revision ?? 0)
    const saved = { ...b, docNo, revision, status, editedByUid: actor.uid, editedByName: actor.name }
    const data = {
      ...beoPayload(saved),
      updatedAt: serverTimestamp(),
      ...(status === 'confirmed' && !wasConfirmed ? { confirmedAt: serverTimestamp() } : {}),
      ...(current?.exists() ? {} : { createdAt: serverTimestamp() }),
    }
    if (current?.exists()) tx.update(ref, data)
    else tx.set(ref, data)
    tx.set(doc(db, 'beos', ref.id, 'revisions', `${revision}-${Date.now()}`), {
      ...beoPayload(saved),
      action: actor.isAdmin ? (status === 'confirmed' && cs !== 'confirmed' ? 'confirm' : 'edit') : (cs === 'pending' ? 'edit' : 'submit'),
      prevStatus: cs ?? 'new',
      savedAt: serverTimestamp(), savedBy: actor.uid, savedByName: actor.name,
    })
    tx.set(doc(db, 'bookings', ref.id), {
      beoId: ref.id, date: b.event.date, room: b.event.room, start: b.event.start, end: b.event.end,
      eventName: b.event.name, salesName: b.salesName, status, salesUid: b.salesUid,
    })
    if (custRef && !wasSubmitted) {
      const c = b.customer
      tx.set(custRef, {
        name: c.name, phone: custKey, organization: c.organization, address: c.address,
        contactName: c.contactName, contactPhone: c.contactPhone,
        beoCount: (cust?.exists() ? Number(cust.data().beoCount ?? 0) : 0) + 1,
        updatedAt: serverTimestamp(),
      })
    }
    return { id: ref.id, docNo, status }
  })
}

export async function getBeo(id: string): Promise<Beo | null> {
  const s = await getDoc(doc(db, 'beos', id))
  return s.exists() ? ({ ...(s.data() as Beo), id: s.id }) : null
}

export interface Actor { uid: string; name: string }

/** Admin only (rules). Keeps the public booking in sync and logs the change in the history. */
export async function setBeoStatus(id: string, status: Beo['status'], actor?: Actor, beo?: Beo) {
  const batch = writeBatch(db)
  if (actor && beo) {
    batch.set(doc(db, 'beos', id, 'revisions', `${beo.revision ?? 0}-${Date.now()}`), {
      revision: beo.revision ?? 0, status, prevStatus: beo.status, action: 'status', docNo: beo.docNo ?? null,
      totals: beo.totals, savedAt: serverTimestamp(), savedBy: actor.uid, savedByName: actor.name,
    })
  }
  batch.update(doc(db, 'beos', id), {
    status, updatedAt: serverTimestamp(), ...(status === 'confirmed' ? { confirmedAt: serverTimestamp() } : {}),
  })
  const bk = await getDoc(doc(db, 'bookings', id))
  if (bk.exists()) batch.update(doc(db, 'bookings', id), { status })
  await batch.commit()
}

/** Admin only. Bulk delete BEOs and their room bookings. */
export async function deleteBeos(ids: string[]) {
  for (let i = 0; i < ids.length; i += 200) {
    const batch = writeBatch(db)
    for (const id of ids.slice(i, i + 200)) {
      batch.delete(doc(db, 'beos', id))
      batch.delete(doc(db, 'bookings', id))
    }
    await batch.commit()
  }
}

/**
 * Sales: ask Admin to delete a BEO that is already confirmed (or clear the request with null).
 * Admin approves with deleteBeo, or rejects with requestDeleteBeo(id, null).
 */
export async function requestDeleteBeo(id: string, by: Actor | null, reason = '') {
  await updateDoc(doc(db, 'beos', id), {
    deleteRequest: by ? { byUid: by.uid, byName: by.name, at: serverTimestamp(), reason } : null,
    updatedAt: serverTimestamp(),
  })
}

/** Admin: BEOs with an open delete request from Sales. */
export async function listDeleteRequests(max = 100): Promise<Beo[]> {
  const snap = await getDocs(query(beosCol, where('deleteRequest.byUid', '!=', null), limit(max)))
  return snap.docs.map((d) => ({ ...(d.data() as Beo), id: d.id })).filter((b) => !!b.deleteRequest)
}

/** Admin — or Sales for their own draft / never-confirmed pending BEO (rules). Revisions stay as an audit trail. */
export async function deleteBeo(id: string) {
  const batch = writeBatch(db)
  batch.delete(doc(db, 'beos', id))
  batch.delete(doc(db, 'bookings', id))
  await batch.commit()
}

export async function listMyBeos(uid: string, max = 50): Promise<Beo[]> {
  const q = query(beosCol, where('salesUid', '==', uid), orderBy('event.date', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...(d.data() as Beo), id: d.id }))
}

/** Admin: every BEO waiting for confirmation (any month). */
export async function listPendingBeos(max = 100): Promise<Beo[]> {
  const snap = await getDocs(query(beosCol, where('status', '==', 'pending'), limit(max)))
  return snap.docs.map((d) => ({ ...(d.data() as Beo), id: d.id })).sort((a, b) => a.event.date.localeCompare(b.event.date))
}

/** Admin: BEOs whose event date is within [from, to] (YYYY-MM-DD). */
export async function listBeosBetween(from: string, to: string, max = 300): Promise<Beo[]> {
  const q = query(beosCol, where('event.date', '>=', from), where('event.date', '<=', to), orderBy('event.date', 'desc'), limit(max))
  const snap = await getDocs(q)
  return snap.docs.map((d) => ({ ...(d.data() as Beo), id: d.id }))
}

export interface Booking {
  beoId: string
  date: string
  room: string
  start: string
  end: string
  eventName: string
  salesName: string
  status: Beo['status']
}

/**
 * Room clash check. Every submitted BEO also writes a small `bookings/{beoId}` doc
 * (date, room, time only) so the check is one cheap query per date.
 */
export async function bookingsOnDate(date: string): Promise<Booking[]> {
  const snap = await getDocs(query(collection(db, 'bookings'), where('date', '==', date)))
  return snap.docs.map((d) => d.data() as Booking).filter((b) => b.status !== 'cancelled')
}

export type Revision = Beo & {
  savedBy?: string
  savedByName?: string
  savedAt?: { toDate(): Date }
  action?: 'submit' | 'edit' | 'confirm' | 'status'
  prevStatus?: Beo['status'] | 'new'
}

export async function listRevisions(id: string) {
  const snap = await getDocs(query(collection(db, 'beos', id, 'revisions'), orderBy('savedAt', 'desc')))
  return snap.docs.map((d) => d.data() as Revision)
}
