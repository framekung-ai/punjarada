// "What changed" for the edit history: compares a saved snapshot with the previous one.
// Works on the snapshots already stored in beos/{id}/revisions, so old history gets labels too.
import type { Beo, BeoLine } from './types'
import { discountLabel } from './pricing'
import { thaiDate, timeRange } from './thai'

type Snap = Partial<Beo> & { action?: string }

const n = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 2 })
const isSnapshot = (r: Snap | undefined): r is Snap & Pick<Beo, 'lines' | 'event' | 'seating'> => !!r && Array.isArray(r.lines) && !!r.event && !!r.seating

function discountText(b: Snap): string {
  const t = b.totals
  const rule = t?.ruleDiscount ?? Math.max(0, (t?.discount ?? 0) - (t?.freeValue ?? 0))
  if (!rule) return ''
  return b.discountRule && b.seating ? `${discountLabel({ discountRule: b.discountRule, seating: b.seating })} (${n(rule)} บาท)` : `ส่วนลด ${n(rule)} บาท`
}

/** short Thai descriptions, e.g. ["เพิ่ม ยำวุ้นเส้น", "แขก 50 → 60", "มอบส่วนลด 10% (3,380 บาท)"] */
export function describeChanges(prev: Snap | undefined, cur: Snap): string[] {
  if (!isSnapshot(cur) || !isSnapshot(prev)) return []
  const out: string[] = []
  const e0 = prev.event, e1 = cur.event
  if (e0.name !== e1.name) out.push('แก้ชื่องาน')
  if (prev.eventType !== cur.eventType) out.push(`ประเภทงาน ${prev.eventType || '-'} → ${cur.eventType || '-'}`)
  if (e0.date !== e1.date) out.push(`เลื่อนวันงาน ${thaiDate(e0.date, { short: true })} → ${thaiDate(e1.date, { short: true })}`)
  if (e0.start !== e1.start || e0.end !== e1.end) out.push(`เวลา ${timeRange(e0.start, e0.end)} → ${timeRange(e1.start, e1.end)}`)
  if (e0.room !== e1.room) out.push(`ห้อง ${e0.room || '-'} → ${e1.room || '-'}`)
  const rsRoom = (prev.roomNo ?? '') !== (cur.roomNo ?? '')
  if (rsRoom) out.push(`ห้องพัก ${prev.roomNo || '-'} → ${cur.roomNo || '-'}`)
  const c0 = prev.customer, c1 = cur.customer
  if (!rsRoom && c0 && c1 && (c0.name !== c1.name || c0.phone !== c1.phone || c0.organization !== c1.organization || c0.contactName !== c1.contactName || c0.contactPhone !== c1.contactPhone || c0.address !== c1.address)) out.push('แก้ข้อมูลลูกค้า')
  const s0 = prev.seating, s1 = cur.seating
  if (s0.guests !== s1.guests) out.push(`แขก ${n(s0.guests)} → ${n(s1.guests)} ท่าน`)
  if (s0.tables !== s1.tables) out.push(`โต๊ะ ${n(s0.tables)} → ${n(s1.tables)}`)
  if (s0.layout !== s1.layout) out.push(`จัดโต๊ะ ${s0.layout || '-'} → ${s1.layout || '-'}`)
  if ((s0.spareTables ?? 0) !== (s1.spareTables ?? 0)) out.push(`โต๊ะสำรอง ${n(s0.spareTables)} → ${n(s1.spareTables)}`)

  // food / service lines (FOC lines are generated, so they are not compared)
  const real = (ls: BeoLine[]) => ls.filter((l) => l.kind !== 'foc')
  const byKey = (ls: BeoLine[]) => new Map(real(ls).map((l) => [l.key, l]))
  const a = byKey(prev.lines), b = byKey(cur.lines)
  for (const [k, l] of b) {
    const o = a.get(k)
    if (!o) { out.push(`เพิ่ม ${l.name}`); continue }
    if (o.name !== l.name) out.push(`${o.name} → ${l.name}`)
    if (o.qty !== l.qty) out.push(`${l.name} ${n(o.qty)} → ${n(l.qty)} ${l.unit}`)
    if (o.unitPrice !== l.unitPrice && l.kind !== 'service') out.push(`${l.name} ราคา ${n(o.unitPrice)} → ${n(l.unitPrice)}`)
    else if (o.unitPrice !== l.unitPrice && l.manualPrice) out.push(`${l.name} ราคา ${n(o.unitPrice)} → ${n(l.unitPrice)}`)
    if (!o.free && l.free) out.push(`ให้ฟรี ${l.name}`)
    if (o.free && !l.free) out.push(`ยกเลิกฟรี ${l.name}`)
  }
  for (const [k, l] of a) if (!b.has(k)) out.push(`ลบ ${l.name}`)

  const d0 = discountText(prev), d1 = discountText(cur)
  if (!d0 && d1) out.push(`มอบ${d1.startsWith('ส่วนลด') ? d1 : `ส่วนลด ${d1}`}`)
  else if (d0 && !d1) out.push('ยกเลิกส่วนลด')
  else if (d0 !== d1) out.push(`แก้ส่วนลด → ${d1}`)
  if ((prev.applyVat !== false) !== (cur.applyVat !== false)) out.push(cur.applyVat === false ? 'ไม่คิด VAT' : 'คิด VAT 7%')
  if (JSON.stringify(prev.terms ?? []) !== JSON.stringify(cur.terms ?? [])) out.push('แก้เงื่อนไข')
  if ((prev.note ?? '') !== (cur.note ?? '')) out.push('แก้หมายเหตุ')
  return out
}

/** history list is newest first: pair each full snapshot with the previous full snapshot (status-only entries skipped) */
export function changesForHistory<T extends Snap>(revs: T[]): string[][] {
  return revs.map((r, i) => {
    if (!isSnapshot(r)) return []
    const prev = revs.slice(i + 1).find((x) => isSnapshot(x))
    return describeChanges(prev, r)
  })
}
