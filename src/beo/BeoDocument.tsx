import { forwardRef } from 'react'
import type { Beo, BeoLine, Settings } from '../lib/types'
import { lineAmount } from '../lib/pricing'
import { lineName } from '../lib/cuisine'
import { bahtText, money, num, phoneFormat, thaiDate, timeRange, todayIso } from '../lib/thai'
import './beo-document.css'

function tsToIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null
  if (t && typeof t.toDate === 'function') {
    const d = t.toDate()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  return null
}

function Row({ label, value }: { label: string; value?: string }) {
  return <div className="bd-row"><span className="bd-l">{label}</span><span className="bd-v">{value || '-'}</span></div>
}

/** A4 (794 px wide) Banquet Event Order. Used for preview, JPG and PDF export. */
export const BeoDocument = forwardRef<HTMLDivElement, { beo: Beo; settings: Settings }>(function BeoDocument({ beo, settings }, ref) {
  const food = beo.lines.filter((l) => l.kind === 'set' || l.kind === 'item' || l.kind === 'addon')
  const services = beo.lines.filter((l) => l.kind === 'service')
  const sum = (ls: BeoLine[]) => ls.reduce((t, l) => t + lineAmount(l), 0)
  const foodTotal = sum(food)
  const serviceTotal = sum(services)
  const perTable = beo.seating.tables > 0 ? foodTotal / beo.seating.tables : 0
  // section subtotals are shown when the BEO has both food and services (and per-table price whenever there are tables)
  const showFoodTotal = food.length > 0 && (services.length > 0 || perTable > 0)
  const showServiceTotal = services.length > 0 && food.length > 0
  const foc = beo.lines.filter((l) => l.kind === 'foc' && !l.declined)
  const issued = tsToIso(beo.confirmedAt) ?? tsToIso(beo.updatedAt) ?? todayIso()
  const s = beo.seating
  const seatText = [
    s.tables > 0 ? `${s.tables} โต๊ะ${s.seatsPerTable ? ` (โต๊ะละ ${s.seatsPerTable} ท่าน)` : ''}` : '',
    s.spareTables > 0 ? `สำรอง ${s.spareTables} โต๊ะ` : '',
  ].filter(Boolean).join(' · ')
  // ชื่อผู้อนุมัติ appears once Admin has confirmed the BEO (blank while draft / waiting for approval)
  const approver = beo.status === 'confirmed' || beo.status === 'completed' || beo.status === 'cancelled' ? (beo.approvedByName ?? '') : ''
  const numbering = new Map([...food, ...services, ...foc].map((l, i) => [l.key, i + 1]))

  const lineRow = (l: BeoLine, amount = true) => {
    const no = numbering.get(l.key)
    return (
      <tr key={l.key}>
        <td className="c">{no}</td>
        <td>
          <div className="bd-item">{lineName(l, beo.lines)}{l.kind === 'addon' && <span className="bd-tag">สิทธิแลกซื้อ</span>}</div>
          {l.detail && <div className="bd-sub">{l.detail}</div>}
          {l.setItems && l.setItems.length > 0 && (
            <ol className="bd-setlist">{l.setItems.map((n, i) => <li key={i}>{n}</li>)}</ol>
          )}
        </td>
        <td className="n">{num(l.qty)}</td>
        <td className="c">{l.unit}</td>
        <td className="n">{amount ? money(l.unitPrice) : '-'}</td>
        <td className="n">{amount ? (lineAmount(l) === 0 && l.kind === 'service' ? 'ฟรี' : money(lineAmount(l))) : 'ฟรี'}</td>
      </tr>
    )
  }

  return (
    <div className="beo-doc" ref={ref}>
      {beo.status === 'draft' && <div className="bd-watermark">แบบร่าง</div>}
      {beo.status === 'cancelled' && <div className="bd-watermark red">ยกเลิก</div>}
      {beo.status === 'pending' && <div className="bd-watermark gold">รอยืนยัน</div>}
      <header className="bd-head">
        <img src="/logo-256.jpg" alt="" className="bd-logo" />
        <div className="bd-hotel">
          <div className="bd-hotel-name">{settings.hotelName}</div>
          <div className="bd-hotel-en">{settings.hotelNameEn}</div>
          {settings.address && <div className="bd-small">{settings.address}</div>}
          {settings.phone && <div className="bd-small">โทร {settings.phone}</div>}
        </div>
        <div className="bd-docbox">
          <div><span>เลขที่</span><b>{beo.docNo ?? '— แบบร่าง —'}</b></div>
          {beo.revision > 0 && <div><span>แก้ไขครั้งที่</span><b>Rev.{beo.revision}</b></div>}
          <div><span>วันที่ออกเอกสาร</span><b>{thaiDate(issued)}</b></div>
        </div>
      </header>

      <div className="bd-title">Banquet Event Order (BEO) / Function Sheet / รายละเอียดการจัดงาน</div>

      <section className="bd-info">
        <div className="bd-col">
          <div className="bd-colhead">ข้อมูลลูกค้า</div>
          <Row label="ชื่อลูกค้า" value={beo.customer.name} />
          <Row label="หน่วยงาน" value={beo.customer.organization} />
          <Row label="โทรศัพท์" value={beo.customer.phone ? phoneFormat(beo.customer.phone) : ''} />
          <Row label="ที่อยู่" value={beo.customer.address} />
          {(beo.customer.contactName || beo.customer.contactPhone) && (
            <Row label="ผู้ประสานงาน" value={[beo.customer.contactName, beo.customer.contactPhone && phoneFormat(beo.customer.contactPhone)].filter(Boolean).join(' · ')} />
          )}
        </div>
        <div className="bd-col">
          <div className="bd-colhead">ข้อมูลกิจกรรม</div>
          <Row label="ชื่องาน" value={beo.event.name} />
          <Row label="ประเภทงาน" value={beo.eventType} />
          <Row label="วันที่จัดงาน" value={thaiDate(beo.event.date, { weekday: true })} />
          <Row label="เวลา" value={timeRange(beo.event.start, beo.event.end)} />
          <Row label="จำนวนแขก" value={s.guests ? `${num(s.guests)} ท่าน` : ''} />
        </div>
      </section>

      <section className="bd-venue">
        <div><span>ห้อง</span><b>{beo.event.room || '-'}</b></div>
        <div><span>รูปแบบ</span><b>{s.layout || '-'}</b></div>
        <div><span>จำนวนโต๊ะ</span><b>{seatText || '-'}</b></div>
      </section>

      <table className="bd-table">
        <thead>
          <tr><th className="c" style={{ width: 40 }}>ลำดับ</th><th>รายการอาหาร เครื่องดื่ม และการบริการ</th><th className="n" style={{ width: 60 }}>จำนวน</th><th className="c" style={{ width: 56 }}>หน่วย</th><th className="n" style={{ width: 92 }}>ราคา</th><th className="n" style={{ width: 104 }}>รวม</th></tr>
        </thead>
        <tbody>
          {food.length > 0 && (
            <tr className="bd-group">
              <td colSpan={showFoodTotal ? 3 : 6}>อาหารและเครื่องดื่ม</td>
              {showFoodTotal && (
                <td colSpan={3} className="n bd-sectotal">
                  รวม {money(foodTotal)} บาท{perTable > 0 && <span className="bd-pertable"> (โต๊ะละ {money(perTable).replace(/\.00$/, '')} บาท)</span>}
                </td>
              )}
            </tr>
          )}
          {food.map((l) => lineRow(l))}
          {services.length > 0 && (
            <tr className="bd-group">
              <td colSpan={showServiceTotal ? 3 : 6}>บริการ</td>
              {showServiceTotal && <td colSpan={3} className="n bd-sectotal">รวม {money(serviceTotal)} บาท</td>}
            </tr>
          )}
          {services.map((l) => lineRow(l))}
          {foc.length > 0 && <tr className="bd-group gold"><td colSpan={6}>ของแถม (Free of Charge)</td></tr>}
          {foc.map((l) => lineRow(l, false))}
          {food.length + services.length + foc.length === 0 && <tr><td colSpan={6} className="c bd-sub" style={{ padding: 24 }}>ยังไม่มีรายการ</td></tr>}
        </tbody>
      </table>

      <section className="bd-sum">
        <div className="bd-sum-left">
          {beo.terms.length > 0 && (
            <>
              <div className="bd-colhead small">เงื่อนไขและหมายเหตุ</div>
              <ul className="bd-terms">{beo.terms.map((t, i) => <li key={i}>{t}</li>)}</ul>
            </>
          )}
          {beo.note && <div className="bd-note">{beo.note}</div>}
          {beo.totals.focValue > 0 && <div className="bd-small gold-text">มูลค่าของแถมรวม {money(beo.totals.focValue)} บาท</div>}
        </div>
        <div className="bd-sum-right">
          <div><span>รวมเป็นเงิน</span><b>{money(beo.totals.subtotal + beo.totals.discount)}</b></div>
          {beo.totals.discount > 0 && <div><span>ส่วนลด</span><b>-{money(beo.totals.discount)}</b></div>}
          {beo.totals.discount > 0 && <div><span>ยอดหลังหักส่วนลด</span><b>{money(beo.totals.subtotal)}</b></div>}
          {beo.applyVat === false
            ? <div><span>ไม่คิดภาษีมูลค่าเพิ่ม</span><b>-</b></div>
            : <div><span>ภาษีมูลค่าเพิ่ม {Math.round((settings.vatRate ?? 0.07) * 100)}%</span><b>{money(beo.totals.vat)}</b></div>}
          <div className="grand"><span>รวมรายรับทั้งหมด</span><b>{money(beo.totals.grandTotal)}</b></div>
          <div className="bd-baht">({bahtText(beo.totals.grandTotal)})</div>
        </div>
      </section>

      <section className="bd-sign">
        {[['ผู้รับงาน', beo.salesName], ['ผู้อนุมัติ', approver], ['ลูกค้า', beo.customer.name]].map(([role, name]) => (
          <div key={role}>
            <div className="bd-line" />
            <div>({name || '..............................'})</div>
            <div className="bd-small">{role}</div>
            <div className="bd-small">วันที่ ......../......../........</div>
          </div>
        ))}
      </section>
    </div>
  )
})
