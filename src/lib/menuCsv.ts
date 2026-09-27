// CSV import / export for the menu and set menus (Admin → นำเข้าข้อมูล).
// Pure functions: parse → plan (preview of what will change) → the page applies the plan.
import type { Catalog, Category, CourseId, Cuisine, DrinkKey, MealTemplate, MenuItem, MenuSet, PriceType, SetItem } from './types'
import { CUISINE_LABEL } from './types'
import { catCourse, catCuisine, guessCourse, setCuisine, THAI_TEMPLATE } from './cuisine'

// ---------------- CSV text ----------------

export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let cur: string[] = []
  let field = ''
  let q = false
  const t = text.replace(/^﻿/, '')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (q) {
      if (ch === '"' && t[i + 1] === '"') { field += '"'; i++ } else if (ch === '"') q = false
      else field += ch
    } else if (ch === '"') q = true
    else if (ch === ',') { cur.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && t[i + 1] === '\n') i++
      cur.push(field); rows.push(cur); cur = []; field = ''
    } else field += ch
  }
  if (field || cur.length) { cur.push(field); rows.push(cur) }
  return rows.filter((r) => r.some((c) => c.trim()))
}

export function toCsv(rows: (string | number)[][]): string {
  return '﻿' + rows.map((r) => r.map((c) => {
    const s = String(c ?? '')
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }).join(',')).join('\r\n')
}

const norm = (s: string) => s.replace(/\s+/g, '').replace(/[–—]/g, '-')
const col = (head: string[], ...names: string[]) => head.findIndex((h) => names.some((n) => norm(h).startsWith(norm(n))))

export function parseCuisine(v: string | undefined, fallback: Cuisine = 'cn'): Cuisine {
  const t = norm(v ?? '')
  if (!t) return fallback
  if (/^(ไทย|th|thai)$/i.test(t)) return 'th'
  if (/^(จีน|cn|chinese)$/i.test(t)) return 'cn'
  return fallback
}

export type FileKind = 'menu' | 'sets' | 'unknown'
export function detectKind(rows: string[][]): FileKind {
  const head = rows[0] ?? []
  if (col(head, 'รายการอาหาร') >= 0 && col(head, 'ชุด', 'เซ็ต') >= 0) return 'sets'
  if (col(head, 'รายการ') >= 0 && col(head, 'ราคา') >= 0) return 'menu'
  return 'unknown'
}

// ---------------- rows ----------------

export interface MenuRow {
  line: number
  name: string
  variants: string[]
  cuisine: Cuisine
  category: string
  priceType: PriceType
  price: number
  options?: { label: string; price: number }[]
  unit: string
  tags: string[]
}

export interface SetRow {
  line: number
  name: string
  cuisine: Cuisine
  price: number
  seats: string
  drinks: string
  items: string[]
  note: string
}

const PROTEIN = 'หมู|ไก่|กุ้ง|ปลา|ทะเล|เนื้อ|ปู'
/** legacy files write variants into the name: "ข้าวผัดหมู / ไก่" → ข้าวผัด + [หมู, ไก่] */
export function splitVariants(name: string): { name: string; variants: string[] } {
  const m = name.match(new RegExp(`^(.+?)(${PROTEIN})\\s*/\\s*(.+)$`))
  if (!m) return { name, variants: [] }
  const rest = m[3].split('/').map((x) => x.trim())
  if (!rest.every((x) => new RegExp(`^(${PROTEIN})$`).test(x))) return { name, variants: [] }
  return { name: m[1].trim(), variants: [m[2], ...rest] }
}

function parsePrice(raw: string): Pick<MenuRow, 'priceType' | 'price' | 'options'> | null {
  const t = raw.replace(/,/g, '').trim()
  if (/^\d+(\.\d+)?$/.test(t)) return { priceType: 'fixed', price: Number(t) }
  const w = t.match(/^ขีดละ\s*(\d+(\.\d+)?)$/)
  if (w) return { priceType: 'perWeight', price: Number(w[1]) }
  const parts = t.split('/').map((x) => x.trim())
  if (parts.length > 1 && parts.every((x) => /^\d+(\.\d+)?$/.test(x))) {
    const labels = parts.length === 2 ? ['ขนาดเล็ก', 'ขนาดใหญ่'] : parts.map((_, i) => `ขนาด ${i + 1}`)
    const options = parts.map((x, i) => ({ label: labels[i], price: Number(x) }))
    return { priceType: 'byOption', price: options[0].price, options }
  }
  return null
}

