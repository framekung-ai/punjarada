import { describe, expect, it } from 'vitest'
import seed from '../seed/seed.json'
import thaiMenuCsv from '../../data/import-menu-thai.csv?raw'
import thaiSetsCsv from '../../data/import-sets-thai.csv?raw'
import type { BeoLine, Catalog } from './types'
import { detectKind, parseCsv, parseMenuRows, parseSetRows, planImport, splitVariants } from './menuCsv'
import { cuisinesIn, guessCourse, lineName, mainCuisine } from './cuisine'

const catalog = { ...(seed as unknown as Omit<Catalog, 'version'>), version: 1 }
let n = 0
const ids = () => `id${++n}`
const thaiMenu = parseCsv(thaiMenuCsv)
const thaiSets = parseCsv(thaiSetsCsv)

describe('Thai import files', () => {
  it('are recognised by their header', () => {
    expect(detectKind(thaiMenu)).toBe('menu')
    expect(detectKind(thaiSets)).toBe('sets')
  })
  it('read every dish and set', () => {
    const m = parseMenuRows(thaiMenu)
    expect(m.skipped).toEqual([])
    expect(m.rows).toHaveLength(88)
    expect(m.rows.every((r) => r.cuisine === 'th')).toBe(true)
    const coke = m.rows.find((r) => r.name === 'น้ำอัดลม')!
    expect(coke.priceType).toBe('byOption')
    expect(coke.options?.map((o) => o.price)).toEqual([20, 50])
    expect(m.rows.find((r) => r.name === 'ทอดมัน')?.variants).toEqual(['หมู', 'ไก่'])
    const s = parseSetRows(thaiSets)
    expect(s.rows).toHaveLength(9)
    expect(s.rows[0].items).toHaveLength(8)
  })

  it('adds Thai dishes next to the Chinese ones without touching them', () => {
    const plan = planImport(catalog, { menu: parseMenuRows(thaiMenu).rows, sets: parseSetRows(thaiSets).rows }, ids)
    expect(plan.updatedItems).toEqual([]) // no Chinese dish changes, even with the same name (ยำวุ้นเส้น)
    expect(plan.updatedSets).toEqual([])
    expect(plan.newItems).toHaveLength(88)
    expect(plan.newSets).toHaveLength(9)
    expect(plan.categories.map((c) => c.name)).toEqual(['น้ำพริก - ผัก', 'ของทอด', 'ผัด - คั่ว', 'ตำ - ยำ', 'ต้ม - แกง', 'จานเดียว', 'ของหวาน', 'เครื่องดื่ม'])
    expect(plan.categories.every((c) => c.cuisine === 'th')).toBe(true)
    expect(plan.addThaiTemplate?.id).toBe('thai')
    const yum = plan.newItems.find((x) => x.item.name === 'ยำวุ้นเส้น')!.item
    expect(yum.price).toBe(350) // Chinese ยำวุ้นเส้น is 380
    expect(yum.course).toBe('yum')
    expect(plan.newItems.find((x) => x.item.name === 'น้ำพริกไข่เค็ม - ผักสด ผักต้ม')!.item.course).toBe('chili')
    expect(plan.newItems.find((x) => x.item.name === 'เส้นหมี่ราดหน้าหมู')!.item.course).toBe('noodle')
    const setA = plan.newSets[0].set
    expect(setA).toMatchObject({ name: 'ชุดอาหารไทย A', cuisine: 'th', pricePerTable: 2500, includes: ['water', 'chrysanthemum'] })
    expect(plan.newSets[6].set.includes).toEqual(['water'])
    // set dishes that exist in the Thai menu are linked to it
    expect(plan.newSets[5].set.items.find((i) => i.name === 'ผัดพริกขิงหมู')?.variant).toBe('หมู')
  })

  it('a second import of the same files changes nothing', () => {
    const plan = planImport(catalog, { menu: parseMenuRows(thaiMenu).rows, sets: parseSetRows(thaiSets).rows }, ids)
    const after = {
      ...catalog,
      categories: [...catalog.categories, ...plan.categories],
      menuItems: [...catalog.menuItems, ...plan.newItems.map((x) => x.item)],
      menuSets: [...catalog.menuSets, ...plan.newSets.map((x) => x.set)],
      settings: { ...catalog.settings, mealTemplates: [...catalog.settings.mealTemplates, plan.addThaiTemplate!] },
    }
    const again = planImport(after, { menu: parseMenuRows(thaiMenu).rows, sets: parseSetRows(thaiSets).rows }, ids)
    expect(again.newItems.length + again.updatedItems.length + again.newSets.length + again.updatedSets.length + again.categories.length).toBe(0)
    expect(again.unchanged).toBe(88 + 9)
    expect(again.addThaiTemplate).toBeNull()
  })

  it("still reads the hotel's original Chinese file (price update only)", () => {
    const rows = parseCsv('รายการ,ประเภท,ราคา (บาท)\nยำวุ้นเส้น,ยำ,390\nข้าวผัดหมู / ไก่,ข้าวราด,380\n')
    const plan = planImport(catalog, { menu: parseMenuRows(rows).rows }, ids)
    expect(plan.updatedItems.map((x) => [x.item.id, x.item.price])).toEqual([['m060', 390]])
    expect(plan.unchanged).toBe(1)
    expect(plan.newItems).toEqual([])
  })
})

