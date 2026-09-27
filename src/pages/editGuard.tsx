import type { AppUser, Beo } from '../lib/types'
import type { ConfirmOptions } from '../components/ui'

/**
 * Warning shown to Sales before they start editing:
 * - a colleague's BEO ("กำลังแก้ไขรายการของ …")
 * - a BEO that Admin has already confirmed (goes back to "รอการยืนยัน")
 * Returns null when no warning is needed (Admin, or own draft / pending).
 */
export function editWarning(beo: Beo, user: AppUser | null): ConfirmOptions | null {
  if (!user || user.role === 'admin') return null
  const others = beo.salesUid !== user.uid
  const confirmed = beo.status === 'confirmed'
  if (!others && !confirmed) return null
  return {
    title: others ? `กำลังแก้ไขรายการของ ${beo.salesName}` : 'แก้ไขรายการที่ยืนยันแล้ว?',
    message: (
      <>
        <div><strong>{beo.docNo ?? 'แบบร่าง'}</strong> · {beo.event.name || '(ยังไม่มีชื่องาน)'}</div>
        <ul>
          {others && <li>เอกสารนี้เป็นงานของ <strong>{beo.salesName}</strong> — ชื่อของคุณ ({user.displayName}) จะถูกบันทึกในประวัติการแก้ไข</li>}
          {confirmed && <li><strong>รายการที่ยืนยันแล้ว หากมีการแก้ไขจะต้องได้รับการอนุมัติจาก Admin อีกครั้ง</strong> — เมื่อกดส่ง สถานะจะกลับเป็น “รอการยืนยัน”</li>}
        </ul>
        <div>{others ? 'ยืนยันการแก้ไขจริงๆ หรือไม่?' : 'ต้องการแก้ไขต่อหรือไม่?'}</div>
      </>
    ),
    confirmText: 'ยืนยัน แก้ไขต่อ',
    cancelText: 'ยกเลิก',
  }
}

/** Sales may open the form for draft / pending / confirmed BEOs (anyone's); Admin for everything. */
export function canEditBeo(beo: Beo, user: AppUser | null) {
  if (!user) return false
  if (user.role === 'admin') return true
  return beo.status === 'draft' || beo.status === 'pending' || beo.status === 'confirmed'
}
