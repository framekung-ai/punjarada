import { useEffect, useMemo, useRef, useState } from 'react'
import type { Beo, BeoLine, Catalog, Cuisine, MealSlot, MenuItem, MenuSet, Service } from '../../lib/types'
import { CUISINE_LABEL } from '../../lib/types'
import { itemCuisine, lineName, mainCuisine, setCuisine } from '../../lib/cuisine'
import { checkBalance, displayName, lineAmount, ruleMatches, suggestFor, type PricingResult } from '../../lib/pricing'
import { money, num } from '../../lib/thai'
import { Field, Sheet, Stepper, useToast } from '../../components/ui'
import { addonLine, defaultQty, itemLine, serviceLine, setLine, templateFor } from './model'

type Tab = 'set-cn' | 'set-th' | 'menu-cn' | 'menu-th' | 'service'
const TAB_LABEL: Record<Tab, string> = {
  'set-cn': 'เซ็ตเมนูจีน', 'set-th': 'เซ็ตเมนูไทย', 'menu-cn': 'เลือกเอง จีน', 'menu-th': 'เลือกเอง ไทย', service: 'บริการ',
}

/** tabs that have something to show (a style with no sets / dishes yet is hidden) */
function availableTabs(catalog: Catalog): Tab[] {
  const hasSet = (c: Cuisine) => catalog.menuSets.some((s) => s.active && s.visibility !== 'hidden' && setCuisine(s) === c)
  const hasMenu = (c: Cuisine) => catalog.menuItems.some((m) => m.active && !m.setOnly && itemCuisine(m, catalog.categories) === c)
  const tabs: Tab[] = []
  if (hasSet('cn')) tabs.push('set-cn')
  if (hasSet('th')) tabs.push('set-th')
  if (hasMenu('cn')) tabs.push('menu-cn')
  if (hasMenu('th')) tabs.push('menu-th')
  tabs.push('service')
  return tabs
}

function firstTab(beo: Beo, tabs: Tab[]): Tab {
  const set = beo.lines.find((l) => l.kind === 'set')
  const item = beo.lines.find((l) => l.kind === 'item')
  const want: Tab | null = set ? `set-${set.cuisine ?? 'cn'}` : item ? `menu-${item.cuisine ?? 'cn'}` : null
  return want && tabs.includes(want) ? want : tabs[0]
}

interface Props {
  beo: Beo
  catalog: Catalog
  priced: PricingResult
  updateLines: (fn: (lines: BeoLine[]) => BeoLine[]) => void
  isRegular: boolean
  isAdmin: boolean
  cartOpen: boolean
  setCartOpen: (v: boolean) => void
}

