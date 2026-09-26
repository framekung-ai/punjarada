import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import type { Beo, BeoLine } from '../../lib/types'
import { useAuth } from '../../lib/auth'
import { useReadyCatalog } from '../../lib/catalog'
import { priceBeo } from '../../lib/pricing'
import { submitBeo, createBeo, findCustomer, getBeo, updateBeo } from '../../lib/db'
import { money } from '../../lib/thai'
import { errorText, Spinner, useToast } from '../../components/ui'
import { copyAsNew, emptyBeo, STEPS, validateStep, type StepErrors } from './model'
import { StepCustomer, StepEvent, StepSeating, StepType } from './StepBasics'
import { StepFood } from './StepFood'
import { StepConfirm } from './StepConfirm'

export function Wizard() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const catalog = useReadyCatalog()
  const isAdmin = user?.role === 'admin'

  const [beo, setBeoRaw] = useState<Beo | null>(id ? null : null)
  const [beoId, setBeoId] = useState<string | undefined>(id)
  const [step, setStep] = useState(0)
  const [errors, setErrors] = useState<StepErrors>({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [isRegular, setRegular] = useState(false)
  const [cartOpen, setCartOpen] = useState(false)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  // load / init
  useEffect(() => {
    if (!user) return
    if (id) {
      getBeo(id).then((b) => {
        if (!b) { setLoadErr('ไม่พบเอกสาร'); return }
        if (!isAdmin && b.status !== 'draft' && b.status !== 'pending') { setLoadErr('เอกสารที่ยืนยันแล้วแก้ไขได้เฉพาะ Admin'); return }
        setBeoRaw(b)
        setStep(b.lines.length ? 4 : 1)
        findCustomer(b.customer.phone).then((c) => setRegular(!!c && c.beoCount > 0)).catch(() => {})
      }).catch((e) => setLoadErr(errorText(e)))
    } else {
      const copy = (location.state as { copyFrom?: Beo } | null)?.copyFrom
      setBeoRaw(copy ? copyAsNew(copy, user) : emptyBeo(user))
      if (copy) setStep(2)
    }
  }, [id, user, isAdmin, location.state])

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

  const saveDraft = async (quiet = false) => {
    if (!isDraft || !pricedBeo.customer.name.trim()) return beoId
    setSaving(true)
    try {
      if (beoId) await updateBeo(beoId, pricedBeo)
      else {
        const newId = await createBeo(pricedBeo)
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
    if (to > step) {
      for (let s = step; s < to; s++) {
        const e = validateStep(s, pricedBeo)
        if (Object.keys(e).length) { setErrors(e); setStep(s); window.scrollTo({ top: 0 }); return }
      }
    }
    setErrors({})
    setStep(to)
    window.scrollTo({ top: 0 })
    // auto-save drafts when moving on (only after customer is known, only if something changed)
    if (dirty && step >= 1 && isDraft) void saveDraft(true)
  }

  const confirm = async () => {
    for (let s = 0; s < 5; s++) {
      const e = validateStep(s, pricedBeo)
      if (Object.keys(e).length) { setErrors(e); setStep(s); toast('กรอกข้อมูลให้ครบก่อนยืนยัน'); return }
    }
    setSaving(true)
    try {
      const res = await submitBeo(beoId, pricedBeo, { uid: user.uid, name: user.displayName, isAdmin })
      toast(res.status === 'pending' ? `ส่งให้ Admin ยืนยันแล้ว — เลขที่ ${res.docNo}` : `บันทึกแล้ว เลขที่ ${res.docNo}`)
      navigate(`/beo/${res.id}`, { replace: true })
    } catch (e) {
      toast(`ยืนยันไม่สำเร็จ: ${errorText(e)}`)
    } finally {
      setSaving(false)
    }
  }

  const submitLabel = isAdmin
    ? (beo.status === 'draft' || beo.status === 'pending' ? 'ยืนยันงาน' : 'บันทึกการแก้ไข')
    : (beo.status === 'pending' ? 'บันทึกและส่งใหม่' : 'ส่งให้ Admin ยืนยัน')
  const stepProps = { beo, setBeo, catalog, errors }
  const lineCount = priced.lines.filter((l) => l.kind !== 'foc').length

  return (
    <div>
      <div className="row between">
        <div>
          <div className="small muted">
            {beo.docNo ? `${beo.docNo}${beo.revision ? ` · Rev.${beo.revision}` : ''}` : 'BEO ใหม่'} · ขั้นที่ {step + 1}/{STEPS.length}
          </div>
          <h1>{STEPS[step]}</h1>
        </div>
        {isDraft && beo.customer.name && (
          <button className="btn small" disabled={saving || !dirty} onClick={() => void saveDraft()}>{saving ? 'กำลังบันทึก…' : dirty ? 'บันทึกร่าง' : 'บันทึกแล้ว'}</button>
        )}
      </div>
      <div className="wiz-progress">
        {STEPS.map((s, i) => (
          <span key={s} className={i < step ? 'done' : i === step ? 'cur' : ''} title={s} role="button" onClick={() => (i < step ? void go(i) : undefined)} />
        ))}
      </div>

      {step === 0 && <StepType {...stepProps} />}
      {step === 1 && <StepCustomer {...stepProps} onRegular={setRegular} />}
      {step === 2 && <StepEvent {...stepProps} />}
      {step === 3 && <StepSeating {...stepProps} />}
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
          {step > 0 && <button className="btn" onClick={() => void go(step - 1)}>ย้อนกลับ</button>}
          {step >= 4 ? (
            <button className="cartbar" onClick={() => { if (step === 4) setCartOpen(true) }}>
              <div className="grow">
                <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lineCount} รายการ · {step === 4 ? 'ก่อน VAT' : beo.applyVat === false ? 'ไม่คิด VAT' : 'รวม VAT 7%'}{priced.lines.some((l) => l.kind === 'foc') ? ' · มีของแถม' : ''}</div>
                <div className="total num">{money(step === 4 ? priced.totals.subtotal : priced.totals.grandTotal)}</div>
              </div>
            </button>
          ) : <div className="grow" />}
          {step < 5
            ? <button className="btn primary" onClick={() => void go(step + 1)}>ถัดไป</button>
            : <button className="btn primary" disabled={saving} onClick={() => void confirm()}>{saving ? 'กำลังบันทึก…' : submitLabel}</button>}
        </div>
      </div>
    </div>
  )
}
