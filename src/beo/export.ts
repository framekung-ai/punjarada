import { toJpeg } from 'html-to-image'
import type { Beo } from '../lib/types'

export function exportFileName(beo: Beo, ext: 'pdf' | 'jpg'): string {
  const d = beo.event.date ? beo.event.date.split('-') : []
  const be = d.length === 3 ? `${d[2]}-${d[1]}-${Number(d[0]) + 543}` : ''
  const name = (beo.event.name || beo.customer.name || 'BEO').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40)
  return `${beo.docNo ?? 'BEO-แบบร่าง'}_${name}${be ? `_${be}` : ''}.${ext}`
}

/**
 * Sharpness: the document is 794 px wide (= A4 at 96 dpi).
 * - PDF for printing: ×3.15 ≈ 300 dpi
 * - JPG for LINE / screens: ×2.5 (was ×2)
 * iPhone / iPad Safari refuse canvases over ~16.7 million pixels, so very long documents are scaled
 * down just enough to stay under that limit instead of failing.
 */
const MAX_CANVAS_PIXELS = 16_000_000
function pixelRatioFor(node: HTMLElement, wanted: number): number {
  const area = Math.max(1, node.offsetWidth * node.offsetHeight)
  return Math.max(1, Math.min(wanted, Math.sqrt(MAX_CANVAS_PIXELS / area)))
}

async function render(node: HTMLElement, quality: 'print' | 'screen'): Promise<string> {
  await document.fonts?.ready
  const pixelRatio = pixelRatioFor(node, quality === 'print' ? 3.15 : 2.5)
  return toJpeg(node, { quality: quality === 'print' ? 0.95 : 0.93, pixelRatio, backgroundColor: '#ffffff', cacheBust: true })
}

function download(url: string, name: string) {
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export async function exportJpg(node: HTMLElement, beo: Beo) {
  download(await render(node, 'screen'), exportFileName(beo, 'jpg'))
}

// ---------------- PDF (A4, page breaks between blocks) ----------------

const A4_W_MM = 210
const A4_H_MM = 297

/** blocks that must not be cut in half (CSS px, relative to the document top) */
interface Block { top: number; bottom: number; keepWithNext?: boolean; keepWithPrev?: boolean }

/** on-screen scale of the node (the preview is shown shrunk with a CSS transform) */
const scaleOf = (node: HTMLElement) => (node.getBoundingClientRect().width / node.offsetWidth) || 1

function measureBlocks(node: HTMLElement): Block[] {
  const origin = node.getBoundingClientRect().top
  const sc = scaleOf(node)
  const sel = '.bd-head, .bd-title, .bd-info, .bd-venue, .bd-table thead tr, .bd-table tbody tr, .bd-sum, .bd-sign'
  return [...node.querySelectorAll<HTMLElement>(sel)].map((el) => {
    const r = el.getBoundingClientRect()
    return {
      top: (r.top - origin) / sc,
      bottom: (r.bottom - origin) / sc,
      keepWithNext: el.classList.contains('bd-group') || el.parentElement?.tagName === 'THEAD', // section heading stays with its first row
      keepWithPrev: el.classList.contains('bd-sign'), // signatures stay with the totals
    }
  }).sort((a, b) => a.top - b.top)
}

/**
 * Where each A4 page starts and ends (CSS px). A page ends just before the first block that would
 * not fit, so table rows, the totals box and the signatures are never split across pages.
 */
export function pageBreaks(
  totalH: number, blocks: Block[], pageH: number, topMargin: number, bottomMargin: number,
  /** table header repeated on pages that continue the table */
  header?: { height: number; tableTop: number; tableBottom: number },
): [number, number][] {
  const pages: [number, number][] = []
  let start = 0
  while (start < totalH - 1) {
    const repeat = header && pages.length > 0 && start > header.tableTop && start < header.tableBottom ? header.height : 0
    const room = pageH - (pages.length ? topMargin : 0) - bottomMargin - repeat
    let end = start + room
    if (end >= totalH) { pages.push([start, totalH]); break }
    // first block that crosses the page end
    let i = blocks.findIndex((b) => b.bottom > end && b.top < end && b.top > start)
    if (i >= 0) {
      // keep headings with the next row, signatures with the totals
      while (i > 0 && (blocks[i - 1].keepWithNext || blocks[i].keepWithPrev) && blocks[i - 1].top > start + 1) i--
      end = blocks[i].top
    }
    if (end <= start + 40) end = start + room // a single block taller than a page: cut it (cannot be helped)
    pages.push([start, end])
    start = end
  }
  return pages
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = fail; i.src = src })
}

