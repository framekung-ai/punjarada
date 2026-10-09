// Customer directory helpers shared by db.ts and the demo mock.
import type { Beo } from './types'
import { isRoomService } from './roomService'

export const phoneDigits = (p: string) => (p ?? '').replace(/\D/g, '')
/** directory doc id must be a 9–10 digit Thai number (firestore.rules) */
export const validCustomerPhone = (p: string) => /^[0-9]{9,10}$/.test(phoneDigits(p))

/** a job counts for the customer once it is sent (drafts don't count; Room service uses the hotel's number) */
export const countsAsJob = (b: Pick<Beo, 'status' | 'eventType'>) => b.status !== 'draft' && !isRoomService(b)

/** jobs per phone number, from a list of BEOs */
export function jobCounts(beos: Pick<Beo, 'status' | 'eventType' | 'customer'>[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const b of beos) {
    if (!countsAsJob(b)) continue
    const k = phoneDigits(b.customer.phone)
    if (k) m.set(k, (m.get(k) ?? 0) + 1)
  }
  return m
}

export interface CustomerEdit {
  name: string
  phone: string
  organization: string
}
