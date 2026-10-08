import { ConciergeBell } from 'lucide-react'
import type { Beo } from '../lib/types'
import { listLabels } from '../lib/roomService'

/** Event name for lists; Room service gets a small bell icon (1em, same size as the text). */
export function EventTitle({ beo }: { beo: Pick<Beo, 'eventType' | 'event' | 'customer' | 'roomNo'> }) {
  const l = listLabels(beo)
  if (!l.rs) return <>{l.title}</>
  return (
    <span className="rs-title"><ConciergeBell className="rs-ico" aria-hidden />{l.title}</span>
  )
}
