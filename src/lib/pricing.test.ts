import { describe, expect, it } from 'vitest'
import seed from '../seed/seed.json'
import type { Beo, BeoLine, Catalog } from './types'
import { checkBalance, priceBeo, suggestFor } from './pricing'
import { bahtText, thaiDate } from './thai'

const catalog = { ...(seed as unknown as Omit<Catalog, 'version'>), version: 1 } as Catalog

function beo(lines: BeoLine[], tables: number, discount = 0): Beo {
  return {
    docNo: null, status: 'draft', revision: 0, eventType: 'กินเลี้ยง',
    customer: { name: '', phone: '', organization: '', address: '', contactName: '', contactPhone: '' },
    event: { name: '', date: '2026-09-26', start: '18:00', end: '22:00', room: 'ปัญจดารา 1' },
    seating: { guests: tables * 10, layout: 'โต๊ะจีน', tables, seatsPerTable: 10, spareTables: 0 },
    lines, discount, terms: [], note: '',
    totals: { subtotal: 0, discount: 0, vat: 0, grandTotal: 0, focValue: 0 },
    salesUid: 'u', salesName: 's',
  }
}
const set = (id: string, qty: number): BeoLine => {
  const s = catalog.menuSets.find((x) => x.id === id)!
  return { key: id, kind: 'set', refId: id, name: s.name, qty, unit: 'โต๊ะ', unitPrice: s.pricePerTable }
}
const svc = (id: string, qty = 1): BeoLine => {
  const s = catalog.services.find((x) => x.id === id)!
  return { key: id, kind: 'service', refId: id, name: s.name, qty, unit: s.unit, unitPrice: s.price }
}
const item = (name: string, qty = 1): BeoLine => {
  const m = catalog.menuItems.find((x) => x.name === name)!
  return { key: name, kind: 'item', refId: m.id, name: m.name, qty, unit: m.unit, unitPrice: m.price, course: m.course }
}

describe('real BEO samples', () => {
  it('37-year reunion: 10 Chinese tables × 3,000 + 13 rooms × 750 = 39,750 + VAT', () => {
    const r = priceBeo(beo([set('set-chaosua', 10), svc('svc-room', 13)], 10), catalog)
    expect(r.totals.subtotal).toBe(39750)
    expect(r.totals.vat).toBe(2782.5)
    expect(r.totals.grandTotal).toBe(42532.5)
    // water is already in the set -> no duplicated FOC line
    expect(r.lines.filter((l) => l.kind === 'foc')).toHaveLength(0)
  })

  it('vegetarian lunch delivery, 7 dishes, no tables = 2,800 + VAT, no FOC', () => {
    const names = ['ยำเห็ดรวมมิตรเจ', 'ซุปเยื่อไผ่น้ำแดงเจ', 'ผักปวยเล้งน้ำมันหอยเจ', 'ข้าวผัดเจ', 'โกยซีหมี่เจ', 'แป๊ะก๊วยมะพร้าวอ่อน']
    const lines = names.map((n) => item(n))
    const r = priceBeo(beo(lines, 0), catalog)
    expect(r.totals.subtotal).toBe(400 + 450 + 400 + 400 + 400 + 350)
    expect(r.lines.some((l) => l.kind === 'foc')).toBe(false)
  })
})

