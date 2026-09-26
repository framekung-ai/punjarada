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
  it('sales read their own BEO', () => assertSucceeds(getDoc(doc(as('sales1'), 'beos/d1'))))
  it("sales cannot read someone else's BEO", () => assertFails(getDoc(doc(as('sales1'), 'beos/d2'))))
  it('sales list only their own BEOs', async () => {
    await assertSucceeds(getDocs(query(collection(as('sales1'), 'beos'), where('salesUid', '==', 'sales1'))))
    await assertFails(getDocs(collection(as('sales1'), 'beos')))
  })
  it('sales create a draft for themselves', () => assertSucceeds(setDoc(doc(as('sales1'), 'beos/n1'), beo('sales1'))))
  it('sales cannot create a BEO in another name', () => assertFails(setDoc(doc(as('sales1'), 'beos/n2'), beo('sales2'))))
  it('sales edit their draft', () => assertSucceeds(updateDoc(doc(as('sales1'), 'beos/d1'), { note: 'แก้' })))
  it('sales cannot edit after confirmation', () => assertFails(updateDoc(doc(as('sales1'), 'beos/c1'), { note: 'แก้' })))
  it('sales cannot mark a draft completed', () => assertFails(updateDoc(doc(as('sales1'), 'beos/d1'), { status: 'completed' })))
  it('admin edits confirmed BEOs', () => assertSucceeds(updateDoc(doc(as('admin1'), 'beos/c1'), { note: 'แก้' })))
  it('only admin deletes', async () => {
    await assertFails(deleteDoc(doc(as('sales1'), 'beos/d1')))
    await assertSucceeds(deleteDoc(doc(as('admin1'), 'beos/d1')))
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
  it("sales cannot write a booking for someone else's BEO", () =>
    assertFails(setDoc(doc(as('sales1'), 'bookings/d2'), { salesUid: 'sales1', date: '2026-10-15', room: 'x' })))
})
