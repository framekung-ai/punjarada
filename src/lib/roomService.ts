// Room service orders use the same BEO document, with less to fill in:
// room number + order date/time instead of customer, event name and banquet room.
import type { Beo, Settings } from './types'

/** event type chosen in the form — Admin named it “Room service” in settings */
export const isRoomServiceType = (eventType: string | undefined) => /room\s*-?\s*service|รูมเซอร์วิส/i.test(eventType ?? '')
export const isRoomService = (b: Pick<Beo, 'eventType'>) => isRoomServiceType(b.eventType)

/** shown in the “ห้อง” column and on the document */
export const GUEST_ROOM = 'ห้องพัก'

/** first number of the hotel phone in settings, digits only (e.g. “044-257567, 063-8614696” → 044257567) */
export function hotelPhone(settings: Pick<Settings, 'phone'>): string {
  return (settings.phone ?? '').split(/[,/]/)[0].replace(/\D/g, '')
}

export const roomCustomerName = (roomNo: string) => (roomNo ? `ห้อง ${roomNo}` : '')

function nowHHMM(): string {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
function todayIso(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** switch a BEO to Room service: fill what the form no longer asks for */
export function toRoomService(b: Beo, eventType: string, settings: Pick<Settings, 'phone'>): Beo {
  const roomNo = b.roomNo ?? ''
  return {
    ...b,
    eventType,
    roomNo,
    customer: { name: roomCustomerName(roomNo), phone: hotelPhone(settings), organization: '', address: '', contactName: '', contactPhone: '' },
    event: { ...b.event, name: eventType, room: GUEST_ROOM, date: b.event.date || todayIso(), start: b.event.start || nowHHMM(), end: '' },
    seating: { ...b.seating, layout: '', tables: 0, spareTables: 0 },
  }
}

/** switching back to a normal event: remove the automatic Room service values */
export function fromRoomService(b: Beo, eventType: string, settings: Pick<Settings, 'phone'>): Beo {
  const auto = b.customer.name === roomCustomerName(b.roomNo ?? '') && b.customer.phone === hotelPhone(settings)
  const { roomNo: _r, ...rest } = b
  void _r
  return {
    ...rest,
    eventType,
    customer: auto ? { ...b.customer, name: '', phone: '' } : b.customer,
    event: { ...b.event, name: isRoomServiceType(b.event.name) ? '' : b.event.name, room: b.event.room === GUEST_ROOM ? '' : b.event.room, start: '', end: '' },
  }
}

/** title / second line / room column used in lists */
export function listLabels(b: Pick<Beo, 'eventType' | 'event' | 'customer' | 'roomNo'>): { title: string; sub: string; room: string; rs: boolean } {
  if (isRoomServiceType(b.eventType)) return { title: 'Room service', sub: b.roomNo ? `ห้อง ${b.roomNo}` : b.customer.name, room: GUEST_ROOM, rs: true }
  return { title: b.event.name || '(ยังไม่มีชื่องาน)', sub: b.customer.name, room: b.event.room, rs: false }
}