/** menu file: new format รายการ,สไตล์,หมวด,ราคา,หน่วย,ตัวเลือก,แท็ก — or the hotel's original รายการ,ประเภท,ราคา */
export function parseMenuRows(rows: string[][], defaultCuisine: Cuisine = 'cn') {
  const [head, ...body] = rows
  const iName = col(head, 'รายการ'), iStyle = col(head, 'สไตล์', 'style')
  const iCat = col(head, 'หมวด', 'ประเภท'), iPrice = col(head, 'ราคา')
  const iUnit = col(head, 'หน่วย'), iVar = col(head, 'ตัวเลือก'), iTags = col(head, 'แท็ก')
  if (iName < 0 || iPrice < 0) throw new Error('ไฟล์เมนูต้องมีคอลัมน์ “รายการ” และ “ราคา”')
  const out: MenuRow[] = []
  const skipped: string[] = []
  body.forEach((r, i) => {
    const raw = (r[iName] ?? '').trim()
    if (!raw) return
    const price = parsePrice(r[iPrice] ?? '')
    if (!price) { skipped.push(`${raw} (ราคา “${(r[iPrice] ?? '').trim()}”)`); return }
    const explicit = iVar >= 0 ? (r[iVar] ?? '').split('/').map((x) => x.trim()).filter(Boolean) : []
    const nv = explicit.length ? { name: raw, variants: explicit } : splitVariants(raw)
    out.push({
      line: i + 2, ...nv, ...price,
      cuisine: parseCuisine(iStyle >= 0 ? r[iStyle] : '', defaultCuisine),
      category: (iCat >= 0 ? r[iCat] : '').trim(),
      unit: (iUnit >= 0 ? r[iUnit] : '').trim(),
      tags: iTags >= 0 ? (r[iTags] ?? '').split(/[,;|]/).map((x) => x.trim()).filter(Boolean) : [],
    })
  })
  return { rows: out, skipped }
}

/** set file: ชุด,สไตล์,ราคาต่อโต๊ะ,ที่นั่ง,เครื่องดื่ม,รายการอาหาร (คั่นด้วย |),หมายเหตุ */
export function parseSetRows(rows: string[][], defaultCuisine: Cuisine = 'cn') {
  const [head, ...body] = rows
  const iName = col(head, 'ชุด', 'เซ็ต'), iStyle = col(head, 'สไตล์'), iPrice = col(head, 'ราคา')
  const iSeats = col(head, 'ที่นั่ง'), iDrinks = col(head, 'เครื่องดื่ม'), iItems = col(head, 'รายการอาหาร'), iNote = col(head, 'หมายเหตุ')
  const out: SetRow[] = []
  const skipped: string[] = []
  body.forEach((r, i) => {
    const name = (r[iName] ?? '').trim()
    if (!name) return
    const price = Number((r[iPrice] ?? '').replace(/[,\s]/g, ''))
    const items = (r[iItems] ?? '').split(/[|\n]/).map((x) => x.trim()).filter(Boolean)
    if (!Number.isFinite(price) || price <= 0) { skipped.push(`${name} (ราคา “${r[iPrice] ?? ''}”)`); return }
    if (!items.length) { skipped.push(`${name} (ไม่มีรายการอาหาร)`); return }
    out.push({
      line: i + 2, name, price, items,
      cuisine: parseCuisine(iStyle >= 0 ? r[iStyle] : '', defaultCuisine),
      seats: iSeats >= 0 ? (r[iSeats] ?? '').trim() : '',
      drinks: iDrinks >= 0 ? (r[iDrinks] ?? '').trim() : '',
      note: iNote >= 0 ? (r[iNote] ?? '').trim() : '',
    })
  })
  return { rows: out, skipped }
}

// ---------------- plan ----------------

/** original hotel file used these type names for the Chinese menu */
const LEGACY_CN: Record<string, string> = {
  'ออเดิร์ฟ': 'appetizer', 'ปลา': 'fish', 'ผัก': 'veg', 'ยำ': 'yum', 'ซุป': 'soup', 'กุ้ง': 'shrimp', 'ปู': 'crab',
  'ของหวาน': 'dessert', 'เครื่องดื่ม': 'drink', 'ข้าวราด': 'rice', 'อาหารเจ': 'veg', 'เมนูแนะนำ': 'main',
}
/** default dish type for well-known category names */
const KNOWN_COURSE: Record<string, CourseId> = {
  'น้ำพริก-ผัก': 'chili', 'ของทอด': 'main', 'ผัด-คั่ว': 'veg', 'ตำ-ยำ': 'yum', 'ต้ม-แกง': 'soup',
  'จานเดียว': 'rice', 'ของหวาน': 'dessert', 'เครื่องดื่ม': 'drink', 'ข้าว': 'rice', 'เส้น': 'noodle',
}
const courseForCategoryName = (n: string): CourseId => KNOWN_COURSE[norm(n)] ?? guessCourse(n)

