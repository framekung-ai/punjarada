import type { Beo } from './types'

/** who appears as ผู้อนุมัติ after a save (pure — shared with the demo mock) */
export function approverAfterSave(
  status: Beo['status'], prev: Beo['status'] | null,
  current: { uid: string | null; name: string | null } | null, actor: { uid: string; name: string; isAdmin: boolean },
): { uid: string | null; name: string | null } {
  if (status === 'draft' || status === 'pending') return { uid: null, name: null }
  const wasApproved = prev === 'confirmed' || prev === 'completed' || prev === 'cancelled'
  if (wasApproved && current?.name) return current // Admin re-saving an approved BEO keeps the approver
  return actor.isAdmin ? { uid: actor.uid, name: actor.name } : { uid: null, name: null }
}
