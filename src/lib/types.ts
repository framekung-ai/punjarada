// ---------- Catalog (managed by Admin) ----------

export type CourseId =
  | 'appetizer' | 'yum' | 'main' | 'fish' | 'shrimp' | 'crab'
  | 'veg' | 'soup' | 'noodle' | 'rice' | 'dessert' | 'drink' | 'chili'

export const COURSE_LABEL: Record<CourseId, string> = {
  appetizer: 'ทานเล่น / ออเดิร์ฟ',
  yum: 'ยำ / สลัด',
  main: 'ทอด / จานหลัก',
  fish: 'ปลา / นึ่ง',
  shrimp: 'กุ้ง',
  crab: 'ปู',
  veg: 'ผัด / ผัก',
  soup: 'ต้ม / ซุป',
  noodle: 'เส้น',
  rice: 'ข้าว',
  dessert: 'ของหวาน / ผลไม้',
  drink: 'เครื่องดื่ม',
  chili: 'น้ำพริก / หลน',
}

/**
 * Cooking style. The same dish name can exist in both styles with a different recipe and price
 * (e.g. ยำวุ้นเส้น จีน / ไทย). Stored on Category and MenuSet; a menu item takes the style of
 * its category. Records saved before this field existed have none and count as 'cn' (จีน).
 */
export type Cuisine = 'cn' | 'th'
export const CUISINES: Cuisine[] = ['cn', 'th']
export const CUISINE_LABEL: Record<Cuisine, string> = { cn: 'จีน', th: 'ไทย' }

export interface Category {
  id: string
  name: string
  sort: number
  active: boolean
  /** สไตล์อาหารของหมวด (ไม่มี = จีน) — เมนูในหมวดนี้เป็นสไตล์นี้ทั้งหมด */
  cuisine?: Cuisine
  /** ประเภทจานเริ่มต้นของเมนูที่เพิ่มในหมวดนี้ (ใช้เช็กความครบของมื้อ) */
  course?: CourseId
}

export type PriceType = 'fixed' | 'perWeight' | 'byOption'

export interface MenuItem {
  id: string
  name: string
  categoryId: string
  course: CourseId
  tags: string[]
  variants: string[]
  priceType: PriceType
  price: number
  unit: string
  options?: { label: string; price: number }[]
  protein?: string
  setOnly: boolean
  active: boolean
  sort: number
  needsReview?: string
}

export interface SetItem {
  course: CourseId
  menuItemId?: string
  name: string
  variant?: string
}

export interface AddOnOffer {
  menuItemId: string
  name: string
  specialPrice: number
  maxQty: number
}

export type DrinkKey = 'water' | 'chrysanthemum'

export interface MenuSet {
  id: string
  name: string
  pricePerTable: number
  servingSize: 'large' | 'medium'
  seats: string
  items: SetItem[]
  drinksText: string
  includes: DrinkKey[]
  addOnOffers: AddOnOffer[]
  visibility: 'all' | 'regularOnly' | 'hidden'
  note: string
  active: boolean
  sort: number
  /** สไตล์ของเซ็ต (ไม่มี = จีน) */
  cuisine?: Cuisine
}

export interface Service {
  id: string
  name: string
  type: 'music' | 'room' | 'overtime' | 'decor' | 'equipment' | 'other'
  price: number
  unit: string
  priceEditable: boolean
  active: boolean
  sort: number
}

export interface FocCondition {
  field: 'pricePerTable' | 'tables'
  op: '>=' | '>' | '<=' | '<'
  value: number
}

export interface FocFreeItem {
  key: string
  label: string
  qtyPer: 'table' | 'event'
  qty: number
  unit: string
  unitValue: number
}

export type FocEffect =
  | { kind: 'free'; items: FocFreeItem[] }
  | { kind: 'setPrice'; serviceId: string; price: number }

export interface FocRule {
  id: string
  group: string
  order: number
  name: string
  conditions: FocCondition[]
  effect: FocEffect
  active: boolean
}

export interface MealSlot {
  label: string
  courses: CourseId[]
}

