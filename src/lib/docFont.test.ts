import { describe, expect, it } from 'vitest'
import { docFont, isEnlarged, stepFont } from './docFont'

describe('document font size', () => {
  it('defaults to 100% and clamps stored values to 90–150%', () => {
    expect(docFont({})).toEqual({ header: 1, info: 1, items: 1, summary: 1 })
    expect(docFont({ docFont: { header: 3, info: 0.2, items: 1.2, summary: Number.NaN } })).toEqual({ header: 1.5, info: 0.9, items: 1.2, summary: 1 })
  })
  it('steps 10% at a time and stops at the ends', () => {
    expect(stepFont(1, 1)).toBe(1.1)
    expect(stepFont(1.1, -1)).toBe(1)
    expect(stepFont(1.5, 1)).toBe(1.5)
    expect(stepFont(0.9, -1)).toBe(0.9)
    expect(stepFont(1.15, 1)).toBe(1.2) // odd stored value → next step
  })
  it('knows when the document was enlarged (then it is never shrunk back onto one page)', () => {
    expect(isEnlarged(docFont({}))).toBe(false)
    expect(isEnlarged(docFont({ docFont: { header: 1, info: 1, items: 1.1, summary: 1 } }))).toBe(true)
  })
})
