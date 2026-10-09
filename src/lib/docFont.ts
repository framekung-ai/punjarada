// Font size of the printed BEO, per zone. Stored in settings.docFont (1 = the original design).
import type { CSSProperties } from 'react'
import type { DocFontScale, Settings } from './types'

export const FONT_STEPS = [0.9, 1, 1.1, 1.2, 1.3, 1.4, 1.5] as const
export const FONT_MIN = FONT_STEPS[0]
export const FONT_MAX = FONT_STEPS[FONT_STEPS.length - 1]

export const FONT_ZONES: { key: keyof DocFontScale; label: string; hint: string }[] = [
  { key: 'header', label: 'หัวเอกสาร', hint: 'ชื่อโรงแรม เลขที่เอกสาร ชื่อเอกสาร' },
  { key: 'info', label: 'ข้อมูลลูกค้าและงาน', hint: 'ลูกค้า กิจกรรม ห้อง จำนวนโต๊ะ' },
  { key: 'items', label: 'ตารางรายการ', hint: 'อาหาร เครื่องดื่ม บริการ ของแถม' },
  { key: 'summary', label: 'สรุปยอดและลงนาม', hint: 'ยอดเงิน เงื่อนไข หมายเหตุ ผู้ลงนาม' },
]

export const DEFAULT_DOC_FONT: DocFontScale = { header: 1, info: 1, items: 1, summary: 1 }

const clamp = (v: unknown) => {
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(n * 100) / 100)) : 1
}

export function docFont(settings: Pick<Settings, 'docFont'> | undefined): DocFontScale {
  const f = settings?.docFont
  return { header: clamp(f?.header ?? 1), info: clamp(f?.info ?? 1), items: clamp(f?.items ?? 1), summary: clamp(f?.summary ?? 1) }
}

/** next / previous step (e.g. 1.0 → 1.1) */
export function stepFont(v: number, dir: 1 | -1): number {
  const i = FONT_STEPS.findIndex((s) => Math.abs(s - v) < 0.001)
  const idx = i < 0 ? FONT_STEPS.findIndex((s) => s > v) - (dir > 0 ? 0 : 1) : i + dir
  return FONT_STEPS[Math.min(FONT_STEPS.length - 1, Math.max(0, idx))]
}

export const isEnlarged = (f: DocFontScale) => Object.values(f).some((v) => v > 1.001)
export const pct = (v: number) => `${Math.round(v * 100)}%`

/** inline style that sets the zone's scale variable used by beo-document.css */
export const zoneStyle = (v: number): CSSProperties => ({ ['--fz' as string]: String(v) } as CSSProperties)