export interface MealTemplate {
  id: string
  name: string
  slots: MealSlot[]
}

export interface Settings {
  hotelName: string
  hotelNameEn: string
  address: string
  phone: string
  vatRate: number
  /** active === false = ปิดใช้งาน (ไม่แสดงตอนสร้าง BEO) */
  rooms: { name: string; floor: string; active?: boolean }[]
  eventTypes: string[]
  tableLayouts: string[]
  remarkPresets: string[]
  eventNamePresets?: string[]
  mealTemplates: MealTemplate[]
}

export interface Catalog {
  version: number
  categories: Category[]
  menuItems: MenuItem[]
  menuSets: MenuSet[]
  services: Service[]
  focRules: FocRule[]
  settings: Settings
}

// ---------- BEO ----------

export type BeoStatus = 'draft' | 'pending' | 'confirmed' | 'completed' | 'cancelled'

export const STATUS_LABEL: Record<BeoStatus, string> = {
  draft: 'แบบร่าง',
  pending: 'รอการยืนยัน',
  confirmed: 'ยืนยันแล้ว',
  completed: 'จัดงานแล้ว',
  cancelled: 'ยกเลิก',
}

export type LineKind = 'set' | 'item' | 'addon' | 'service' | 'foc'

export interface BeoLine {
  key: string
  kind: LineKind
  refId?: string
  name: string
  detail?: string
  qty: number
  unit: string
  unitPrice: number
  course?: CourseId
  setItems?: string[]
  /** สไตล์อาหาร (set / item / addon) — ใช้เติม (ไทย) / (จีน) ท้ายชื่อเมื่อเลือกข้ามสไตล์ */
  cuisine?: Cuisine
  /** FOC only */
  focRuleId?: string
  focKey?: string
  value?: number
  declined?: boolean
  /** service price set by FOC rule (music) */
  autoPriceRuleId?: string
  manualPrice?: boolean
}

export interface BeoTotals {
  subtotal: number
  discount: number
  vat: number
  grandTotal: number
  focValue: number
}

export interface DeleteRequest {
  byUid: string
  byName: string
  at: unknown
  reason?: string
}

export interface Beo {
  id?: string
  docNo: string | null
  status: BeoStatus
  revision: number
  eventType: string
  customer: {
    name: string
    phone: string
    organization: string
    address: string
    contactName: string
    contactPhone: string
  }
  event: {
    name: string
    date: string // YYYY-MM-DD (ค.ศ.)
    start: string // HH:mm
    end: string
    room: string
  }
  seating: {
    guests: number
    layout: string
    tables: number
    seatsPerTable: number
    spareTables: number
  }
  lines: BeoLine[]
  discount: number
  /** false = ไม่คิด VAT (ตัดสินใจในขั้นสุดท้าย). undefined = คิด VAT */
  applyVat?: boolean
  terms: string[]
  note: string
  totals: BeoTotals
  /** ผู้รับงาน (ผู้สร้าง) — ไม่เปลี่ยนเมื่อคนอื่นแก้ไข */
  salesUid: string
  salesName: string
  /** ผู้แก้ไขล่าสุด */
  editedByUid?: string
  editedByName?: string
  /** ผู้อนุมัติ (Admin ที่ยืนยันงาน) — แสดงในช่องลงนาม “ผู้อนุมัติ” ของเอกสาร; ล้างเมื่อ Sales แก้งานจนกลับเป็นรอการยืนยัน */
  approvedByUid?: string | null
  approvedByName?: string | null
  /** Sales ขอให้ Admin ลบ (เอกสารที่ยืนยันแล้ว) */
  deleteRequest?: DeleteRequest | null
  createdAt?: unknown
  updatedAt?: unknown
  confirmedAt?: unknown
}

export interface AppUser {
  uid: string
  email: string
  displayName: string
  role: 'sales' | 'admin'
  active: boolean
}

export interface CustomerRecord {
  id?: string
  updatedAt?: { toDate(): Date }
  name: string
  phone: string
  organization: string
  address: string
  contactName: string
  contactPhone: string
  beoCount: number
}
