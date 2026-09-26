import { toJpeg } from 'html-to-image'
import type { Beo } from '../lib/types'

export function exportFileName(beo: Beo, ext: 'pdf' | 'jpg'): string {
  const d = beo.event.date ? beo.event.date.split('-') : []
  const be = d.length === 3 ? `${d[2]}-${d[1]}-${Number(d[0]) + 543}` : ''
  const name = (beo.event.name || beo.customer.name || 'BEO').replace(/[\\/:*?"<>|]+/g, ' ').trim().slice(0, 40)
  return `${beo.docNo ?? 'BEO-แบบร่าง'}_${name}${be ? `_${be}` : ''}.${ext}`
}

async function render(node: HTMLElement): Promise<string> {
  await document.fonts?.ready
  return toJpeg(node, { quality: 0.92, pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true })
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
  download(await render(node), exportFileName(beo, 'jpg'))
}

/** Renders the document to an image and splits it over A4 pages. Works offline. */
export async function makePdf(node: HTMLElement): Promise<Blob> {
  const { jsPDF } = await import('jspdf')
  const img = await render(node)
  const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait', compress: true })
  const pageW = 210
  const pageH = 297
  const ratio = node.offsetHeight / node.offsetWidth
  const imgH = pageW * ratio
  let y = 0
  let first = true
  while (y < imgH - 1) {
    if (!first) pdf.addPage()
    pdf.addImage(img, 'JPEG', 0, -y, pageW, imgH, undefined, 'FAST')
    y += pageH
    first = false
  }
  return pdf.output('blob')
}

export async function exportPdf(node: HTMLElement, beo: Beo) {
  const blob = await makePdf(node)
  const url = URL.createObjectURL(blob)
  download(url, exportFileName(beo, 'pdf'))
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Mobile: share the PDF straight into LINE etc. Falls back to download. */
export async function sharePdf(node: HTMLElement, beo: Beo): Promise<boolean> {
  const blob = await makePdf(node)
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