export interface PagePlan {
  /** [from, to] in CSS px of the document, one entry per A4 page */
  breaks: [number, number][]
  /** content fits one page (possibly shrunk a little: `shrink` < 1) */
  onePage: boolean
  shrink: number
  pageCssH: number
  header?: { top: number; height: number; tableTop: number; tableBottom: number }
}

/**
 * How the document will be laid out on A4. Shared by the PDF export and the font-size preview.
 * - up to 15% longer than A4 → shrink a little onto one page instead of a near-empty page 2
 * - BUT if Admin enlarged the fonts, never shrink (the text must stay at the chosen size):
 *   the document is split between blocks instead — the totals, notes and signatures move together
 */
export function planPages(node: HTMLElement): PagePlan {
  const sc = scaleOf(node)
  const blocks = measureBlocks(node)
  const cssW = node.offsetWidth
  const cssH = node.offsetHeight
  const pageCssH = cssW * (A4_H_MM / A4_W_MM) // 794 px wide → 1123 px tall
  // the document has min-height = one A4 page; paginate on where the content really ends
  const contentH = Math.min(cssH, Math.max(0, ...blocks.map((x) => x.bottom)) + 36)
  const origin = node.getBoundingClientRect().top
  const thead = node.querySelector('.bd-table thead')?.getBoundingClientRect()
  const tbody = node.querySelector('.bd-table tbody')?.getBoundingClientRect()
  const header = thead && tbody ? { top: (thead.top - origin) / sc, height: thead.height / sc, tableTop: (thead.bottom - origin) / sc, tableBottom: (tbody.bottom - origin) / sc } : undefined
  const fitOnePage = node.dataset.enlarged === '1' ? 1 : 1.15
  const onePage = contentH <= pageCssH * fitOnePage
  const breaks: [number, number][] = onePage ? [[0, Math.max(contentH, Math.min(cssH, pageCssH))]] : pageBreaks(contentH, blocks, pageCssH, 40, 30, header)
  const shrink = onePage ? Math.min(1, pageCssH / breaks[0][1]) : 1
  return { breaks, onePage, shrink, pageCssH, header }
}

/** Renders the document once at print resolution, then lays it out on A4 pages without cutting rows. */
export async function makePdf(node: HTMLElement, label = ''): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const cssW = node.offsetWidth
  const { breaks, onePage, pageCssH, header } = planPages(node)
  const img = await loadImage(await render(node, 'print'))
  const k = img.width / cssW // image pixels per CSS px

  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const canvas = document.createElement('canvas')
  canvas.width = img.width
  canvas.height = Math.round(pageCssH * k)
  const ctx = canvas.getContext('2d')!
  if (onePage) {
    const [, to] = breaks[0]
    const scale = Math.min(1, pageCssH / to)
    const w = img.width * scale
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, img.width, Math.round(to * k), Math.round((img.width - w) / 2), 0, Math.round(w), Math.round(to * k * scale))
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_W_MM, A4_H_MM, 'p0', 'NONE')
    return pdf.output('blob')
  }
  breaks.forEach(([from, to], n) => {
    let top = n === 0 ? 0 : 40
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    // page continues the item table → repeat its blue header row first
    if (n > 0 && header && from > header.tableTop && from < header.tableBottom) {
      ctx.drawImage(img, 0, Math.round(header.top * k), img.width, Math.round(header.height * k), 0, Math.round(top * k), img.width, Math.round(header.height * k))
      top += header.height
    }
    ctx.drawImage(img, 0, Math.round(from * k), img.width, Math.round((to - from) * k), 0, Math.round(top * k), img.width, Math.round((to - from) * k))
    if (n > 0) pdf.addPage('a4', 'portrait')
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, A4_W_MM, A4_H_MM, `p${n}`, 'NONE')
    if (breaks.length > 1) {
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(`${label ? `${label}  ·  ` : ''}${n + 1} / ${breaks.length}`, A4_W_MM - 10, A4_H_MM - 6, { align: 'right' })
    }
  })
  return pdf.output('blob')
}

export async function exportPdf(node: HTMLElement, beo: Beo) {
  const blob = await makePdf(node, beo.docNo ?? '')
  const url = URL.createObjectURL(blob)
  download(url, exportFileName(beo, 'pdf'))
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Mobile: share the PDF straight into LINE etc. Falls back to download. */
export async function sharePdf(node: HTMLElement, beo: Beo): Promise<boolean> {
  const blob = await makePdf(node, beo.docNo ?? '')
  const file = new File([blob], exportFileName(beo, 'pdf'), { type: 'application/pdf' })
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [file] })) {
    await nav.share({ files: [file], title: beo.docNo ?? 'BEO' })
    return true
  }
  const url = URL.createObjectURL(blob)
  download(url, file.name)
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return false
}
