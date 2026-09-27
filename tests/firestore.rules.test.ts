import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where } from 'firebase/firestore'

let env: RulesTestEnvironment

const beo = (salesUid: string, status = 'draft') => ({
  status, salesUid, salesName: 'x', note: '',
  customer: { name: 'ลูกค้า' }, event: { date: '2026-10-15' }, seating: {}, lines: [], totals: { grandTotal: 0 },
})

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-punjadara',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env.cleanup() })

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'users/admin1'), { email: 'a@x', displayName: 'A', role: 'admin', active: true })
    await setDoc(doc(db, 'users/sales1'), { email: 's1@x', displayName: 'S1', role: 'sales', active: true })
    await setDoc(doc(db, 'users/sales2'), { email: 's2@x', displayName: 'S2', role: 'sales', active: true })
    await setDoc(doc(db, 'users/off1'), { email: 'o@x', displayName: 'O', role: 'sales', active: false })
    await setDoc(doc(db, 'menuItems/m1'), { name: 'ไก่ทอดเกลือ', price: 400 })
    await setDoc(doc(db, 'beos/d1'), beo('sales1'))
    await setDoc(doc(db, 'beos/c1'), beo('sales1', 'confirmed'))
    await setDoc(doc(db, 'beos/d2'), beo('sales2'))
    await setDoc(doc(db, 'counters/beo-2569'), { seq: 3 })
    await setDoc(doc(db, 'beos/c1/revisions/0'), { revision: 0 })
  })
})

const as = (uid: string | null) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()

describe('who can read anything at all', () => {
  it('signed-out users read nothing', () => assertFails(getDoc(doc(as(null), 'menuItems/m1'))))
  it('signed-in account without a profile reads nothing', () => assertFails(getDoc(doc(as('stranger'), 'menuItems/m1'))))
  it('deactivated staff read nothing', () => assertFails(getDoc(doc(as('off1'), 'menuItems/m1'))))
  it('active sales read the menu', () => assertSucceeds(getDoc(doc(as('sales1'), 'menuItems/m1'))))
})

describe('catalog', () => {
  it('sales cannot change prices', () => assertFails(updateDoc(doc(as('sales1'), 'menuItems/m1'), { price: 1 })))
  it('admin can change prices', () => assertSucceeds(updateDoc(doc(as('admin1'), 'menuItems/m1'), { price: 450 })))
  it('negative prices are rejected', () => assertFails(updateDoc(doc(as('admin1'), 'menuItems/m1'), { price: -1 })))
})

describe('users & roles', () => {
  it('sales cannot promote themselves', () => assertFails(updateDoc(doc(as('sales1'), 'users/sales1'), { role: 'admin' })))
  it('sales cannot read other profiles', () => assertFails(getDoc(doc(as('sales1'), 'users/sales2'))))
  it('admin can change a role', () => assertSucceeds(setDoc(doc(as('admin1'), 'users/sales2'), { email: 's2@x', displayName: 'S2', role: 'admin', active: true })))
  it('admin cannot lock themselves out', () => assertFails(setDoc(doc(as('admin1'), 'users/admin1'), { email: 'a@x', displayName: 'A', role: 'sales', active: true })))
})