export function StepFood({ beo, catalog, priced, updateLines, isRegular, isAdmin, cartOpen, setCartOpen }: Props) {
  const toast = useToast()
  const tabs = availableTabs(catalog)
  const [tab, setTab] = useState<Tab>(() => firstTab(beo, tabs))
  const cuisineOf = (m: MenuItem) => itemCuisine(m, catalog.categories)
  const [openSet, setOpenSet] = useState<MenuSet | null>(null)
  const [picking, setPicking] = useState<MenuItem | null>(null)
  const [svcPick, setSvcPick] = useState<Service | null>(null)
  const [slotOpen, setSlotOpen] = useState<MealSlot | null>(null)

  const template = templateFor(catalog, beo.seating.layout, beo.lines)
  const balance = checkBalance(priced.lines, catalog, template.slots)
  const missing = balance.filter((s) => !s.filled)
  const qty0 = defaultQty(beo)

  // tell Sales when a FOC reward switches on
  const prevFoc = useRef<string>('')
  useEffect(() => {
    const now = priced.lines.filter((l) => l.kind === 'foc').map((l) => l.name)
    const musicFree = priced.lines.find((l) => l.kind === 'service' && l.autoPriceRuleId)
    const sig = [...now, musicFree ? `${musicFree.name}:${musicFree.unitPrice}` : ''].join('|')
    if (prevFoc.current && sig !== prevFoc.current && (now.length || musicFree)) {
      const parts = [...now, musicFree ? (musicFree.unitPrice === 0 ? `${musicFree.name}ฟรี` : `${musicFree.name} ${num(musicFree.unitPrice)} บาท`) : ''].filter(Boolean)
      toast(`ได้รับสิทธิ์: ${parts.join(', ')}`)
    }
    prevFoc.current = sig
  }, [priced.lines, toast])

  const add = (l: BeoLine) => updateLines((ls) => [...ls, l])
  const qtyOf = (pred: (l: BeoLine) => boolean) => beo.lines.filter(pred).reduce((s, l) => s + l.qty, 0)
  const changeQty = (key: string, q: number) => updateLines((ls) => (q <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: q } : l))))

  const addItem = (m: MenuItem) => {
    if (m.variants.length || m.priceType !== 'fixed') { setPicking(m); return }
    add(itemLine(m, qty0, undefined, cuisineOf(m)))
  }

  return (
    <div className="stack">
      <div className="row between wrap">
        <h2>อาหารและบริการ</h2>
        <span className="small muted">{beo.seating.tables > 0 ? `${beo.seating.tables} โต๊ะ · ` : ''}{num(beo.seating.guests)} ท่าน · ราคาก่อน VAT</span>
      </div>

      {/* one compact line: what's missing in the meal */}
      {template.slots.length > 0 && (beo.lines.length > 0) && (
        <div className="balance">
          {missing.length === 0 ? (
            <span className="dot ok">✓ อาหารครบทุกหมวด ({template.slots.length}/{template.slots.length})</span>
          ) : (
            <>
              <span className="small muted">ครบ {balance.length - missing.length}/{balance.length} · ยังขาด:</span>
              {missing.map((s) => <button key={s.slot.label} type="button" className="dot" onClick={() => setSlotOpen(s.slot)}>+ {s.slot.label}</button>)}
            </>
          )}
        </div>
      )}
      {priced.hints.slice(0, 1).map((h) => <div key={h.ruleId} className="notice gold">💡 {h.text}</div>)}

      <div className="chips scroll food-tabs" role="tablist" aria-label="ประเภทรายการ">
        {tabs.map((t) => (
          <button key={t} type="button" role="tab" aria-selected={tab === t} className={`chip${tab === t ? ' on' : ''}`} onClick={() => setTab(t)}>
            {TAB_LABEL[t]}
          </button>
        ))}
      </div>

      {(tab === 'set-cn' || tab === 'set-th') && (
        <SetTab key={tab} cuisine={tab === 'set-th' ? 'th' : 'cn'} catalog={catalog} beo={beo} isRegular={isRegular} isAdmin={isAdmin}
          qtyOf={(id) => qtyOf((l) => l.kind === 'set' && l.refId === id)} onOpen={setOpenSet}
          onAdd={(s) => { add(setLine(s, qty0)); toast(`เพิ่ม${s.name} ${qty0} โต๊ะ`) }} />
      )}
      {(tab === 'menu-cn' || tab === 'menu-th') && (
        <MenuTab key={tab} cuisine={tab === 'menu-th' ? 'th' : 'cn'} catalog={catalog} beo={beo} onAdd={addItem}
          lineOf={(id) => beo.lines.find((l) => l.kind === 'item' && l.refId === id)} changeQty={changeQty} />
      )}
      {tab === 'service' && (
        <div className="menu-list">
          {catalog.services.filter((s) => s.active).map((s) => {
            const line = beo.lines.find((l) => l.kind === 'service' && l.refId === s.id)
            const pricedLine = priced.lines.find((l) => l.key === line?.key)
            return (
              <div key={s.id} className={`menu-card${line ? ' in' : ''}`}>
                <div className="grow">
                  <div className="name">{s.name}</div>
                  <div className="small muted">
                    {pricedLine?.autoPriceRuleId
                      ? <span className="badge gold">{pricedLine.unitPrice === 0 ? 'ฟรี' : `${num(pricedLine.unitPrice)} บาท`} · {pricedLine.detail}</span>
                      : s.price > 0 ? `${num(s.price)} บาท / ${s.unit}` : 'กำหนดราคาตอนเพิ่ม'}
                  </div>
                </div>
                {line ? <Stepper value={line.qty} min={0} onChange={(v) => changeQty(line.key, v)} editable={false} />
                  : <button type="button" className="btn small primary" onClick={() => (s.priceEditable || s.price === 0 ? setSvcPick(s) : add(serviceLine(s)))}>+ เพิ่ม</button>}
              </div>
            )
          })}
        </div>
      )}

      {/* set details */}
      <Sheet open={!!openSet} onClose={() => setOpenSet(null)} title={openSet?.name}
        footer={openSet && (
          <button className="btn primary block big" onClick={() => { add(setLine(openSet, qty0)); setOpenSet(null); toast(`เพิ่ม${openSet.name}`) }}>
            เลือกเซ็ตนี้ ({qty0} โต๊ะ × {num(openSet.pricePerTable)})
          </button>
        )}>
        {openSet && (
          <>
            <div className="row wrap"><span className="badge">{num(openSet.pricePerTable)} บาท / โต๊ะ</span>{openSet.seats && <span className="badge gray">{openSet.seats}</span>}<span className="badge gray">{CUISINE_LABEL[setCuisine(openSet)]}</span></div>
            <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.9 }}>{openSet.items.map((i, k) => <li key={k}>{i.name}</li>)}</ol>
            {openSet.drinksText && <div className="small">เครื่องดื่มในเซ็ต: {openSet.drinksText}</div>}
            {openSet.note && <div className="small muted">{openSet.note}</div>}
            {openSet.addOnOffers.length > 0 && (
              <div className="card flat stack">
                <strong>สิทธิแลกซื้อราคาพิเศษ</strong>
                {openSet.addOnOffers.map((o) => {
                  const used = beo.lines.filter((l) => l.kind === 'addon' && l.refId === o.menuItemId).length
                  const m = catalog.menuItems.find((x) => x.id === o.menuItemId)
                  return (
                    <div key={o.menuItemId} className="row between">
                      <span>{o.name} <span className="muted small">{m && m.price > o.specialPrice ? <s>{num(m.price)}</s> : null} {num(o.specialPrice)} บาท</span></span>
                      <button className="btn small" disabled={used >= o.maxQty} onClick={() => { add(addonLine(o, m?.course, m ? cuisineOf(m) : setCuisine(openSet))); toast(`เพิ่ม ${o.name}`) }}>{used >= o.maxQty ? 'ใช้สิทธิ์แล้ว' : '+ แลกซื้อ'}</button>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </Sheet>

      <PickItemSheet item={picking} qty0={qty0} cuisine={picking ? cuisineOf(picking) : 'cn'} onClose={() => setPicking(null)} onAdd={(l) => { add(l); setPicking(null) }} />

      <ServiceSheet svc={svcPick} onClose={() => setSvcPick(null)} onAdd={(l) => { add(l); setSvcPick(null) }} />

      <Sheet open={!!slotOpen} onClose={() => setSlotOpen(null)} title={slotOpen ? `แนะนำ: ${slotOpen.label}` : ''}>
        {slotOpen && (
          <>
            {suggestFor(slotOpen, priced.lines, catalog, 3, mainCuisine(beo.lines)).map((m) => (
              <div key={m.id} className="menu-card">
                <div className="grow">
                  <div className="name">{displayName(m)} {m.tags.includes('แนะนำ') && <span className="badge gold">★</span>}</div>
                  <div className="small muted">{num(m.price)} บาท / {m.unit}</div>
                </div>
                <button className="btn small primary" onClick={() => { addItem(m); setSlotOpen(null) }}>+ เพิ่ม</button>
              </div>
            ))}
            <button className="btn ghost" onClick={() => { const t: Tab = `menu-${mainCuisine(beo.lines)}`; setTab(tabs.includes(t) ? t : tabs[0]); setSlotOpen(null) }}>ดูเมนูทั้งหมด</button>
          </>
        )}
      </Sheet>

      <CartSheet open={cartOpen} onClose={() => setCartOpen(false)} priced={priced} updateLines={updateLines} isAdmin={isAdmin} />
    </div>
  )
}

function SetTab({ cuisine, catalog, beo, isRegular, isAdmin, qtyOf, onOpen, onAdd }: {
  cuisine: Cuisine; catalog: Catalog; beo: Beo; isRegular: boolean; isAdmin: boolean
  qtyOf: (id: string) => number; onOpen: (s: MenuSet) => void; onAdd: (s: MenuSet) => void
}) {
  const tables = beo.seating.tables
  const sets = catalog.menuSets.filter((s) => s.active && setCuisine(s) === cuisine && (s.visibility === 'all' || (s.visibility === 'regularOnly' && (isRegular || isAdmin))))
  const focFor = (s: MenuSet) => {
    const ctx = { tables, foodTotal: s.pricePerTable * tables, pricePerTable: s.pricePerTable }
    const out: string[] = []
    const groups = new Map<string, typeof catalog.focRules>()
    catalog.focRules.filter((r) => r.active).forEach((r) => groups.set(r.group, [...(groups.get(r.group) ?? []), r]))
    for (const rules of groups.values()) {
      const hit = rules.sort((a, b) => a.order - b.order).find((r) => ruleMatches(r, ctx))
      if (!hit) continue
      if (hit.effect.kind === 'free') {
        hit.effect.items.filter((i) => !s.includes.includes(i.key as never)).forEach((i) => out.push(i.label))
      } else out.push(hit.effect.price === 0 ? 'นักดนตรีฟรี' : `นักดนตรี ${hit.effect.price} บาท`)
    }
    return out
  }
  if (sets.length === 0) return <div className="notice info">ยังไม่มีเซ็ตเมนู{CUISINE_LABEL[cuisine]}</div>
  return (
    <div className="menu-list">
      {sets.map((s) => {
        const q = qtyOf(s.id)
        const foc = tables > 0 ? focFor(s) : []
        return (
          <div key={s.id} className={`set-card${q ? ' in' : ''}`}>
            <div className="row between">
              <strong>{s.name}</strong>
              {s.visibility === 'regularOnly' && <span className="badge gold">ลูกค้าประจำ</span>}
            </div>
            <div className="price num">{num(s.pricePerTable)} <span className="small muted">บาท / โต๊ะ{s.seats ? ` · ${s.seats}` : ''}</span></div>
            <div className="small muted">{s.items.slice(0, 4).map((i) => i.name).join(' · ')}{s.items.length > 4 ? ` +${s.items.length - 4}` : ''}</div>
            {foc.length > 0 && <div className="small"><span className="badge gold">ได้รับ</span> {foc.join(', ')}</div>}
            <div className="row">
              <button type="button" className="btn small" onClick={() => onOpen(s)}>ดูรายการ</button>
              {q > 0 ? <span className="badge ok" style={{ marginLeft: 'auto' }}>เลือกแล้ว {q} โต๊ะ</span>
                : <button type="button" className="btn small primary" style={{ marginLeft: 'auto' }} onClick={() => onAdd(s)}>+ เลือก</button>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function MenuTab({ cuisine, catalog, beo, onAdd, lineOf, changeQty }: {
  cuisine: Cuisine; catalog: Catalog; beo: Beo; onAdd: (m: MenuItem) => void
  lineOf: (id: string) => BeoLine | undefined; changeQty: (key: string, q: number) => void
}) {
  const cats = catalog.categories.filter((c) => c.active && (c.cuisine ?? 'cn') === cuisine)
  const pool = useMemo(() => catalog.menuItems.filter((m) => m.active && !m.setOnly && itemCuisine(m, catalog.categories) === cuisine), [catalog, cuisine])
  const hasStar = pool.some((m) => m.tags.includes('แนะนำ'))
  const hasVeg = pool.some((m) => m.tags.includes('เจ'))
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string>(hasStar ? '★' : (cats[0]?.id ?? '★'))
  const [veg, setVeg] = useState(false)
  const items = useMemo(() => {
    const term = q.trim().replace(/\s+/g, '')
    return pool.filter((m) => {
      if (veg && !m.tags.includes('เจ')) return false
      if (term) return (m.name + m.variants.join('')).replace(/\s+/g, '').includes(term)
      if (cat === '★') return m.tags.includes('แนะนำ')
      return m.categoryId === cat
    })
  }, [pool, q, cat, veg])
  return (
    <div className="stack">
      <input className="input" type="search" placeholder={`🔍 ค้นหาเมนู${CUISINE_LABEL[cuisine]} เช่น ${cuisine === 'th' ? 'น้ำพริก, แกงเขียวหวาน' : 'กะพง, ต้มยำ'}`} value={q} onChange={(e) => setQ(e.target.value)} />
      {!q && (
        <div className="chips scroll">
          {hasStar && <button type="button" className={`chip small${cat === '★' ? ' on' : ''}`} onClick={() => setCat('★')}>★ แนะนำ</button>}
          {cats.map((c) => <button key={c.id} type="button" className={`chip small${cat === c.id ? ' on' : ''}`} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
      )}
      {hasVeg && <label className="row small" style={{ gap: 6 }}><input type="checkbox" checked={veg} onChange={(e) => setVeg(e.target.checked)} /> เฉพาะอาหารเจ</label>}
      {items.length === 0 ? <div className="muted center" style={{ padding: 24 }}>ไม่พบเมนู</div> : (
        <div className="menu-list">
          {items.map((m) => {
            const line = m.variants.length || m.priceType !== 'fixed' ? undefined : lineOf(m.id)
            const count = beo.lines.filter((l) => l.kind === 'item' && l.refId === m.id).length
            return (
              <div key={m.id} className={`menu-card${count ? ' in' : ''}`}>
                <div className="grow">
                  <div className="name">{displayName(m)} {m.tags.includes('แนะนำ') && cat !== '★' && <span className="badge gold">★</span>}</div>
                  <div className="small muted num">
                    {m.priceType === 'perWeight' ? `ขีดละ ${num(m.price)}` : m.priceType === 'byOption' ? m.options?.map((o) => num(o.price)).join(' / ') : num(m.price)} บาท{m.priceType === 'fixed' ? ` / ${m.unit}` : ''}
                  </div>
                </div>
                {line ? <Stepper value={line.qty} min={0} onChange={(v) => changeQty(line.key, v)} editable={false} />
                  : <button type="button" className="btn small primary" onClick={() => onAdd(m)}>{count ? `+ อีก (${count})` : '+ เพิ่ม'}</button>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PickItemSheet({ item, qty0, cuisine, onClose, onAdd }: { item: MenuItem | null; qty0: number; cuisine: Cuisine; onClose: () => void; onAdd: (l: BeoLine) => void }) {
  const [variant, setVariant] = useState('')
  const [opt, setOpt] = useState(0)
  const [qty, setQty] = useState(qty0)
  useEffect(() => { setVariant(item?.variants[0] ?? ''); setOpt(0); setQty(item?.priceType === 'perWeight' ? 5 : qty0) }, [item, qty0])
  if (!item) return null
  const option = item.priceType === 'byOption' ? item.options?.[opt] : undefined
  return (
    <Sheet open onClose={onClose} title={`${item.name} (${CUISINE_LABEL[cuisine]})`}
      footer={<button className="btn primary block big" onClick={() => onAdd(itemLine(item, qty, { variant: variant || undefined, option }, cuisine))}>เพิ่มรายการ</button>}>
      {item.variants.length > 0 && (
        <Field label="เลือก">
          <div className="chips">{item.variants.map((v) => <button key={v} type="button" className={`chip${variant === v ? ' on' : ''}`} onClick={() => setVariant(v)}>{v}</button>)}</div>
        </Field>
      )}
      {item.priceType === 'byOption' && (
        <Field label="ขนาด">
          <div className="chips">{item.options?.map((o, i) => <button key={i} type="button" className={`chip${opt === i ? ' on' : ''}`} onClick={() => setOpt(i)}>{o.label} {num(o.price)}</button>)}</div>
        </Field>
      )}
      <Field label={item.priceType === 'perWeight' ? `จำนวน (ขีด) — ขีดละ ${num(item.price)} บาท` : `จำนวน (${item.unit})`}>
        <Stepper value={qty} min={1} onChange={setQty} />
      </Field>
    </Sheet>
  )
}

function ServiceSheet({ svc, onClose, onAdd }: { svc: Service | null; onClose: () => void; onAdd: (l: BeoLine) => void }) {
  const [price, setPrice] = useState(0)
  const [qty, setQty] = useState(1)
  useEffect(() => { setPrice(svc?.price ?? 0); setQty(1) }, [svc])
  if (!svc) return null
  return (
    <Sheet open onClose={onClose} title={svc.name}
      footer={<button className="btn primary block big" onClick={() => onAdd(serviceLine(svc, qty, price))}>เพิ่ม {money(price * qty)} บาท</button>}>
      <Field label={`ราคาต่อ${svc.unit} (บาท)`}>
        <input className="input num" inputMode="decimal" value={price} onChange={(e) => setPrice(Number(e.target.value.replace(/[^\d.]/g, '')) || 0)} />
      </Field>
      <Field label={`จำนวน (${svc.unit})`}><Stepper value={qty} min={1} onChange={setQty} /></Field>
    </Sheet>
  )
}

export function CartSheet({ open, onClose, priced, updateLines, isAdmin }: {
  open: boolean; onClose: () => void; priced: PricingResult; updateLines: (fn: (l: BeoLine[]) => BeoLine[]) => void; isAdmin: boolean
}) {
  const setQty = (key: string, q: number) => updateLines((ls) => (q <= 0 ? ls.filter((l) => l.key !== key) : ls.map((l) => (l.key === key ? { ...l, qty: q } : l))))
  const setPrice = (key: string, p: number) => updateLines((ls) => ls.map((l) => (l.key === key ? { ...l, unitPrice: p, manualPrice: true } : l)))
  const toggle = (key: string) => updateLines((ls) => ls.map((l) => (l.key === key ? { ...l, declined: !l.declined } : l)))
  const groups: [string, BeoLine[]][] = [
    ['อาหาร', priced.lines.filter((l) => l.kind === 'set' || l.kind === 'item' || l.kind === 'addon')],
    ['บริการ', priced.lines.filter((l) => l.kind === 'service')],
    ['ของแถม (FOC)', priced.lines.filter((l) => l.kind === 'foc')],
  ]
  const t = priced.totals
  return (
    <Sheet open={open} onClose={onClose} title="รายการที่เลือก">
      {groups.map(([title, ls]) => ls.length > 0 && (
        <div key={title} className="stack" style={{ gap: 8 }}>
          <div className="small muted" style={{ fontWeight: 700 }}>{title}</div>
          {ls.map((l) => (
            <div key={l.key} className="row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div style={{ fontWeight: 600 }}>{lineName(l, priced.lines)}{l.kind === 'addon' && <span className="badge gold" style={{ marginLeft: 6 }}>แลกซื้อ</span>}</div>
                <div className="small muted">
                  {l.kind === 'foc' ? `${num(l.qty)} ${l.unit} · ${l.detail ?? ''}` : (
                    <>
                      {isAdmin && l.kind !== 'set'
                        ? <input className="inline-input" inputMode="decimal" value={l.unitPrice} onChange={(e) => setPrice(l.key, Number(e.target.value) || 0)} />
                        : num(l.unitPrice)} × {num(l.qty)} = <strong className="num">{money(lineAmount(l))}</strong>
                      {l.autoPriceRuleId && <span className="badge gold" style={{ marginLeft: 6 }}>{l.unitPrice === 0 ? 'ฟรี' : 'ส่วนลด'}</span>}
                    </>
                  )}
                </div>
              </div>
              {l.kind === 'foc'
                ? <button className={`btn small${l.declined ? '' : ' primary'}`} onClick={() => toggle(l.key)}>{l.declined ? 'ไม่รับ' : 'รับ'}</button>
                : <Stepper value={l.qty} min={0} onChange={(v) => setQty(l.key, v)} editable={false} />}
            </div>
          ))}
        </div>
      ))}
      {priced.lines.length === 0 && <div className="muted center">ยังไม่มีรายการ</div>}
      <div className="card flat stack" style={{ gap: 4 }}>
        <div className="row between"><span>รวม</span><span className="num">{money(t.subtotal + t.discount)}</span></div>
        {t.discount > 0 && <div className="row between"><span>ส่วนลด</span><span className="num">-{money(t.discount)}</span></div>}
        <div className="row between" style={{ fontWeight: 700, fontSize: '1.1rem' }}><span>ยอดก่อน VAT</span><span className="num">{money(t.subtotal)}</span></div>
        <div className="small muted">คิด / ไม่คิด VAT 7% เลือกได้ในขั้นสุดท้าย</div>
      </div>
    </Sheet>
  )
}
