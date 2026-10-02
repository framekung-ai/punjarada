import { describe, expect, it } from 'vitest'
import type { Beo, BeoLine } from './types'
import { changesForHistory, describeChanges } from './revisionDiff'

const line = (key: string, name: string, qty: number, extra: Partial<BeoLine> = {}): BeoLine => ({ key, kind: 'item', name, qty, unit: 'จาน', unitPrice: 300, ...extra })
const base = (): Partial<Beo> => ({
  eventType: 'จัดเลี้ยง', event: { name: 'งานเลี้ยง', date: '2026-10-02', start: '11:00', end: '14:00', room: 'เมขลา' },
  customer: { name: 'ก', phone: '0811111111', organization: '', address: '', contactName: '', contactPhone: '' },
  seating: { guests: 50, layout: 'โต๊ะจีน', tables: 5, seatsPerTable: 10, spareTables: 0 },
  lines: [line('a', 'ยำวุ้นเส้น', 5), line('b', 'ต้มยำ', 5)], terms: [], note: '',
  totals: { subtotal: 3000, discount: 0, vat: 210, grandTotal: 3210, focValue: 0 },
})

describe('edit history labels', () => {
  it('lists added / removed dishes, quantities and guests', () => {
    const prev = base()
    const cur = { ...base(), seating: { ...prev.seating!, guests: 60, tables: 6 }, lines: [line('a', 'ยำวุ้นเส้น', 6), line('c', 'ไก่ทอดเกลือ', 6)] }
    expect(describeChanges(prev, cur)).toEqual(['แขก 50 → 60 ท่าน', 'โต๊ะ 5 → 6', 'ยำวุ้นเส้น 5 → 6 จาน', 'เพิ่ม ไก่ทอดเกลือ', 'ลบ ต้มยำ'])
  })
  it('describes discounts and free items', () => {
    const prev = base()
    const cur = {
      ...base(), lines: [line('a', 'ยำวุ้นเส้น', 5, { free: true }), line('b', 'ต้มยำ', 5)], discountRule: { kind: 'percent' as const, value: 10 },
      totals: { subtotal: 1350, discount: 1650, vat: 0, grandTotal: 1350, focValue: 0, freeValue: 1500, ruleDiscount: 150 },
    }
    expect(describeChanges(prev, cur)).toEqual(['ให้ฟรี ยำวุ้นเส้น', 'มอบส่วนลด 10% (150 บาท)'])
  })
  it('moves of date, time and room', () => {
    const cur = { ...base(), event: { name: 'งานเลี้ยง', date: '2026-10-03', start: '18:00', end: '22:00', room: 'สุพรรณหงส์' } }
    expect(describeChanges(base(), cur)).toEqual(['เลื่อนวันงาน 2 ต.ค. 2569 → 3 ต.ค. 2569', 'เวลา 11.00 – 14.00 น. → 18.00 – 22.00 น.', 'ห้อง เมขลา → สุพรรณหงส์'])
  })
  it('skips status-only entries when pairing (newest first)', () => {
    const v1 = base()
    const status = { action: 'status', status: 'confirmed' as const }
    const v2 = { ...base(), note: 'ขอโต๊ะหน้า' }
    expect(changesForHistory([v2, status, v1] as Partial<Beo>[])).toEqual([['แก้หมายเหตุ'], [], []])
  })
})
