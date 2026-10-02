import { describe, expect, it } from 'vitest'
import { pageBreaks } from './export'

// 20 rows of 100 px starting at y=200, page 1123 px, margins 40 top / 30 bottom
const rows: { top: number; bottom: number; keepWithNext?: boolean }[] = Array.from({ length: 20 }, (_, i) => ({ top: 200 + i * 100, bottom: 300 + i * 100 }))

describe('PDF page breaks', () => {
  it('never cuts through a row', () => {
    const pages = pageBreaks(2300, rows, 1123, 40, 30)
    for (const [, end] of pages.slice(0, -1)) expect(rows.some((r) => r.top < end && r.bottom > end)).toBe(false)
    expect(pages[0][0]).toBe(0)
    expect(pages.at(-1)![1]).toBe(2300)
    pages.forEach(([a, b], i) => expect(b - a).toBeLessThanOrEqual(1123 - 30 - (i ? 40 : 0)))
  })
  it('keeps a section heading with its first row', () => {
    const bl = [...rows]
    bl[8] = { ...bl[8], keepWithNext: true } // heading at 1000–1100, next row would cross the page end
    const [first] = pageBreaks(2300, bl, 1123, 40, 30)
    expect(first[1]).toBeLessThanOrEqual(1000)
  })
})

describe('PDF page breaks with repeated table header', () => {
  it('leaves room for the header on continued pages', () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ top: 200 + i * 100, bottom: 300 + i * 100 }))
    const pages = pageBreaks(3300, rows, 1123, 40, 30, { height: 30, tableTop: 200, tableBottom: 3200 })
    pages.slice(1).forEach(([a, b]) => expect(b - a).toBeLessThanOrEqual(1123 - 30 - 40 - 30))
  })
})
