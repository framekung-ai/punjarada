// Thai / Chinese cooking styles — helpers shared by the Sales form, the document and Admin.
import type { BeoLine, Category, CourseId, Cuisine, MealTemplate, MenuItem, MenuSet } from './types'
import { COURSE_LABEL } from './types'

/** Records saved before styles existed have no field → จีน */
export const catCuisine = (c: Pick<Category, 'cuisine'> | undefined): Cuisine => c?.cuisine ?? 'cn'
export const setCuisine = (s: Pick<MenuSet, 'cuisine'>): Cuisine => s.cuisine ?? 'cn'

export function itemCuisine(m: Pick<MenuItem, 'categoryId'>, categories: Category[]): Cuisine {
  return catCuisine(categories.find((c) => c.id === m.categoryId))
}

/** Default dish type for a category (older Chinese categories use the course id as their id). */
export function catCourse(c: Pick<Category, 'id' | 'course' | 'name'>): CourseId {
  if (c.course) return c.course
  if (c.id in COURSE_LABEL) return c.id as CourseId
  return guessCourse(c.name)
}

const FOOD_KINDS = new Set(['set', 'item', 'addon'])

/** Styles used by the food lines of a BEO (lines without a style count as จีน). */
export function cuisinesIn(lines: BeoLine[]): Set<Cuisine> {
  return new Set(lines.filter((l) => FOOD_KINDS.has(l.kind)).map((l) => l.cuisine ?? 'cn'))
}

/**
 * Name to show on the cart and the BEO document — the plain dish name, also when a BEO mixes
 * Thai and Chinese food (the hotel asked not to add "(ไทย)" / "(จีน)"). The line still keeps
 * its `cuisine`, so the style can be shown again later by changing only this function.
 */
export function lineName(l: BeoLine, _lines?: BeoLine[]): string {
  void _lines
  return l.name
}

/** Main style of a BEO — decides which meal checklist to use. */
export function mainCuisine(lines: BeoLine[]): Cuisine {
  let th = 0, cn = 0
  for (const l of lines) {
    if (!FOOD_KINDS.has(l.kind) || l.course === 'drink') continue
    const w = l.kind === 'set' ? 5 : 1
    if ((l.cuisine ?? 'cn') === 'th') th += w; else cn += w
  }
  return th > cn ? 'th' : 'cn'
}

/** Thai meal checklist, used when Admin has not saved one in settings. Built from the hotel's Thai sets. */
export const THAI_TEMPLATE: MealTemplate = {
  id: 'thai',
  name: 'อาหารไทย',
  slots: [
    { label: 'น้ำพริก / หลน', courses: ['chili'] },
    { label: 'ทอด / จานหลัก', courses: ['main', 'fish', 'shrimp', 'crab', 'appetizer'] },
    { label: 'ผัด', courses: ['veg'] },
    { label: 'ต้ม / แกง', courses: ['soup'] },
    { label: 'ข้าว / ขนมจีน', courses: ['rice', 'noodle'] },
    { label: 'ของหวาน / ผลไม้', courses: ['dessert'] },
  ],
}

/** Best guess of the dish type from its Thai name (used by CSV import; Admin can change it). */
export function guessCourse(name: string): CourseId {
  const n = name.replace(/\s+/g, '')
  if (/น้ำพริก|^หลน/.test(n)) return 'chili'
  if (/เครื่องดื่ม|^น้ำ(เปล่า|ดื่ม|แข็ง|อัดลม)|^เบียร์|^โซดา|^โค้ก|^สปาย|^ชา|^เก็กฮวย|^เก๊กฮวย/.test(n)) return 'drink'
  if (/ผลไม้|ของหวาน|ทับทิมกรอบ|สาคู|เฉาก๊วย|เต้าฮวย|บัวลอย|แป๊ะก๊วย|เผือกทอง/.test(n)) return 'dessert'
  if (/^ข้าว|ขนมจีน/.test(n)) return 'rice'
  if (/^(เส้น|หมี่|บะหมี่|คั่วหมี่|โกยซี)/.test(n)) return 'noodle'
  if (/^(ต้ม|แกง|ซุป)|แพนง|พะแนง|มัสมั่น|ตุ๋น|โป๊ะแตก|ต้มยำ|ต้มข่า/.test(n)) return 'soup'
  if (/^(ยำ|ส้มตำ|ตำ|พล่า|ลาบ|น้ำตก)|หมูมะนาว|แช่น้ำปลา/.test(n)) return 'yum'
  if (/^(ปลา|เนื้อปลา)/.test(n)) return 'fish'
  if (/^(กุ้ง|ลูกชิ้นกุ้ง)/.test(n)) return 'shrimp'
  if (/^ปู/.test(n)) return 'crab'
  if (/ผัด/.test(n)) return 'veg'
  return 'main'
}
