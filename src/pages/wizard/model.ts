import type { AppUser, Beo, BeoLine, Catalog, MealTemplate, MenuItem, MenuSet, Service } from '../../lib/types'
import { newKey } from '../../lib/pricing'

export const STEPS = ['ประเภทงาน', 'ลูกค้า', 'รายละเอียดงาน', 'แขกและโต๊ะ', 'อาหารและบริการ', 'สรุปและยืนยัน'] as const

export function emptyBeo(user: AppUser): Beo {
  return {
    docNo: null, status: 'draft', revision: 0, eventType: '',
    customer: { name: '', phone: '', organization: '', address: '', contactName: '', contactPhone: '' },
    event: { name: '', date: '', start: '', end: '', room: '' },
    seating: { guests: 0, layout: '', tables: 0, seatsPerTable: 10, spareTables: 0 },
    lines: [], discount: 0, terms: [], note: '',
    totals: { subtotal: 0, discount: 0, vat: 0, grandTotal: 0, focValue: 0 },
    salesUid: user.uid, salesName: user.displayName,
  }
}

/** Copy of an old BEO as a fresh draft (for repeat customers). */
export function copyAsNew(src: Beo, user: AppUser): Beo {
  const b = emptyBeo(user)
  return {
    ...b,
    eventType: src.eventType,
    customer: { ...src.customer },
    event: { ...src.event, date: '' },
    seating: { ...src.seating },
    lines: src.lines.filter((l) => l.kind !== 'foc').map((l) => ({ ...l, key: newKey() })),
    terms: [...src.terms],
    note: src.note,
  }
}

export type StepErrors = Record<string, string>

export function validateStep(step: number, b: Beo): StepErrors {
  const e: StepErrors = {}
  if (step === 0 && !b.eventType) e.eventType = 'เลือกประเภทงาน'
  if (step === 1) {
    if (!b.customer.name.trim()) e.name = 'กรอกชื่อลูกค้า'
    const d = b.customer.phone.replace(/\D/g, '')
    if (d.length < 9 || d.length > 10) e.phone = 'เบอร์โทร 9–10 หลัก'
  }
  if (step === 2) {
    if (!b.event.name.trim()) e.eventName = 'กรอกชื่องาน'
    if (!b.event.date) e.date = 'เลือกวันที่จัดงาน'
    if (!b.event.start) e.start = 'เลือกเวลาเริ่ม'
    if (b.event.start && b.event.end && b.event.end <= b.event.start) e.end = 'เวลาเลิกต้องหลังเวลาเริ่ม'
    if (!b.event.room) e.room = 'เลือกห้องจัดงาน'
  }
  if (step === 3) {
    if (!(b.seating.guests > 0)) e.guests = 'ระบุจำนวนแขก'
    if (!b.seating.layout) e.layout = 'เลือกรูปแบบการจัดโต๊ะ'
  }
  if (step === 4 && b.lines.filter((l) => l.kind !== 'foc').length === 0) e.lines = 'เพิ่มอาหารหรือบริการอย่างน้อย 1 รายการ'
  return e
}

export function templateFor(catalog: Catalog, layout: string): MealTemplate {
  const t = catalog.settings.mealTemplates
  const plated = layout.includes('ใส่จาน')
  return (plated ? t.find((x) => x.id === 'plated') : t.find((x) => x.id === 'chinese')) ?? t[0]
}

export function defaultQty(b: Beo): number {
  return b.seating.tables > 0 ? b.seating.tables : 1
}

export function setLine(s: MenuSet, qty: number): BeoLine {
  return {
    key: newKey(), kind: 'set', refId: s.id, name: s.name, qty, unit: 'โต๊ะ', unitPrice: s.pricePerTable,
    detail: [s.seats && `เสิร์ฟ ${s.seats}`, s.drinksText && `เครื่องดื่ม: ${s.drinksText}`].filter(Boolean).join(' · '),
    setItems: s.items.map((i) => i.name),
  }
}

export function itemLine(m: MenuItem, qty: number, opt?: { variant?: string; option?: { label: string; price: number } }): BeoLine {
  const name = opt?.variant ? `${m.name}${opt.variant}` : m.name
  return {
    key: newKey(), kind: 'item', refId: m.id, name, qty,
    unit: m.unit, unitPrice: opt?.option?.price ?? m.price, course: m.course,
    detail: [opt?.option?.label, m.priceType === 'perWeight' ? `ราคาขีดละ ${m.price} บาท` : ''].filter(Boolean).join(' · ') || undefined,
  }
}

export function serviceLine(s: Service, qty = 1, price?: number): BeoLine {
  return {
    key: newKey(), kind: 'service', refId: s.id, name: s.name, qty, unit: s.unit,
    unitPrice: price ?? s.price, manualPrice: price !== undefined && price !== s.price ? true : undefined,
  }
}

export function addonLine(offer: { menuItemId: string; name: string; specialPrice: number }, course?: BeoLine['course']): BeoLine {
  return {
    key: newKey(), kind: 'addon', refId: offer.menuItemId, name: offer.name, qty: 1, unit: 'จาน',
    unitPrice: offer.specialPrice, course,
  }
}
