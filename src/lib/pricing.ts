// Pricing, FOC and meal-balance logic. Pure functions — no Firebase here,
// so the same code can run in the browser, in tests, and later in Cloud Functions.
import type {
  Beo, BeoLine, BeoTotals, Catalog, CourseId, FocCondition, FocRule, MealSlot, MenuItem,
} from './types'

const toSatang = (b: number) => Math.round((Number(b) || 0) * 100)
const toBaht = (s: number) => s / 100

export function lineAmount(l: BeoLine): number {
  if (l.kind === 'foc') return 0
  return toBaht(Math.round(toSatang(l.unitPrice) * (Number(l.qty) || 0)))
}

let seq = 0
export function newKey(prefix = 'l'): string {
  seq += 1
  return `${prefix}${Date.now().toString(36)}${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

function isFood(l: BeoLine): boolean {
  return (l.kind === 'set' || l.kind === 'item' || l.kind === 'addon') && l.course !== 'drink'
}

export interface PricingContext {
  tables: number
  foodTotal: number
  pricePerTable: number
}

export function pricingContext(beo: Pick<Beo, 'lines' | 'seating'>): PricingContext {
  const foodTotal = beo.lines.filter(isFood).reduce((s, l) => s + lineAmount(l), 0)
  const tables = Math.max(0, Math.floor(Number(beo.seating.tables) || 0))
  const pricePerTable = tables > 0 ? Math.round((foodTotal / tables) * 100) / 100 : 0
  return { tables, foodTotal, pricePerTable }
}

function condMet(c: FocCondition, ctx: PricingContext): boolean {
  const v = c.field === 'tables' ? ctx.tables : ctx.pricePerTable
  switch (c.op) {
    case '>=': return v >= c.value
    case '>': return v > c.value
    case '<=': return v <= c.value
    case '<': return v < c.value
  }
}

export function ruleMatches(rule: FocRule, ctx: PricingContext): boolean {
  if (ctx.tables <= 0) return false // FOC here is table-based
  return rule.conditions.every((c) => condMet(c, ctx))
}

function groupRules(rules: FocRule[]): Map<string, FocRule[]> {
  const m = new Map<string, FocRule[]>()
  for (const r of rules.filter((r) => r.active)) {
    const arr = m.get(r.group) ?? []
    arr.push(r)
    m.set(r.group, arr)
  }
  for (const arr of m.values()) arr.sort((a, b) => a.order - b.order)
  return m
}

export interface Hint {
  ruleId: string
  text: string
}

export interface PricingResult {
  lines: BeoLine[]
  totals: BeoTotals
  ctx: PricingContext
  matched: Record<string, string | null> // group -> ruleId
  hints: Hint[]
  includedBySet: string[]
}

/**
 * Recalculate a BEO: regenerates FOC lines, applies FOC service prices (e.g. musician),
 * and computes totals incl. VAT. Keeps the Sales person's "declined" choice on FOC lines.
 */
export function priceBeo(beo: Beo, catalog: Pick<Catalog, 'focRules' | 'services' | 'menuSets' | 'settings'>): PricingResult {
  const prevFoc = new Map(beo.lines.filter((l) => l.kind === 'foc').map((l) => [l.focKey ?? '', l]))
  const base = beo.lines.filter((l) => l.kind !== 'foc').map((l) => ({ ...l }))
  const ctx = pricingContext({ lines: base, seating: beo.seating })

  const includedBySet = new Set<string>()
  for (const l of base) {
    if (l.kind !== 'set') continue
    const s = catalog.menuSets.find((x) => x.id === l.refId)
    s?.includes.forEach((k) => includedBySet.add(k))
  }

  const matched: Record<string, string | null> = {}
  const focLines: BeoLine[] = []
  const hints: Hint[] = []
  const priceOverride = new Map<string, { price: number; rule: FocRule }>()

  for (const [group, rules] of groupRules(catalog.focRules)) {
    const hit = rules.find((r) => ruleMatches(r, ctx)) ?? null
    matched[group] = hit?.id ?? null
    if (hit) {
      const e = hit.effect
      if (e.kind === 'free') {
        for (const it of e.items) {
          if (includedBySet.has(it.key)) continue
          const qty = it.qtyPer === 'table' ? it.qty * ctx.tables : it.qty
          const key = `${hit.id}:${it.key}`
          const prev = prevFoc.get(key)
          focLines.push({
            key, kind: 'foc', focRuleId: hit.id, focKey: key, name: it.label, detail: hit.name,
            qty, unit: it.qtyPer === 'table' ? 'โต๊ะ' : it.unit, unitPrice: 0,
            value: toBaht(toSatang(it.unitValue) * qty), declined: prev?.declined ?? false,
          })
        }
      } else {
        priceOverride.set(e.serviceId, { price: e.price, rule: hit })
      }
    }

    // hints: the next better rule that is close to reach
    const better = hit ? rules.filter((r) => r.order < hit.order) : rules
    const relevant = rules.some((r) => r.effect.kind === 'setPrice')
      ? base.some((l) => l.kind === 'service' && rules.some((r) => r.effect.kind === 'setPrice' && r.effect.serviceId === l.refId))
      : ctx.tables > 0
    if (relevant) {
      for (const r of [...better].reverse()) {
        const h = hintFor(r, ctx, includedBySet)
        if (h) { hints.push({ ruleId: r.id, text: h }); break }
      }
    }
  }

  for (const l of base) {
    if (l.kind !== 'service' || l.manualPrice) continue
    const svc = catalog.services.find((s) => s.id === l.refId)
    const ov = l.refId ? priceOverride.get(l.refId) : undefined
    if (ov) {
      l.unitPrice = ov.price
      l.autoPriceRuleId = ov.rule.id
      l.detail = ov.rule.name
    } else if (svc && l.autoPriceRuleId) {
      l.unitPrice = svc.price
      delete l.autoPriceRuleId
      delete l.detail
    }
  }

  const lines = [...base, ...focLines]
  const vatRate = catalog.settings.vatRate ?? 0.07
  const gross = lines.reduce((s, l) => s + toSatang(lineAmount(l)), 0)
  const discount = Math.min(toSatang(beo.discount), gross)
  const subtotal = gross - discount
  const vat = Math.round(subtotal * vatRate)
  const focValue = focLines.filter((l) => !l.declined).reduce((s, l) => s + toSatang(l.value ?? 0), 0)
    + base.filter((l) => l.kind === 'service' && l.autoPriceRuleId).reduce((s, l) => {
      const svc = catalog.services.find((x) => x.id === l.refId)
      return s + (svc ? Math.max(0, toSatang(svc.price) - toSatang(l.unitPrice)) * (Number(l.qty) || 0) : 0)
    }, 0)

  return {
    lines,
    ctx,
    matched,
    hints,
    includedBySet: [...includedBySet],
    totals: {
      subtotal: toBaht(subtotal),
      discount: toBaht(discount),
      vat: toBaht(vat),
      grandTotal: toBaht(subtotal + vat),
      focValue: toBaht(focValue),
    },
  }
}

function hintFor(rule: FocRule, ctx: PricingContext, included: Set<string>): string | null {
  const unmet = rule.conditions.filter((c) => !condMet(c, ctx))
  if (unmet.length !== 1 || ctx.tables <= 0) return null
  const c = unmet[0]
  // nothing to gain if the set already includes these drinks
  const gain = rule.effect.kind === 'free' ? rule.effect.items.filter((i) => !included.has(i.key)) : []
  if (rule.effect.kind === 'free' && gain.length === 0) return null
  const reward = rule.effect.kind === 'free'
    ? `รับ${gain.map((i) => i.label).join(' + ')}ฟรี`
    : rule.effect.price === 0 ? 'รับนักดนตรีฟรี' : `ค่านักดนตรีเหลือ ${rule.effect.price.toLocaleString('th-TH')} บาท`
  if (c.field === 'pricePerTable') {
    const need = Math.ceil(c.value - ctx.pricePerTable + (c.op === '>' ? 1 : 0))
    if (need > 0 && need <= c.value * 0.2) return `เพิ่มอีก ${need.toLocaleString('th-TH')} บาท/โต๊ะ ${reward}`
  } else if (c.field === 'tables') {
    const need = Math.ceil(c.value - ctx.tables + (c.op === '>' ? 1 : 0))
    if (need > 0 && need <= 2) return `เพิ่มอีก ${need} โต๊ะ ${reward}`
  }
  return null
}

// ---------------- Meal balance ----------------

export interface SlotStatus {
  slot: MealSlot
  filled: boolean
  by: string[]
}

export function coveredCourses(lines: BeoLine[], catalog: Pick<Catalog, 'menuSets'>): Map<CourseId, string[]> {
  const m = new Map<CourseId, string[]>()
  const add = (c: CourseId | undefined, name: string) => {
    if (!c) return
    m.set(c, [...(m.get(c) ?? []), name])
  }
  for (const l of lines) {
    if (l.kind === 'item' || l.kind === 'addon') add(l.course, l.name)
    if (l.kind === 'set') {
      const s = catalog.menuSets.find((x) => x.id === l.refId)
      s?.items.forEach((it) => add(it.course, it.name))
    }
  }
  return m
}

export function checkBalance(lines: BeoLine[], catalog: Pick<Catalog, 'menuSets'>, slots: MealSlot[]): SlotStatus[] {
  const covered = coveredCourses(lines, catalog)
  return slots.map((slot) => {
    const by = slot.courses.flatMap((c) => covered.get(c) ?? [])
    return { slot, filled: by.length > 0, by }
  })
}

export function suggestFor(
  slot: MealSlot,
  lines: BeoLine[],
  catalog: Pick<Catalog, 'menuItems'>,
  n = 3,
): MenuItem[] {
  const usedIds = new Set(lines.map((l) => l.refId))
  const chosen = catalog.menuItems.filter((m) => usedIds.has(m.id) && m.course !== 'drink')
  const allVeg = chosen.length > 0 && chosen.every((m) => m.tags.includes('เจ'))
  const proteins = new Set(chosen.map((m) => m.protein).filter(Boolean))
  const priced = chosen.filter((m) => m.price > 0)
  const avg = priced.length ? priced.reduce((s, m) => s + m.price, 0) / priced.length : 450
  return catalog.menuItems
    .filter((m) => m.active && !m.setOnly && slot.courses.includes(m.course) && !usedIds.has(m.id))
    .filter((m) => (allVeg ? m.tags.includes('เจ') : !m.tags.includes('เจ')))
    .map((m) => {
      let score = Math.abs(m.price - avg)
      if (m.tags.includes('แนะนำ')) score -= 400
      if (m.protein && proteins.has(m.protein)) score += 300
      if (m.price > avg * 2.5) score += 2000 // e.g. shark-fin soup 3,500
      return { m, score }
    })
    .sort((a, b) => a.score - b.score)
    .slice(0, n)
    .map((x) => x.m)
}

export function displayName(m: Pick<MenuItem, 'name' | 'variants'>): string {
  return m.variants.length ? `${m.name} (${m.variants.join('/')})` : m.name
}
