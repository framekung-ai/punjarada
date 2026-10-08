import { createElement } from 'react'
import {
  Award, BriefcaseBusiness, ConciergeBell, CalendarDays, GraduationCap, HandPlatter, Heart, Presentation, Sparkles, Truck, UtensilsCrossed, Wine,
  type LucideIcon,
} from 'lucide-react'

/**
 * Icon for an event type. Admin can rename / add types freely, so match by keyword
 * rather than by exact name — any unknown type still gets a tidy calendar icon.
 */
const TYPE_RULES: [RegExp, LucideIcon][] = [
  [/room\s*-?\s*service|รูมเซอร์วิส/i, ConciergeBell],
  [/นอกสถานที่|ส่งอาหาร|จัดส่ง|delivery|catering/i, Truck],
  [/ประชุม|สัมมนา|meeting|seminar/i, Presentation],
  [/อบรม|รุ่น|ปฐมนิเทศ|training/i, GraduationCap],
  [/เกษียณ|มุทิตา|retire/i, Award],
  [/แต่ง|หมั้น|wedding/i, Heart],
  [/ค็อกเทล|cocktail|สังสรรค์|ปาร์ตี้|party/i, Wine],
  [/เลี้ยง|อาหาร|buffet|บุฟเฟ่ต์|dinner|lunch/i, UtensilsCrossed],
  [/บริษัท|องค์กร|corporate/i, BriefcaseBusiness],
  [/อื่น|other/i, Sparkles],
]
export function typeIcon(name: string): LucideIcon {
  return TYPE_RULES.find(([re]) => re.test(name))?.[1] ?? CalendarDays
}

/** Small table-layout diagrams (same 24px grid / stroke as lucide). */
export function LayoutIcon({ name, size = 26 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }
  const dot = (cx: number, cy: number) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="1.3" fill="currentColor" stroke="none" />
  if (/ใส่จาน|จาน|plated/i.test(name)) return <HandPlatter size={size} aria-hidden />
  if (/ค็อกเทล|cocktail|ยืน/i.test(name)) return <Wine size={size} aria-hidden />
  if (/ชั้นเรียน|เรียน|เธียเตอร์|theat|class/i.test(name)) {
    return <svg {...common}><path d="M5 7h14M5 12h14M5 17h14" />{[7, 12, 17].flatMap((y) => [dot(8, y + 2.6), dot(12, y + 2.6), dot(16, y + 2.6)]).slice(0, 6)}</svg>
  }
  if (/ตัวยู|ตัว u|u-shape|\bu\b/i.test(name)) {
    return <svg {...common}><path d="M6 5v13h12V5" />{[dot(3, 8), dot(3, 13), dot(21, 8), dot(21, 13), dot(9, 21), dot(15, 21)]}</svg>
  }
  if (/เหลี่ยม|ยาว|สี่เหลี่ยม|rect|board/i.test(name)) {
    return <svg {...common}><rect x="5" y="8.5" width="14" height="7" rx="1.5" />{[dot(8, 5.5), dot(12, 5.5), dot(16, 5.5), dot(8, 18.5), dot(12, 18.5), dot(16, 18.5)]}</svg>
  }
  // round / Chinese banquet table (default)
  const chairs = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return dot(12 + Math.cos(a) * 9.2, 12 + Math.sin(a) * 9.2)
  })
  return <svg {...common}><circle cx="12" cy="12" r="5.2" />{chairs}</svg>
}

export function TypeIcon({ name, size = 24 }: { name: string; size?: number }) {
  return createElement(typeIcon(name), { size, strokeWidth: 1.9, 'aria-hidden': true })
}