describe('mixed Thai + Chinese BEO', () => {
  const l = (name: string, kind: BeoLine['kind'], cuisine?: 'cn' | 'th'): BeoLine => ({ key: name, kind, name, qty: 1, unit: 'จาน', unitPrice: 100, cuisine })
  it('adds (ไทย) / (จีน) only when both styles are chosen', () => {
    const onlyCn = [l('ยำวุ้นเส้น', 'item'), l('ชุดจักรพรรดิ', 'set', 'cn')]
    expect(lineName(onlyCn[0], onlyCn)).toBe('ยำวุ้นเส้น')
    const mixed = [l('ยำวุ้นเส้น', 'item', 'cn'), l('ยำวุ้นเส้น', 'item', 'th'), l('ชุดอาหารไทย A', 'set', 'th'), l('นักดนตรี', 'service')]
    expect(cuisinesIn(mixed).size).toBe(2)
    expect(mixed.map((x) => lineName(x, mixed))).toEqual(['ยำวุ้นเส้น (จีน)', 'ยำวุ้นเส้น (ไทย)', 'ชุดอาหารไทย A', 'นักดนตรี'])
  })
  it('a Thai set makes the BEO a Thai meal', () => {
    expect(mainCuisine([l('ชุดอาหารไทย A', 'set', 'th'), l('ยำวุ้นเส้น', 'item', 'cn')])).toBe('th')
    expect(mainCuisine([l('ยำวุ้นเส้น', 'item')])).toBe('cn')
  })
})

describe('helpers', () => {
  it('splits legacy variant names', () => {
    expect(splitVariants('ข้าวผัดกะเพรากุ้ง / ทะเล')).toEqual({ name: 'ข้าวผัดกะเพรา', variants: ['กุ้ง', 'ทะเล'] })
    expect(splitVariants('ข้าวหมู / ไก่ทอดกระเทียม')).toEqual({ name: 'ข้าวหมู / ไก่ทอดกระเทียม', variants: [] })
  })
  it('guesses the dish type from Thai names', () => {
    expect(['หลนเต้าเจี้ยว - ผักสด', 'แกงส้มปลาทอดผักรวม', 'ปลาทับทิมผัดฉ่า', 'ข้าวหอมมะลิ ขนมจีน', 'ผลไม้รวม', 'ทอดมันปลากราย', 'ถั่วลันเตาผัดเห็ดฟาง', 'น้ำตกหมู'].map(guessCourse))
      .toEqual(['chili', 'soup', 'fish', 'rice', 'dessert', 'main', 'veg', 'yum'])
  })
})