describe('FOC rules', () => {
  it('musician 600 when price/table < 3,000 or < 3 tables', () => {
    const r = priceBeo(beo([item('ไก่ทอดเกลือ', 2), item('ปลาทับทิมยำสมุนไพร', 2), svc('svc-music')], 2), catalog)
    expect(r.ctx.pricePerTable).toBe(800)
    expect(r.lines.find((l) => l.refId === 'svc-music')!.unitPrice).toBe(600)
  })

  it('musician 300 at ≥ 3,000/table and ≥ 3 tables; water free', () => {
    const r = priceBeo(beo([set('set-chaosua', 4), svc('svc-music')], 4), catalog)
    expect(r.lines.find((l) => l.refId === 'svc-music')!.unitPrice).toBe(300)
    expect(r.matched.drinks).toBe('foc-drink-3000')
  })

  it('exactly 3,000 with 6 tables is still 300 (literal reading of the rule)', () => {
    const r = priceBeo(beo([set('set-chaosua', 6), svc('svc-music')], 6), catalog)
    expect(r.lines.find((l) => l.refId === 'svc-music')!.unitPrice).toBe(300)
  })

  it('musician free at > 3,000/table and > 5 tables', () => {
    const r = priceBeo(beo([set('set-hongte', 6), svc('svc-music')], 6), catalog)
    const m = r.lines.find((l) => l.refId === 'svc-music')!
    expect(m.unitPrice).toBe(0)
    expect(r.totals.focValue).toBe(600)
  })

  it('à la carte ≥ 3,500/table adds water + chrysanthemum FOC lines', () => {
    // 4 tables, 14,000 of food = 3,500 / table
    const lines = [item('เป็ดเทียมเทียม', 4), item('ปลากะพงทอดน้ำปลา', 4), item('ซุปกระเพาะปลาน้ำแดง', 4), item('สลัดกุ้งร้อน', 4), item('ผลไม้ตามฤดูกาล', 4), item('เส้นหมี่ราดหน้าเจ', 4)]
    // 650+550+500+600+300+400 = 3,000 ... add one more 500 dish
    lines.push(item('กุ้งแช่น้ำปลา', 4))
    const r = priceBeo(beo(lines, 4), catalog)
    expect(r.ctx.pricePerTable).toBe(3500)
    const foc = r.lines.filter((l) => l.kind === 'foc')
    expect(foc.map((l) => l.name).sort()).toEqual(['น้ำเปล่า-น้ำแข็ง', 'เก๊กฮวย'].sort())
    expect(foc[0].qty).toBe(4)
  })

  it('declined FOC stays declined after recalculation', () => {
    const lines = [item('เป็ดเทียมเทียม', 2), item('ปลากะพงทอดน้ำปลา', 2), item('ซุปหูฉลามน้ำแดง', 2)]
    const r1 = priceBeo(beo(lines, 2), catalog)
    const declined = r1.lines.map((l) => (l.kind === 'foc' ? { ...l, declined: true } : l))
    const r2 = priceBeo(beo(declined, 2), catalog)
    expect(r2.lines.filter((l) => l.kind === 'foc').every((l) => l.declined)).toBe(true)
  })

  it('hint: 3,400/table set is 100 baht short of free chrysanthemum', () => {
    const r = priceBeo(beo([item('เป็ดเทียมเทียม', 4), item('ซุปหูฉลามน้ำแดง', 0), item('ปลากะพงทอดน้ำปลา', 4), item('สลัดกุ้งร้อน', 4), item('ผลไม้ตามฤดูกาล', 4), item('ข้าวผัดหยางโจว', 4), item('ต้มยำกุ้ง', 4)], 4), catalog)
    expect(r.ctx.pricePerTable).toBe(3000)
    expect(r.hints.some((h) => h.text.includes('500 บาท/โต๊ะ'))).toBe(true)
  })

  it('discount and VAT', () => {
    const r = priceBeo(beo([set('set-chaosua', 10)], 10, 1000), catalog)
    expect(r.totals.subtotal).toBe(29000)
    expect(r.totals.vat).toBe(2030)
    expect(r.totals.grandTotal).toBe(31030)
  })
})

describe('meal balance', () => {
  const slots = catalog.settings.mealTemplates[0].slots
  it('a set fills every Chinese-table slot', () => {
    const st = checkBalance([set('set-emperor', 10)], catalog, slots)
    expect(st.every((s) => s.filled)).toBe(true)
  })
  it('missing slots get 3 suggestions that avoid repeated protein', () => {
    const lines = [item('กุ้งแช่น้ำปลา'), item('ข้าวผัดหยางโจว')]
    const st = checkBalance(lines, catalog, slots)
    const missing = st.filter((s) => !s.filled).map((s) => s.slot.label)
    expect(missing).toContain('ต้ม / ซุป')
    const soup = suggestFor(slots.find((s) => s.label === 'ต้ม / ซุป')!, lines, catalog)
    expect(soup).toHaveLength(3)
    expect(soup.some((m) => m.name === 'ซุปหูฉลามน้ำแดง')).toBe(false)
  })
  it('vegetarian orders get vegetarian suggestions only', () => {
    const lines = [item('ข้าวผัดเจ'), item('ยำวุ้นเส้นเจ')]
    const soup = suggestFor(slots.find((s) => s.label === 'ต้ม / ซุป')!, lines, catalog)
    expect(soup.every((m) => m.tags.includes('เจ'))).toBe(true)
  })
})

describe('thai helpers', () => {
  it('bahtText', () => {
    expect(bahtText(39750)).toBe('สามหมื่นเก้าพันเจ็ดร้อยห้าสิบบาทถ้วน')
    expect(bahtText(42532.5)).toBe('สี่หมื่นสองพันห้าร้อยสามสิบสองบาทห้าสิบสตางค์')
    expect(bahtText(101)).toBe('หนึ่งร้อยเอ็ดบาทถ้วน')
    expect(bahtText(21)).toBe('ยี่สิบเอ็ดบาทถ้วน')
    expect(bahtText(11)).toBe('สิบเอ็ดบาทถ้วน')
    expect(bahtText(1)).toBe('หนึ่งบาทถ้วน')
    expect(bahtText(1000001)).toBe('หนึ่งล้านเอ็ดบาทถ้วน')
    expect(bahtText(2782.5)).toBe('สองพันเจ็ดร้อยแปดสิบสองบาทห้าสิบสตางค์')
  })
  it('thaiDate (พ.ศ.)', () => {
    expect(thaiDate('2026-09-26')).toBe('26 กันยายน 2569')
    expect(thaiDate('2026-09-26', { short: true })).toBe('26 ก.ย. 2569')
  })
})

describe('hints respect set contents', () => {
  it('no chrysanthemum hint when the set already includes it', () => {
    const r = priceBeo(beo([set('set-hongte', 8)], 8), catalog)
    expect(r.hints.some((h) => h.text.includes('เก๊กฮวย'))).toBe(false)
  })
})