/** dish type of an item: category default, refined by the dish name where it is clearly more specific */
export function courseForItem(name: string, catDefault: CourseId): CourseId {
  const g = guessCourse(name)
  if (catDefault === 'main') return g
  if (catDefault === 'rice' && g === 'noodle') return 'noodle'
  return catDefault
}

const itemKey = (name: string, variants: string[], cuisine: Cuisine) => `${cuisine}|${norm(name)}|${variants.map(norm).join('/')}`

export interface PlannedItem { item: MenuItem; before?: MenuItem; changes: string[] }
export interface PlannedSet { set: MenuSet; before?: MenuSet; changes: string[] }
export interface ImportPlan {
  categories: Category[]
  newItems: PlannedItem[]
  updatedItems: PlannedItem[]
  newSets: PlannedSet[]
  updatedSets: PlannedSet[]
  unchanged: number
  skipped: string[]
  /** add the Thai meal checklist to settings (first Thai import) */
  addThaiTemplate: MealTemplate | null
}

export const planSize = (p: ImportPlan) => p.categories.length + p.newItems.length + p.updatedItems.length + p.newSets.length + p.updatedSets.length

export function planImport(
  catalog: Pick<Catalog, 'categories' | 'menuItems' | 'menuSets' | 'settings'>,
  input: { menu?: MenuRow[]; sets?: SetRow[]; skipped?: string[] },
  makeId: (kind: 'categories' | 'menuItems' | 'menuSets') => string,
): ImportPlan {
  const plan: ImportPlan = { categories: [], newItems: [], updatedItems: [], newSets: [], updatedSets: [], unchanged: 0, skipped: [...(input.skipped ?? [])], addThaiTemplate: null }
  const cats = [...catalog.categories]
  let catSort = Math.max(0, ...cats.map((c) => c.sort ?? 0))

  const findCat = (name: string, cuisine: Cuisine): Category => {
    const n = norm(name)
    let c = cats.find((x) => catCuisine(x) === cuisine && norm(x.name) === n)
    if (!c && cuisine === 'cn' && LEGACY_CN[name]) c = cats.find((x) => x.id === LEGACY_CN[name])
    if (!c) {
      const label = name || `อื่นๆ (${CUISINE_LABEL[cuisine]})`
      c = { id: makeId('categories'), name: label, cuisine, course: courseForCategoryName(label), sort: ++catSort, active: true }
      cats.push(c)
      plan.categories.push(c)
    }
    return c
  }

  // ---- menu items
  const itemsByKey = new Map<string, MenuItem>()
  for (const m of catalog.menuItems) {
    const cu = catCuisine(catalog.categories.find((c) => c.id === m.categoryId))
    itemsByKey.set(itemKey(m.name, m.variants, cu), m)
    // legacy files: whole name incl. variants, e.g. "ต้มยำกุ้งน้ำข้น/น้ำใส"
    if (m.variants.length) itemsByKey.set(itemKey(m.name + m.variants.join('/'), [], cu), m)
  }
  const seen = new Set<string>()
  let sort = Math.max(0, ...catalog.menuItems.map((m) => m.sort ?? 0))
  for (const r of input.menu ?? []) {
    const key = itemKey(r.name, r.variants, r.cuisine)
    if (seen.has(key)) continue
    seen.add(key)
    const hit = itemsByKey.get(key)
    if (hit) {
      const changes: string[] = []
      const next: MenuItem = { ...hit }
      if (hit.price !== r.price || hit.priceType !== r.priceType) { changes.push(`ราคา ${hit.price} → ${r.price}`); next.price = r.price; next.priceType = r.priceType }
      if (r.options && JSON.stringify(hit.options ?? []) !== JSON.stringify(r.options)) { changes.push('ตัวเลือกราคา'); next.options = r.options }
      if (r.unit && hit.unit !== r.unit) { changes.push(`หน่วย ${hit.unit} → ${r.unit}`); next.unit = r.unit }
      if (r.category) {
        const c = findCat(r.category, r.cuisine)
        if (c.id !== hit.categoryId) { changes.push(`ย้ายไปหมวด ${c.name}`); next.categoryId = c.id }
      }
      if (changes.length) plan.updatedItems.push({ item: next, before: hit, changes })
      else plan.unchanged++
      continue
    }
    const c = findCat(r.category, r.cuisine)
    const item: MenuItem = {
      id: makeId('menuItems'), name: r.name, categoryId: c.id, course: courseForItem(r.name + (r.variants[0] ?? ''), catCourse(c)),
      tags: r.tags, variants: r.variants, priceType: r.priceType, price: r.price, unit: r.unit || (r.priceType === 'perWeight' ? 'ขีด' : 'จาน'),
      setOnly: false, active: true, sort: ++sort,
      ...(r.options ? { options: r.options } : {}),
    }
    plan.newItems.push({ item, changes: [] })
  }

  // ---- set menus
  const allItems = [...catalog.menuItems, ...plan.newItems.map((x) => x.item)]
  const allCats = cats
  const linkItem = (name: string, cuisine: Cuisine): SetItem => {
    const n = norm(name)
    const m = allItems.find((x) => catCuisine(allCats.find((c) => c.id === x.categoryId)) === cuisine
      && (norm(x.name) === n || x.variants.some((v) => norm(x.name + v) === n)))
    const variant = m?.variants.find((v) => norm(m.name + v) === n)
    return { course: m ? m.course : guessCourse(name), name, ...(m ? { menuItemId: m.id } : {}), ...(variant ? { variant } : {}) }
  }
  let setSort = Math.max(0, ...catalog.menuSets.map((s) => s.sort ?? 0))
  for (const r of input.sets ?? []) {
    const includes: DrinkKey[] = []
    if (/น้ำเปล่า|น้ำดื่ม/.test(r.drinks)) includes.push('water')
    if (/เก๊กฮวย|เก็กฮวย/.test(r.drinks)) includes.push('chrysanthemum')
    const items = r.items.map((n) => linkItem(n, r.cuisine))
    const hit = catalog.menuSets.find((s) => setCuisine(s) === r.cuisine && norm(s.name) === norm(r.name))
    if (hit) {
      const changes: string[] = []
      const next: MenuSet = { ...hit }
      if (hit.pricePerTable !== r.price) { changes.push(`ราคา ${hit.pricePerTable} → ${r.price}`); next.pricePerTable = r.price }
      if (hit.items.map((i) => norm(i.name)).join('|') !== items.map((i) => norm(i.name)).join('|')) { changes.push('รายการอาหาร'); next.items = items }
      if (r.drinks && hit.drinksText !== r.drinks) { changes.push('เครื่องดื่ม'); next.drinksText = r.drinks; next.includes = includes }
      if (hit.seats !== r.seats) { changes.push('ที่นั่ง'); next.seats = r.seats }
      if (r.note && hit.note !== r.note) { changes.push('หมายเหตุ'); next.note = r.note }
      if (changes.length) plan.updatedSets.push({ set: next, before: hit, changes })
      else plan.unchanged++
      continue
    }
    plan.newSets.push({
      changes: [],
      set: {
        id: makeId('menuSets'), name: r.name, cuisine: r.cuisine, pricePerTable: r.price, servingSize: 'large', seats: r.seats,
        items, drinksText: r.drinks, includes, addOnOffers: [], visibility: 'all', note: r.note, active: true, sort: ++setSort,
      },
    })
  }

  const hasThai = plan.newItems.some((x) => catCuisine(cats.find((c) => c.id === x.item.categoryId)) === 'th')
    || plan.newSets.some((x) => x.set.cuisine === 'th')
  if (hasThai && !catalog.settings.mealTemplates.some((t) => t.id === 'thai')) plan.addThaiTemplate = THAI_TEMPLATE
  return plan
}

