// 列印封箱標籤（A4，每張一頁）。獨立於 printCards.ts（A6 料卡），兩者互不影響。
// 進紙來源由使用者在瀏覽器列印對話框選擇。
// 三種版面：橫式含照片（左圖右文）、直式含照片（上圖下文）、純文字橫式（不載入照片）。

export type BoxLabelLayout = 'landscape-photo' | 'portrait-photo' | 'text-landscape'

export interface BoxLabel {
  equipment_id: string
  name: string
  main_photo: string | null
  location: string
  quantity: string
  received_date: string
  note: string
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Cloudinary 圖片：插入縮放轉換參數取較高解析度（A4 用寬上限 1600、不放大）。僅接受 http(s)。
function toPrintPhotoUrl(url: string | null): string | null {
  if (!url) return null
  let parsed: URL
  try { parsed = new URL(url) } catch { return null }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
  const marker = '/image/upload/'
  if (parsed.hostname === 'res.cloudinary.com') {
    const idx = parsed.pathname.indexOf(marker)
    if (idx >= 0) {
      const rest = parsed.pathname.slice(idx + marker.length)
      const first = rest.split('/')[0]
      if (!/^[a-z]{1,3}_[^/]*/.test(first) && !first.includes(',')) {
        parsed.pathname = parsed.pathname.slice(0, idx + marker.length) + 'w_1600,c_limit,q_auto/' + rest
      }
    }
  }
  return parsed.toString()
}

const isLandscape = (layout: BoxLabelLayout) => layout !== 'portrait-photo'

function buildHtml(labels: BoxLabel[], layout: BoxLabelLayout): string {
  const withPhoto = layout !== 'text-landscape'
  const pages = labels.map(l => {
    let photoBlock = ''
    if (withPhoto) {
      const src = toPrintPhotoUrl(l.main_photo)
      const photo = src
        ? `<img src="${escapeHtml(src)}" alt="">`
        : `<div class="nophoto">無照片</div>`
      photoBlock = `<div class="photo">${photo}</div>\n  `
    }
    return `<section class="page">
  ${photoBlock}<div class="info">
    <div class="eid">${escapeHtml(l.equipment_id)}</div>
    <div class="name">${escapeHtml(l.name)}</div>
    <div class="meta">
      <div class="cell"><span class="val">${escapeHtml(l.location)}</span></div>
      <div class="cell"><span class="val">${escapeHtml(l.quantity)}</span></div>
      ${l.received_date ? `<div class="cell"><span class="val">${escapeHtml(l.received_date)}</span></div>` : ''}
    </div>
    ${l.note ? `<div class="note"><span class="noteval">${escapeHtml(l.note)}</span></div>` : ''}
  </div>
</section>`
  }).join('\n')

  const pageSize = isLandscape(layout) ? 'A4 landscape' : 'A4 portrait'
  const w = isLandscape(layout) ? '297mm' : '210mm'
  const h = isLandscape(layout) ? '210mm' : '297mm'

  return `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>列印封箱標籤</title>
<style>
@page { size: ${pageSize}; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
body { font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; color: #4a3422 }
.page { width: ${w}; height: ${h}; padding: 10mm; display: flex; background: #faf6f0; overflow: hidden; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
.photo { min-height: 0; min-width: 0; display: flex; align-items: center; justify-content: center; background: #fff; border: 0.4mm solid #c49a72; border-radius: 3mm; overflow: hidden }
.photo img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain }
.nophoto { color: #a08060; font-size: 8mm }
.info { text-align: center; min-width: 0 }
.eid { font-family: "Consolas", "Courier New", monospace; font-size: 11mm; font-weight: 700; color: #7a5230; letter-spacing: 0.3mm; line-height: 1.3; white-space: pre-wrap; word-break: break-word }
.name { margin-top: 2mm; font-size: 11mm; font-weight: 700; color: #4a3422; line-height: 1.3; word-break: break-word; white-space: pre-wrap }
.meta { margin-top: 6mm; padding-top: 5mm; border-top: 0.4mm dashed #c49a72; display: flex; justify-content: space-around; gap: 8mm }
.cell { display: flex; flex-direction: column; align-items: center; min-width: 0 }
.val { min-height: 10mm; font-size: 9mm; font-weight: 700; color: #4a3422; line-height: 1.2; word-break: break-word; white-space: pre-wrap }
.note { margin-top: 4mm; display: flex; justify-content: center }
.noteval { font-size: 7mm; font-weight: 700; color: #4a3422; line-height: 1.3; word-break: break-word; white-space: pre-wrap }
${layout === 'portrait-photo' ? `
.page { flex-direction: column }
.photo { flex: 1 }
.info { padding-top: 6mm }` : ''}${layout === 'landscape-photo' ? `
.page { flex-direction: row; gap: 10mm }
.photo { flex: 1.2 }
.info { flex: 1; display: flex; flex-direction: column; justify-content: center }
.meta { flex-direction: column; align-items: center; gap: 2mm }` : ''}${layout === 'text-landscape' ? `
.page { flex-direction: column; justify-content: center }
.meta { margin-top: 10mm; padding-top: 10mm }
.note { margin-top: 6mm }` : ''}
</style></head><body>
${pages}
</body></html>`
}

function waitForImages(doc: Document): Promise<void> {
  const imgs = Array.from(doc.images)
  return Promise.all(imgs.map(img => (
    img.complete
      ? Promise.resolve()
      : new Promise<void>(resolve => {
          img.addEventListener('load', () => resolve(), { once: true })
          img.addEventListener('error', () => resolve(), { once: true })
        })
  ))).then(() => undefined)
}

// 防重入：列印流程進行中忽略再次觸發，避免疊出多個列印視窗
let printing = false

export async function printBoxLabels(
  labels: BoxLabel[],
  layout: BoxLabelLayout = 'landscape-photo',
): Promise<void> {
  if (labels.length === 0 || printing) return
  printing = true

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  const w = isLandscape(layout) ? '297mm' : '210mm'
  const h = isLandscape(layout) ? '210mm' : '297mm'
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${w};height:${h};border:0;pointer-events:none`
  document.body.appendChild(iframe)

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    printing = false
    iframe.remove()
  }

  try {
    await new Promise<void>((resolve) => {
      iframe.addEventListener('load', () => resolve(), { once: true })
      iframe.srcdoc = buildHtml(labels, layout)
    })
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) { cleanup(); return }

    await Promise.race([
      waitForImages(doc),
      new Promise<void>(resolve => setTimeout(resolve, 30000)),
    ])

    win.addEventListener('afterprint', cleanup, { once: true })
    win.focus()
    win.print()
    setTimeout(cleanup, 120000)
  } catch {
    cleanup()
  }
}
