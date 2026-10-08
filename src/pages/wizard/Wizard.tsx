import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Beo, BeoLine } from '../../lib/types'
import { useAuth } from '../../lib/auth'
import { useReadyCatalog } from '../../lib/catalog'
import { priceBeo } from '../../lib/pricing'
import { submitBeo, createBeo, findCustomer, getBeo, updateBeo } from '../../lib/db'
import { money } from '../../lib/thai'
import { errorText, Spinner, useConfirm, useToast } from '../../components/ui'
import { canEditBeo, editWarning } from '../editGuard'
import { copyAsNew, emptyBeo, flowFor, STEP_ROOM_SERVICE, STEPS, validateStep, type StepErrors } from './model'
import { StepRoomService } from './StepRoomService'
import { isRoomService } from '../../lib/roomService'
import { StepCustomer, StepEvent, StepSeating, StepType } from './StepBasics'
import { StepFood } from './StepFood'
import { StepConfirm } from './StepConfirm'

export function Wizard() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const confirmModal = useConfirm()
  const { user } = useAuth()
  const catalog = useReadyCatalog()
  const isAdmin = user?.role === 'admin'

  const [beo, setBeoRaw] = useState<Beo | null>(id ? null : null)
  const [beoId, setBeoId] = useState<string | undefined>(id)
  /** position in the flow (the flow differs for Room service) */
  const [pos, setPos] = useState(0)
  const [errors, setErrors] = useState<StepErrors>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isRegular, setRegular] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // load / init
  useEffect(() => {
    if (!user) return
    let alive = true
    if (id) {
      getBeo(id).then(async (b) => {
        if (!alive) return
        if (!b) { setLoadErr('ไม่พบเอกสาร'); return }
        if (!canEditBeo(b, user)) { setLoadErr(b.status === 'cancelled' ? 'งานที่ยกเลิกแล้วแก้ไขได้เฉพาะ Admin' : 'งานที่จัดแล้วแก้ไขได้เฉพาะ Admin'); return }
        // opened straight from a link (not via the "แก้ไข" button, which already asked) → ask here
        const acked = (location.state as { editAck?: boolean } | null)?.editAck
        const warn = acked ? null : editWarning(b, user)
        if (warn && !(await confirmModal(warn))) { navigate(`/beo/${id}`, { replace: true }); return }
        setBeoRaw(b)
        setPos(Math.max(0, flowFor(b).indexOf(b.lines.length ? 4 : isRoomService(b) ? STEP_ROOM_SERVICE : 1)))
        findCustomer(b.customer.phone).then((c) => setRegular(!!c && c.beoCount > 0)).catch(() => {})
      }).catch((e) => setLoadErr(errorText(e)))
    } else {
      const copy = (location.state as { copyFrom?: Beo } | null)?.copyFrom
      const start = copy ? copyAsNew(copy, user) : emptyBeo(user)
      setBeoRaw(start)
      if (copy) setPos(flowFor(start).indexOf(isRoomService(start) ? STEP_ROOM_SERVICE : 2))
    }
    return () => { alive = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, user, isAdmin])

  const setBeo = useCallback((fn: (b: Beo) => Beo) => {
    setBeoRaw((b) => (b ? fn(b) : b))
    setDirty(true)
  }, [])

  const priced = useMemo(() => (beo ? priceBeo(beo, catalog) : null), [beo, catalog])
  const pricedBeo = useMemo<Beo | null>(() => (beo && priced ? { ...beo, lines: priced.lines, totals: priced.totals } : null), [beo, priced])

  const updateLines = useCallback((fn: (l: BeoLine[]) => BeoLine[]) => {
    setBeo((b) => ({ ...b, lines: fn(priceBeo(b, catalog).lines) }))
  }, [setBeo, catalog])

  if (loadErr) return <div className="notice warn">{loadErr}</div>
  if (!beo || !pricedBeo || !priced || !user) return <Spinner />

  const isDraft = beo.status === 'draft'
  const flow = flowFor(beo)
  const curPos = Math.min(pos, flow.length - 1)
  const step = flow[curPos] // step id (see STEPS)
  const last = curPos === flow.length - 1
  const reapproval = !isAdmin && beo.status === 'confirmed'
  const othersWork = !!beo.id && beo.salesUid !== user.uid
  const stamped = (b: Beo): Beo => ({ ...b, editedByUid: user.uid, editedByName: user.displayName })

  const saveDraft = async (quiet = false) => {
    if (!isDraft || !pricedBeo.customer.name.trim()) return beoId
    setSaving(true)
    try {
      if (beoId) await updateBeo(beoId, stamped(pricedBeo))
      else {
        const newId = await createBeo(stamped(pricedBeo))
        setBeoId(newId)
        setBeoRaw((b) => (b ? { ...b, id: newId } : b))
        window.history.replaceState(null, '', isAdmin ? `/admin/beo/${newId}/edit` : `/sales/beo/${newId}/edit`)
        setDirty(false)
        if (!quiet) toast('บันทึกแบบร่างแล้ว')
        return newId
      }
      setDirty(false)
      if (!quiet) toast('บันทึกแบบร่างแล้ว')
      return beoId
    } catch (e) {
      toast(`บันทึกไม่สำเร็จ: ${errorText(e)}`)
      return beoId
    } finally {
      setSaving(false)
    }
  }

  const go = async (to: number) => {
    if (to > pos) {
      for (let p = pos; p < to; p++) {
        const e = validateStep(flow[p], pricedBeo)
        if (Object.keys(e).length) { setErrors(e); setPos(p); window.scrollTo({ top: 0 }); return }
      }
    }
    setErrors({})
    setPos(to)
    window.scrollTo({ top: 0 })
    // auto-save drafts when moving on (only after customer is known, only if something changed)
    if (dirty && pos >= 1 && isDraft) void saveDraft(true)
  }

  const confirm = async () => {
    for (let p = 0; p < flow.length - 1; p++) {
      const e = validateStep(flow[p], pricedBeo)
      if (Object.keys(e).length) { setErrors(e); setPos(p); toast('กรอกข้อมูลให้ครบก่อนยืนยัน'); return }
    }
    setSaving(true)
    try {
      const res = await submitBeo(beoId, stamped(pricedBeo), { uid: user.uid, name: user.displayName, isAdmin })
      toast(res.status === 'pending' ? (reapproval ? `ส่งให้ Admin อนุมัติอีกครั้งแล้ว — ${res.docNo}` : `ส่งให้ Admin ยืนยันแล้ว — เลขที่ ${res.docNo}`) : `บันทึกแล้ว เลขที่ ${res.docNo}`)
      navigate(`/beo/${res.id}`, { replace: true })
    } catch (e) {
      toast(`ยืนยันไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const submitLabel = isAdmin
    ? (beo.status === 'draft' || beo.status === 'pending' ? 'ยืนยันงาน' : 'บันทึกการแก้ไข')
    : reapproval ? 'ส่งให้ Admin อนุมัติอีกครั้ง'
    : (beo.status === 'pending' ? 'บันทึกและส่งใหม่' : 'ส่งให้ Admin ยืนยัน')
  const stepProps = { beo, setBeo, catalog, errors }
  const lineCount = priced.lines.filter((l) => l.kind !== 'foc').length

  return (
    <div className="wiz-page">
      <div className="row between">
        <div>
          <div className="small muted">
            {beo.docNo ? `${beo.docNo}${beo.revision ? ` · Rev.${beo.revision}` : ''}` : 'BEO ใหม่'} · ขั้นที่ {curPos + 1}/{flow.length}
          </div>
          <h1>{STEPS[step]}</h1>
        </div>
        {isDraft && beo.customer.name && (
          <button className="btn small" disabled={saving || !dirty} onClick={() => void saveDraft()}>{saving ? 'กำลังบันทึก…' : dirty ? 'บันทึกร่าง' : 'บันทึกแล้ว'}</button>
        )}
      </div>
      <div className="wiz-progress">
        {flow.map((sid, i) => (
          <span key={sid} className={i < curPos ? 'done' : i === curPos ? 'cur' : ''} title={STEPS[sid]} role="button" onClick={() => (i < curPos ? void go(i) : undefined)} />
        ))}
      </div>

      {(reapproval || othersWork) && (
        <div className="notice gold" style={{ marginBottom: 12 }}>
          <span>
            {othersWork && <>กำลังแก้ไขงานของ <strong>{beo.salesName}</strong>{reapproval ? ' · ' : ''}</>}
            {reapproval && <>งานนี้ยืนยันแล้ว — เมื่อส่ง สถานะจะกลับเป็น “รอการยืนยัน” จนกว่า Admin จะอนุมัติ</>}
          </span>
        </div>
      )}
      {step === 0 && <StepType {...stepProps} />}
      {step === 1 && <StepCustomer {...stepProps} onRegular={setRegular} />}
      {step === 2 && <StepEvent {...stepProps} />}
      {step === 3 && <StepSeating {...stepProps} />}
      {step === STEP_ROOM_SERVICE && <StepRoomService {...stepProps} />}
      {step === 4 && (
        <>
          <StepFood beo={beo} catalog={catalog} priced={priced} updateLines={updateLines} isRegular={isRegular}
            isAdmin={isAdmin} cartOpen={cartOpen} setCartOpen={setCartOpen} />
          {errors.lines && <div className="err" style={{ marginTop: 8 }}>{errors.lines}</div>}
        </>
      )}
      {step === 5 && <StepConfirm beo={pricedBeo} setBeo={setBeo} catalog={catalog} isAdmin={isAdmin} />}

      <div className="wiz-foot">
        <div className="inner">
          {curPos > 0 && <button className="btn" onClick={() => void go(curPos - 1)}>ย้อนกลับ</button>}
          {step === 4 || step === 5 ? (
            <button className="cartbar" onClick={() => { if (step === 4) setCartOpen(true) }}>
              <div className="grow">
                <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lineCount} รายการ · {step === 4 ? 'ก่อน VAT' : beo.applyVat === false ? 'ไม่คิด VAT' : 'รวม VAT 7%'}{priced.lines.some((l) => l.kind === 'foc') ? ' · มีของแถม' : ''}</div>
                <div className="total num">{money(step === 4 ? priced.totals.subtotal : priced.totals.grandTotal)}</div>
              </div>
            </button>
          ) : <div className="grow" />}
          {!last
            ? <button className="btn primary" onClick={() => void go(curPos + 1)}>ถัดไป</button>
            : <button className="btn primary" disabled={saving} onClick={() => void confirm()}>{saving ? 'กำลังบันทึก…' : submitLabel}</button>}
        </div>
      </div>
    </div>
  )
}
