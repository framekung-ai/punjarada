import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { BadgePercent, CheckCircle2, History, Pencil, Trash2 } from 'lucide-react'
import type { Beo } from '../lib/types'
import { deleteBeo, getBeo, listRevisions, recountCustomers, requestDeleteBeo, setBeoStatus, submitBeo, type Revision } from '../lib/db'
import { priceBeo } from '../lib/pricing'
import { DiscountSheet, type DiscountResult } from './DiscountSheet'
import { useAuth } from '../lib/auth'
import { useReadyCatalog } from '../lib/catalog'
import { BeoDocument } from '../beo/BeoDocument'
import { ScaledDoc } from '../beo/ScaledDoc'
import { exportJpg, exportPdf, sharePdf } from '../beo/export'
import { errorText, Sheet, Spinner, StatusBadge, useToast, useConfirm } from '../components/ui'
import { money, thaiDate } from '../lib/thai'
import { canEditBeo, editWarning } from './editGuard'
import { changesForHistory } from '../lib/revisionDiff'
import { EventTitle } from '../components/EventTitle'
import { isRoomService } from '../lib/roomService'

const ACTION_LABEL: Record<string, string> = {
  submit: 'ส่งให้ Admin ยืนยัน', edit: 'แก้ไข', confirm: 'ยืนยันงาน', status: 'เปลี่ยนสถานะ',
}
const STATUS_TEXT: Record<string, string> = {
  draft: 'แบบร่าง', pending: 'รอการยืนยัน', confirmed: 'ยืนยันแล้ว', completed: 'จัดงานแล้ว', cancelled: 'ยกเลิก', new: 'ใหม่',
}

function revText(r: Revision) {
  if (r.action === 'status') return `${STATUS_TEXT[r.prevStatus ?? ''] ?? ''} → ${STATUS_TEXT[r.status] ?? r.status}`
  if (r.action) return ACTION_LABEL[r.action] ?? r.action
  return 'บันทึก' // revisions saved before the history labels existed
}

/** Sales may delete their own draft, or their own pending BEO that was never confirmed. */
function salesCanDeleteDirectly(b: Beo) {
  return b.status === 'draft' || (b.status === 'pending' && !b.confirmedAt)
}

