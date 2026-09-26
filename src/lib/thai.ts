// Thai date (พ.ศ.) and money helpers

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]
export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
]
export const THAI_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์']

function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** 2026-09-26 -> 26 กันยายน 2569 */
export function thaiDate(iso: string, opts: { short?: boolean; weekday?: boolean } = {}): string {
  const d = parseIso(iso)
  if (!d) return '-'
  const month = (opts.short ? THAI_MONTHS_SHORT : THAI_MONTHS)[d.getMonth()]
  const s = `${d.getDate()} ${month} ${d.getFullYear() + 543}`
  return opts.weekday ? `วัน${THAI_DAYS[d.getDay()]}ที่ ${s}` : s
}

export function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseIso(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function buddhistYear(iso: string = todayIso()): number {
  return Number(iso.slice(0, 4)) + 543
}

export function timeRange(start: string, end: string): string {
  if (!start) return '-'
  const f = (t: string) => t.replace(':', '.')
  return end ? `${f(start)} – ${f(end)} น.` : `${f(start)} น.`
}

const nf = new Intl.NumberFormat('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const nf0 = new Intl.NumberFormat('th-TH', { maximumFractionDigits: 2 })

/** 39750 -> 39,750.00 */
export function money(n: number): string {
  return nf.format(Number.isFinite(n) ? n : 0)
}
/** 39750 -> 39,750 */
export function num(n: number): string {
  return nf0.format(Number.isFinite(n) ? n : 0)
}

// ---------- bahttext ----------
const DIGIT = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า']
const PLACE = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน']

function readUnderMillion(n: number): string {
  // n: 0..999999
  let out = ''
  const s = String(n)
  const len = s.length
  for (let i = 0; i < len; i++) {
    const d = Number(s[i])
    const pos = len - i - 1
    if (d === 0) continue
    if (pos === 1 && d === 1) out += 'สิบ'
    else if (pos === 1 && d === 2) out += 'ยี่สิบ'
    else if (pos === 0 && d === 1 && len > 1) out += 'เอ็ด'
    else out += DIGIT[d] + PLACE[pos]
  }
  return out
}

function readInt(n: number): string {
  if (n === 0) return 'ศูนย์'
  let out = ''
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  if (millions > 0) out += readInt(millions) + 'ล้าน'
  if (rest > 0) {
    // "เอ็ด" after ล้าน when rest === 1
    out += millions > 0 && rest === 1 ? 'เอ็ด' : readUnderMillion(rest)
  }
  return out
}

/** 42532.5 -> สี่หมื่นสองพันห้าร้อยสามสิบสองบาทห้าสิบสตางค์ */
export function bahtText(amount: number): string {
  if (!Number.isFinite(amount)) return ''
  const neg = amount < 0
  const satangTotal = Math.round(Math.abs(amount) * 100)
  const baht = Math.floor(satangTotal / 100)
  const satang = satangTotal % 100
  let out = ''
  if (baht > 0) out += readInt(baht) + 'บาท'
  if (satang === 0) out += baht > 0 ? 'ถ้วน' : 'ศูนย์บาทถ้วน'
  else out += readInt(satang) + 'สตางค์'
  return (neg ? 'ลบ' : '') + out
}

export function phoneFormat(p: string): string {
  const d = p.replace(/\D/g, '')
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`
  return p
}
