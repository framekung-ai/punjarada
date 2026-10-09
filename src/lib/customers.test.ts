import { describe, expect, it } from 'vitest'
import { countsAsJob, jobCounts, validCustomerPhone } from './customers'

const b = (phone: string, status: string, eventType = 'จัดเลี้ยง') => ({ status, eventType, customer: { phone } }) as never

describe('customer job count', () => {
  it('counts sent BEOs per phone, not drafts or Room service', () => {
    const m = jobCounts([b('0811111111', 'confirmed'), b('081-111-1111', 'pending'), b('0811111111', 'draft'), b('044257567', 'confirmed', 'Room service'), b('0822222222', 'cancelled')])
    expect(m.get('0811111111')).toBe(2)
    expect(m.get('044257567')).toBeUndefined()
    expect(m.get('0822222222')).toBe(1)
  })
  it('a deleted BEO simply is not there any more → 0', () => {
    expect(jobCounts([]).get('0811111111') ?? 0).toBe(0)
  })
  it('directory phone must be 9–10 digits', () => {
    expect(validCustomerPhone('098-693-2917')).toBe(true)
    expect(validCustomerPhone('044922116')).toBe(true)
    expect(validCustomerPhone('12345')).toBe(false)
    expect(countsAsJob({ status: 'draft', eventType: '' })).toBe(false)
  })
})
