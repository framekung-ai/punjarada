import { describe, expect, it } from 'vitest'
import type { AppUser } from './types'
import { emptyBeo, flowFor, STEP_ROOM_SERVICE, validateStep } from '../pages/wizard/model'
import { fromRoomService, hotelPhone, isRoomServiceType, listLabels, toRoomService } from './roomService'
import { describeChanges } from './revisionDiff'

const user: AppUser = { uid: 'u', email: 'e', displayName: 'S', role: 'sales', active: true }
const settings = { phone: '044-257567, 063-8614696' }

describe('Room service', () => {
  it('is recognised however Admin spelled it', () => {
    expect(['Room service', 'room service', 'Room Service', 'RoomService', 'รูมเซอร์วิส'].every(isRoomServiceType)).toBe(true)
    expect(isRoomServiceType('จัดเลี้ยง')).toBe(false)
  })
  it('fills customer, event and room automatically and uses a short flow', () => {
    const b = { ...toRoomService(emptyBeo(user), 'Room service', settings), roomNo: '305' }
    expect(hotelPhone(settings)).toBe('044257567')
    expect(b.customer.phone).toBe('044257567')
    expect(b.event).toMatchObject({ name: 'Room service', room: 'ห้องพัก', end: '' })
    expect(b.event.date).not.toBe('')
    expect(b.event.start).toMatch(/^\d\d:\d\d$/)
    expect(flowFor(b)).toEqual([0, STEP_ROOM_SERVICE, 4, 5])
    expect(listLabels({ ...b, customer: { ...b.customer, name: 'ห้อง 305' } })).toMatchObject({ title: 'Room service', sub: 'ห้อง 305', room: 'ห้องพัก', rs: true })
  })
  it('asks for the room number, order date and order time', () => {
    const b = toRoomService(emptyBeo(user), 'Room service', settings)
    expect(Object.keys(validateStep(STEP_ROOM_SERVICE, b))).toEqual(['roomNo'])
    expect(validateStep(STEP_ROOM_SERVICE, { ...b, roomNo: '1204' })).toEqual({})
  })
  it('switching back to a normal event clears the automatic values', () => {
    const rs = { ...toRoomService(emptyBeo(user), 'Room service', settings), roomNo: '305', customer: { name: 'ห้อง 305', phone: '044257567', organization: '', address: '', contactName: '', contactPhone: '' } }
    const b = fromRoomService(rs, 'จัดเลี้ยง', settings)
    expect(b.roomNo).toBeUndefined()
    expect(b.customer.name).toBe('')
    expect(b.event.name).toBe('')
    expect(b.event.room).toBe('')
    expect(flowFor(b)).toEqual([0, 1, 2, 3, 4, 5])
  })
  it('history shows a room change', () => {
    const a = { ...toRoomService(emptyBeo(user), 'Room service', settings), roomNo: '305' }
    expect(describeChanges(a, { ...a, roomNo: '306', customer: { ...a.customer, name: 'ห้อง 306' } })).toEqual(['ห้องพัก 305 → 306'])
  })
})