// ---------------- export ----------------

function priceText(m: MenuItem) {
  if (m.priceType === 'perWeight') return `ขีดละ ${m.price}`
  if (m.priceType === 'byOption' && m.options?.length) return m.options.map((o) => o.price).join(' / ')
  return String(m.price)
}

export function exportMenuCsv(catalog: Pick<Catalog, 'categories' | 'menuItems'>): string {
  const cat = (id: string) => catalog.categories.find((c) => c.id === id)
  const rows: (string | number)[][] = [['รายการ', 'สไตล์', 'หมวด', 'ราคา (บาท)', 'หน่วย', 'ตัวเลือก', 'แท็ก']]
  for (const m of catalog.menuItems.filter((x) => !x.setOnly)) {
    const c = cat(m.categoryId)
    rows.push([m.name, CUISINE_LABEL[catCuisine(c)], c?.name ?? '', priceText(m), m.unit, m.variants.join(' / '), m.tags.join(', ')])
  }
  return toCsv(rows)
}

export function exportSetsCsv(catalog: Pick<Catalog, 'menuSets'>): string {
  const rows: (string | number)[][] = [['ชุด', 'สไตล์', 'ราคาต่อโต๊ะ (บาท)', 'ที่นั่ง', 'เครื่องดื่ม', 'รายการอาหาร', 'หมายเหตุ']]
  for (const s of catalog.menuSets) rows.push([s.name, CUISINE_LABEL[setCuisine(s)], s.pricePerTable, s.seats, s.drinksText, s.items.map((i) => i.name).join(' | '), s.note])
  return toCsv(rows)
}