describe('BEO documents', () => {
  const me = (uid: string) => ({ editedByUid: uid, editedByName: uid })
  const seed = (id: string, data: object) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `beos/${id}`), data))

  // --- read: the whole team sees every BEO (schedule / cross-check)
  it('sales read their own BEO', () => assertSucceeds(getDoc(doc(as('sales1'), 'beos/d1'))))
  it("sales read a colleague's BEO", () => assertSucceeds(getDoc(doc(as('sales1'), 'beos/d2'))))
  it('sales list all BEOs of a month', () => assertSucceeds(getDocs(query(collection(as('sales1'), 'beos'), where('event.date', '>=', '2026-10-01')))))
  it('deactivated staff read no BEO', () => assertFails(getDoc(doc(as('off1'), 'beos/d1'))))

  // --- create
  it('sales create a draft for themselves', () => assertSucceeds(setDoc(doc(as('sales1'), 'beos/n1'), beo('sales1'))))
  it('sales cannot create a BEO in another name', () => assertFails(setDoc(doc(as('sales1'), 'beos/n2'), beo('sales2'))))
  it('sales cannot create an already-confirmed BEO', () => assertFails(setDoc(doc(as('sales1'), 'beos/n3'), beo('sales1', 'confirmed'))))

  // --- edit
  it('sales edit their draft', () => assertSucceeds(updateDoc(doc(as('sales1'), 'beos/d1'), { note: 'แก้', ...me('sales1') })))
  it('an edit must be stamped with the editor', () => assertFails(updateDoc(doc(as('sales1'), 'beos/d1'), { note: 'แก้', ...me('sales2') })))
  it("sales edit a colleague's draft (owner unchanged)", () => assertSucceeds(updateDoc(doc(as('sales1'), 'beos/d2'), { note: 'แก้', ...me('sales1') })))
  it("sales cannot take over a colleague's BEO", () => assertFails(updateDoc(doc(as('sales1'), 'beos/d2'), { salesUid: 'sales1', ...me('sales1') })))
  it('sales submit a BEO for confirmation', () => assertSucceeds(updateDoc(doc(as('sales1'), 'beos/d1'), { status: 'pending', ...me('sales1') })))
  it('sales cannot confirm a BEO', () => assertFails(updateDoc(doc(as('sales1'), 'beos/d1'), { status: 'confirmed', ...me('sales1') })))
  it('sales cannot mark a draft completed', () => assertFails(updateDoc(doc(as('sales1'), 'beos/d1'), { status: 'completed', ...me('sales1') })))
  it('sales can still edit while pending', async () => {
    await seed('p1', beo('sales1', 'pending'))
    await assertSucceeds(updateDoc(doc(as('sales1'), 'beos/p1'), { note: 'แก้', ...me('sales1') }))
  })
  it('editing a confirmed BEO sends it back to pending', async () => {
    await assertFails(updateDoc(doc(as('sales1'), 'beos/c1'), { note: 'แก้', ...me('sales1') })) // stays confirmed → no
    await assertSucceeds(updateDoc(doc(as('sales2'), 'beos/c1'), { note: 'แก้', status: 'pending', ...me('sales2') }))
  })
  it('a confirmed BEO cannot be turned back into a draft', () => assertFails(updateDoc(doc(as('sales1'), 'beos/c1'), { status: 'draft', ...me('sales1') })))
  it('completed / cancelled BEOs are Admin-only', async () => {
    await seed('k1', beo('sales1', 'completed'))
    await assertFails(updateDoc(doc(as('sales1'), 'beos/k1'), { status: 'pending', ...me('sales1') }))
  })
  it('admin confirms a pending BEO', async () => {
    await seed('p2', beo('sales1', 'pending'))
    await assertSucceeds(updateDoc(doc(as('admin1'), 'beos/p2'), { status: 'confirmed' }))
  })
  it('admin edits confirmed BEOs', () => assertSucceeds(updateDoc(doc(as('admin1'), 'beos/c1'), { note: 'แก้' })))

  // --- delete
  it('sales delete their own draft', () => assertSucceeds(deleteDoc(doc(as('sales1'), 'beos/d1'))))
  it("sales cannot delete a colleague's draft", () => assertFails(deleteDoc(doc(as('sales1'), 'beos/d2'))))
  it('sales delete their own never-confirmed pending BEO', async () => {
    await seed('p3', beo('sales1', 'pending'))
    await assertSucceeds(deleteDoc(doc(as('sales1'), 'beos/p3')))
  })
  it('sales cannot delete a pending BEO that was confirmed before', async () => {
    await seed('p4', { ...beo('sales1', 'pending'), confirmedAt: new Date() })
    await assertFails(deleteDoc(doc(as('sales1'), 'beos/p4')))
  })
  it('sales cannot delete a confirmed BEO', () => assertFails(deleteDoc(doc(as('sales1'), 'beos/c1'))))
  it('admin deletes anything', () => assertSucceeds(deleteDoc(doc(as('admin1'), 'beos/c1'))))

  // --- delete request (confirmed BEOs)
  const req = (uid: string) => ({ deleteRequest: { byUid: uid, byName: uid, at: new Date() } })
  it('owner asks Admin to delete a confirmed BEO', () => assertSucceeds(updateDoc(doc(as('sales1'), 'beos/c1'), req('sales1'))))
  it('owner withdraws the request', async () => {
    await seed('c2', { ...beo('sales1', 'confirmed'), ...req('sales1') })
    await assertSucceeds(updateDoc(doc(as('sales1'), 'beos/c2'), { deleteRequest: null }))
  })
  it("a colleague cannot ask to delete someone else's BEO", () => assertFails(updateDoc(doc(as('sales2'), 'beos/c1'), req('sales2'))))
  it('a delete request cannot smuggle other changes', () => assertFails(updateDoc(doc(as('sales1'), 'beos/c1'), { ...req('sales1'), status: 'cancelled' })))
  it('a normal edit cannot clear a delete request', async () => {
    await seed('c3', { ...beo('sales1', 'confirmed'), ...req('sales1') })
    await assertFails(updateDoc(doc(as('sales2'), 'beos/c3'), { status: 'pending', deleteRequest: null, ...me('sales2') }))
  })

  // --- history
  it('all staff read the history', () => assertSucceeds(getDocs(collection(as('sales2'), 'beos/c1/revisions'))))
  it('history entries carry the real editor', async () => {
    await assertSucceeds(setDoc(doc(as('sales2'), 'beos/c1/revisions/1-x'), { revision: 1, savedBy: 'sales2' }))
    await assertFails(setDoc(doc(as('sales2'), 'beos/c1/revisions/1-y'), { revision: 1, savedBy: 'sales1' }))
  })
  it('revision history cannot be rewritten', () => assertFails(setDoc(doc(as('admin1'), 'beos/c1/revisions/0'), { revision: 9 })))
})

describe('running number', () => {
  it('+1 is allowed', () => assertSucceeds(updateDoc(doc(as('sales1'), 'counters/beo-2569'), { seq: 4 })))
  it('skipping numbers is not', () => assertFails(updateDoc(doc(as('sales1'), 'counters/beo-2569'), { seq: 9 })))
  it('a new year starts at 1', () => assertSucceeds(setDoc(doc(as('sales1'), 'counters/beo-2570'), { seq: 1 })))
})

describe('room bookings', () => {
  it('all staff can see bookings', () => assertSucceeds(getDocs(collection(as('sales2'), 'bookings'))))
  it('a booking must match its BEO owner', () =>
    assertFails(setDoc(doc(as('sales1'), 'bookings/d2'), { salesUid: 'sales1', date: '2026-10-15', room: 'x' })))
  it('a booking for a BEO the user did not just edit is refused', () =>
    assertFails(setDoc(doc(as('sales1'), 'bookings/d2'), { salesUid: 'sales2', date: '2026-10-15', room: 'x' })))
  it('deleting a missing booking together with a draft is allowed', () => assertSucceeds(deleteDoc(doc(as('sales1'), 'bookings/none'))))
})