export function BeoView() {
  const { id } = useParams()
  const { user } = useAuth()
  const catalog = useReadyCatalog()
  const toast = useToast()
  const confirm = useConfirm()
  const navigate = useNavigate()
  const [beo, setBeo] = useState<Beo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [revs, setRevs] = useState<Revision[] | null>(null)
  const revChanges = useMemo(() => (revs ? changesForHistory(revs) : []), [revs])
  const [discountOpen, setDiscountOpen] = useState(false)
  const [approving, setApproving] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!id) return
    getBeo(id).then((b) => (b ? setBeo(b) : setErr('ไม่พบเอกสาร'))).catch((e) => setErr(errorText(e)))
  }, [id])

  if (err) return <div className="notice warn">{err}</div>
  if (!beo || !id || !user) return <Spinner />

  const actor = { uid: user.uid, name: user.displayName }
  const isOwner = beo.salesUid === user.uid
  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!exportRef.current) return
    setBusy(label)
    try { await fn() } catch (e) { toast(`${label}ไม่สำเร็จ: ${errorText(e)}`) } finally { setBusy(null) }
  }
  const canEdit = canEditBeo(beo, user)
  const editPath = isAdmin ? `/admin/beo/${id}/edit` : `/sales/beo/${id}/edit`
  const home = isAdmin ? '/admin/beos' : '/sales'

  const startEdit = async () => {
    const warn = editWarning(beo, user)
    if (warn && !(await confirm(warn))) return
    navigate(editPath, { state: { editAck: true } })
  }

  const changeStatus = async (s: Beo['status']) => {
    if (s === 'cancelled' && !(await confirm({ title: 'ยกเลิกงานนี้?', message: `${beo.event.name} · ${beo.docNo ?? ''}\nห้องจะกลับมาว่างในระบบ กด “คืนสถานะยืนยัน” ได้ภายหลัง`, confirmText: 'ยกเลิกงาน', cancelText: 'ไม่ยกเลิก', danger: true }))) return
    try {
      await setBeoStatus(id, s, actor, beo)
      setBeo({ ...beo, status: s, ...(s === 'confirmed' ? { approvedByUid: actor.uid, approvedByName: actor.name } : {}) })
      toast(s === 'confirmed' ? `ยืนยันงานแล้ว — ผู้อนุมัติ: ${actor.name}` : 'อัปเดตสถานะแล้ว')
    } catch (e) { toast(errorText(e)) }
  }

  /** Admin: apply the discount / free items, re-price, and approve in one save (history: ยืนยันงาน) */
  const approveWithDiscount = async (d: DiscountResult) => {
    setApproving(true)
    try {
      const next: Beo = { ...beo, lines: d.lines, discountRule: d.discountRule, discount: d.discount }
      const priced = priceBeo(next, catalog)
      await submitBeo(id, { ...next, lines: priced.lines, totals: priced.totals, editedByUid: actor.uid, editedByName: actor.name }, { ...actor, isAdmin: true })
      const fresh = await getBeo(id)
      if (fresh) setBeo(fresh)
      setDiscountOpen(false)
      toast(priced.totals.discount > 0 ? `อนุมัติแล้ว — ส่วนลดรวม ${money(priced.totals.discount)} บาท` : `อนุมัติแล้ว — ผู้อนุมัติ: ${actor.name}`)
    } catch (e) { toast(`อนุมัติไม่สำเร็จ: ${errorText(e)}`) } finally { setApproving(false) }
  }

  const removeNow = async () => {
    const ok = await confirm({
      title: 'ลบเอกสารนี้ถาวร?',
      message: `${beo.docNo ?? 'แบบร่าง'} · ${beo.event.name || '(ยังไม่มีชื่องาน)'}\nกู้คืนไม่ได้${isAdmin ? ' — ถ้าลูกค้ายกเลิก แนะนำใช้ “ยกเลิกงาน” แทน' : ''}`,
      confirmText: 'ลบถาวร', danger: true,
    })
    if (!ok) return
    try {
      await deleteBeo(id)
      void recountCustomers([beo.customer.phone]).catch(() => {}) // keep the customer's job count right
      toast('ลบแล้ว'); navigate(home, { replace: true })
    } catch (e) { toast(errorText(e)) }
  }

  const askDelete = async () => {
    const ok = await confirm({
      title: 'ส่งคำขอลบให้ Admin?',
      message: `${beo.docNo} · ${beo.event.name}\nงานนี้ Admin ยืนยันแล้ว จึงลบเองไม่ได้ — ระบบจะส่งคำขอให้ Admin พิจารณาลบ\nระหว่างรอ เอกสารยังอยู่ในระบบตามปกติ และถอนคำขอได้`,
      confirmText: 'ส่งคำขอลบ', danger: true,
    })
    if (!ok) return
    try { await requestDeleteBeo(id, actor); setBeo({ ...beo, deleteRequest: { byUid: actor.uid, byName: actor.name, at: Date.now() } }); toast('ส่งคำขอลบให้ Admin แล้ว') } catch (e) { toast(errorText(e)) }
  }

  const clearRequest = async (msg: string) => {
    try { await requestDeleteBeo(id, null); setBeo({ ...beo, deleteRequest: null }); toast(msg) } catch (e) { toast(errorText(e)) }
  }

  const openHistory = () => void listRevisions(id).then(setRevs).catch((e) => toast(errorText(e)))
  const edited = beo.editedByName && beo.editedByUid !== beo.salesUid

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row wrap"><h1>{beo.docNo ?? 'แบบร่าง'}</h1><StatusBadge status={beo.status} />{beo.revision > 0 && <span className="badge gray">Rev.{beo.revision}</span>}{beo.deleteRequest && <span className="badge req-del">ขอลบ</span>}</div>
          <div className="muted small"><EventTitle beo={beo} />{isRoomService(beo) ? ` · ห้อง ${beo.roomNo ?? ''}` : ''} · {thaiDate(beo.event.date)} · {money(beo.totals.grandTotal)} บาท</div>
          <div className="edited-by">
            ผู้รับงาน <strong>{beo.salesName}</strong>
            {edited && <> · แก้ไขล่าสุดโดย <strong>{beo.editedByName}</strong></>}
            {beo.approvedByName && beo.status !== 'pending' && beo.status !== 'draft' && <> · ผู้อนุมัติ <strong>{beo.approvedByName}</strong></>}
          </div>
        </div>
      </div>

      <div className="row wrap">
        <button className="btn primary" disabled={!!busy} onClick={() => void run('ส่งออก PDF', () => exportPdf(exportRef.current!, beo))}>{busy === 'ส่งออก PDF' ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}</button>
        <button className="btn" disabled={!!busy} onClick={() => void run('ส่งออก JPG', () => exportJpg(exportRef.current!, beo))}>{busy === 'ส่งออก JPG' ? 'กำลังสร้าง…' : 'ดาวน์โหลด JPG'}</button>
        <button className="btn hide-desktop" disabled={!!busy} onClick={() => void run('แชร์', () => sharePdf(exportRef.current!, beo))}>แชร์</button>
        {canEdit && <button className="btn" onClick={() => void startEdit()}><Pencil size={16} aria-hidden /> แก้ไข</button>}
        <button className="btn" onClick={() => navigate('/sales/new', { state: { copyFrom: beo } })}>คัดลอกเป็นงานใหม่</button>
        <button className="btn" onClick={openHistory}><History size={16} aria-hidden /> ประวัติการแก้ไข</button>
        {!isAdmin && isOwner && (salesCanDeleteDirectly(beo)
          ? <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => void removeNow()}><Trash2 size={16} aria-hidden /> ลบ</button>
          : !beo.deleteRequest && <button className="btn danger" style={{ marginLeft: 'auto' }} onClick={() => void askDelete()}><Trash2 size={16} aria-hidden /> ขอให้ Admin ลบ</button>)}
      </div>

      {beo.deleteRequest && (isAdmin ? (
        <div className="notice warn">
          <span><strong>{beo.deleteRequest.byName}</strong> ขอให้ลบเอกสารนี้{beo.deleteRequest.reason ? ` — ${beo.deleteRequest.reason}` : ''}</span>
          <button className="btn small" onClick={() => void clearRequest('ปฏิเสธคำขอลบแล้ว')}>ปฏิเสธคำขอ</button>
          <button className="btn small danger-solid" style={{ marginLeft: 0 }} onClick={() => void removeNow()}>อนุมัติ ลบเอกสาร</button>
        </div>
      ) : (
        <div className="notice warn">
          <span>ส่งคำขอลบแล้ว{beo.deleteRequest.byUid !== user.uid ? ` (โดย ${beo.deleteRequest.byName})` : ''} — รอ Admin พิจารณา</span>
          {beo.deleteRequest.byUid === user.uid && <button className="btn small" onClick={() => void clearRequest('ถอนคำขอลบแล้ว')}>ถอนคำขอ</button>}
        </div>
      ))}

      {beo.status === 'pending' && (isAdmin ? (
        <div className="notice gold">
          <span>งานนี้รอการอนุมัติ — ตรวจรายละเอียดด้านล่าง แล้วเลือก “อนุมัติ” หรือ “ส่วนลด & อนุมัติ” (กด “แก้ไข” เพื่อปรับรายการก่อน)</span>
          <div className="approve-actions">
            <button className="btn" onClick={() => setDiscountOpen(true)}><BadgePercent size={18} aria-hidden /> ส่วนลด &amp; อนุมัติ</button>
            <button className="btn primary" onClick={() => void changeStatus('confirmed')}><CheckCircle2 size={18} aria-hidden /> อนุมัติ</button>
          </div>
        </div>
      ) : <div className="notice gold">ส่งแล้ว รอ Admin ยืนยัน — ยังแก้ไขได้จนกว่า Admin จะยืนยัน</div>)}
      {!isAdmin && beo.status === 'confirmed' && (
        <div className="notice info">งานนี้ยืนยันแล้ว — ถ้ากด “แก้ไข” เอกสารจะกลับเป็น “รอการยืนยัน” และต้องให้ Admin อนุมัติอีกครั้ง</div>
      )}
      {isAdmin && (
        <div className="card flat row wrap">
          <span className="small muted">Admin:</span>
          {beo.status === 'confirmed' && <button className="btn small" onClick={() => void changeStatus('completed')}>จัดงานแล้ว</button>}
          {beo.status === 'cancelled' && <button className="btn small" onClick={() => void changeStatus('confirmed')}>คืนสถานะยืนยัน</button>}
          {beo.status !== 'cancelled' && beo.status !== 'draft' && <button className="btn small danger" onClick={() => void changeStatus('cancelled')}>ยกเลิกงาน</button>}
          <button className="btn small danger" style={{ marginLeft: 'auto' }} onClick={() => void removeNow()}>ลบ</button>
        </div>
      )}

      {isAdmin && discountOpen && (
        <DiscountSheet open beo={beo} catalog={catalog} busy={approving} onClose={() => setDiscountOpen(false)}
          title="มอบส่วนลดและอนุมัติ" confirmText="ให้ส่วนลดและอนุมัติ" onApply={approveWithDiscount} />
      )}

      <ScaledDoc><BeoDocument beo={beo} settings={catalog.settings} /></ScaledDoc>

      {/* full-size copy used for export (off-screen) */}
      <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden>
        <BeoDocument ref={exportRef} beo={beo} settings={catalog.settings} />
      </div>

      <Sheet open={!!revs} onClose={() => setRevs(null)} title="ประวัติการแก้ไข">
        {revs?.length === 0 && <div className="muted">ยังไม่มีประวัติ — ประวัติจะเริ่มบันทึกเมื่อส่งเอกสาร</div>}
        {revs?.map((r, i) => (
          <div key={i} className="card flat rev-item">
            {/* what changed compared with the previous saved version */}
            <div>
              <span className="who">{r.savedByName || 'ไม่ทราบชื่อ'}</span>
              {r.savedBy && r.savedBy === beo.salesUid && <span className="badge gray" style={{ marginLeft: 6 }}>ผู้รับงาน</span>}
              {r.savedBy && r.savedBy === user.uid && <span className="badge" style={{ marginLeft: 6 }}>คุณ</span>}
            </div>
            <span className="num">{r.totals ? money(r.totals.grandTotal) : ''}</span>
            <div className="small">{revText(r)} · Rev.{r.revision ?? 0}{r.totals?.discount ? ` · ส่วนลดรวม ${money(r.totals.discount)}` : ''}</div>
            <span className="small muted">{r.savedAt?.toDate().toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</span>
            {revChanges[i]?.length > 0 && <RevChanges items={revChanges[i]} />}
          </div>
        ))}
      </Sheet>
    </div>
  )
}

/** small chips under a history entry: “เพิ่ม ยำวุ้นเส้น”, “แขก 50 → 60 ท่าน”, “มอบส่วนลด 10%” … */
function RevChanges({ items }: { items: string[] }) {
  const [all, setAll] = useState(false)
  const shown = all ? items : items.slice(0, 6)
  return (
    <ul className="rev-changes" aria-label="รายการที่แก้ไข">
      {shown.map((t, k) => <li key={k} className={changeKind(t)}>{t}</li>)}
      {!all && items.length > 6 && <li><button type="button" className="linklike" onClick={() => setAll(true)}>+ อีก {items.length - 6} รายการ</button></li>}
    </ul>
  )
}
function changeKind(t: string) {
  if (/^(เพิ่ม|ให้ฟรี|มอบส่วนลด)/.test(t)) return 'add'
  if (/^(ลบ|ยกเลิก)/.test(t)) return 'del'
  return ''
}
