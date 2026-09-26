import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Beo } from '../lib/types'
import { deleteBeo, getBeo, listRevisions, setBeoStatus } from '../lib/db'
import { useAuth } from '../lib/auth'
import { useReadyCatalog } from '../lib/catalog'
import { BeoDocument } from '../beo/BeoDocument'
import { ScaledDoc } from '../beo/ScaledDoc'
import { exportJpg, exportPdf, sharePdf } from '../beo/export'
import { errorText, Sheet, Spinner, StatusBadge, useToast, useConfirm } from '../components/ui'
import { money, thaiDate } from '../lib/thai'

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
  const [revs, setRevs] = useState<Awaited<ReturnType<typeof listRevisions>> | null>(null)
  const exportRef = useRef<HTMLDivElement>(null)
  const isAdmin = user?.role === 'admin'

  useEffect(() => {
    if (!id) return
    getBeo(id).then((b) => (b ? setBeo(b) : setErr('ไม่พบเอกสาร'))).catch((e) => setErr(errorText(e)))
  }, [id])

  if (err) return <div className="notice warn">{err}</div>
  if (!beo || !id) return <Spinner />

  const run = async (label: string, fn: () => Promise<unknown>) => {
    if (!exportRef.current) return
    setBusy(label)
    try { await fn() } catch (e) { toast(`${label}ไม่สำเร็จ: ${errorText(e)}`) } finally { setBusy(null) }
  }
  const canEdit = isAdmin || ((beo.status === 'draft' || beo.status === 'pending') && beo.salesUid === user?.uid)
  const editPath = isAdmin ? `/admin/beo/${id}/edit` : `/sales/beo/${id}/edit`
  const changeStatus = async (s: Beo['status']) => {
    if (s === 'cancelled' && !(await confirm({ title: 'ยกเลิกงานนี้?', message: `${beo.event.name} · ${beo.docNo ?? ''}\nห้องจะกลับมาว่างในระบบ กด “คืนสถานะยืนยัน” ได้ภายหลัง`, confirmText: 'ยกเลิกงาน', cancelText: 'ไม่ยกเลิก', danger: true }))) return
    try { await setBeoStatus(id, s); setBeo({ ...beo, status: s }); toast('อัปเดตสถานะแล้ว') } catch (e) { toast(errorText(e)) }
  }

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <div className="row"><h1>{beo.docNo ?? 'แบบร่าง'}</h1><StatusBadge status={beo.status} />{beo.revision > 0 && <span className="badge gray">Rev.{beo.revision}</span>}</div>
          <div className="muted small">{beo.event.name} · {thaiDate(beo.event.date)} · {money(beo.totals.grandTotal)} บาท</div>
        </div>
      </div>

      <div className="row wrap">
        <button className="btn primary" disabled={!!busy} onClick={() => void run('ส่งออก PDF', () => exportPdf(exportRef.current!, beo))}>{busy === 'ส่งออก PDF' ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}</button>
        <button className="btn" disabled={!!busy} onClick={() => void run('ส่งออก JPG', () => exportJpg(exportRef.current!, beo))}>{busy === 'ส่งออก JPG' ? 'กำลังสร้าง…' : 'ดาวน์โหลด JPG'}</button>
        <button className="btn hide-desktop" disabled={!!busy} onClick={() => void run('แชร์', () => sharePdf(exportRef.current!, beo))}>แชร์</button>
        {canEdit && <Link className="btn" to={editPath}>แก้ไข</Link>}
        <button className="btn" onClick={() => navigate('/sales/new', { state: { copyFrom: beo } })}>คัดลอกเป็นงานใหม่</button>
      </div>

      {beo.status === 'pending' && (isAdmin ? (
        <div className="notice gold">
          <span>งานนี้รอการยืนยัน — ตรวจรายละเอียดด้านล่าง แล้วกดยืนยัน (หรือกด “แก้ไข” เพื่อปรับก่อนยืนยัน)</span>
          <button className="btn primary" onClick={() => void changeStatus('confirmed')}>ยืนยันงาน</button>
        </div>
      ) : <div className="notice gold">ส่งแล้ว รอ Admin ยืนยัน — ยังแก้ไขได้จนกว่า Admin จะยืนยัน</div>)}
      {isAdmin && (
        <div className="card flat row wrap">
          <span className="small muted">Admin:</span>
          {beo.status === 'confirmed' && <button className="btn small" onClick={() => void changeStatus('completed')}>จัดงานแล้ว</button>}
          {beo.status === 'cancelled' && <button className="btn small" onClick={() => void changeStatus('confirmed')}>คืนสถานะยืนยัน</button>}
          {beo.status !== 'cancelled' && beo.status !== 'draft' && <button className="btn small danger" onClick={() => void changeStatus('cancelled')}>ยกเลิกงาน</button>}
          <button className="btn small" onClick={() => void listRevisions(id).then(setRevs).catch((e) => toast(errorText(e)))}>ประวัติการแก้ไข</button>
          <button className="btn small danger" style={{ marginLeft: 'auto' }} onClick={async () => {
            if (!(await confirm({ title: 'ลบเอกสารนี้ถาวร?', message: `${beo.docNo ?? 'แบบร่าง'} · ${beo.event.name}\nกู้คืนไม่ได้ — ถ้าลูกค้ายกเลิก แนะนำใช้ “ยกเลิกงาน” แทน`, confirmText: 'ลบถาวร', danger: true }))) return
            void deleteBeo(id).then(() => { toast('ลบแล้ว'); navigate('/admin/beos') }).catch((e) => toast(errorText(e)))
          }}>ลบ</button>
        </div>
      )}

      <ScaledDoc><BeoDocument beo={beo} settings={catalog.settings} /></ScaledDoc>

      {/* full-size copy used for export (off-screen) */}
      <div style={{ position: 'fixed', left: -10000, top: 0, pointerEvents: 'none' }} aria-hidden>
        <BeoDocument ref={exportRef} beo={beo} settings={catalog.settings} />
      </div>

      <Sheet open={!!revs} onClose={() => setRevs(null)} title="ประวัติการแก้ไข">
        {revs?.length === 0 && <div className="muted">ยังไม่มีประวัติ</div>}
        {revs?.map((r) => (
          <div key={r.revision} className="row between card flat">
            <div>
              <strong>Rev.{r.revision}</strong> <span className="small muted">{r.savedAt?.toDate().toLocaleString('th-TH')} · {r.savedByName}</span>
            </div>
            <span className="num">{money(r.totals.grandTotal)}</span>
          </div>
        ))}
      </Sheet>
    </div>
  )
}
