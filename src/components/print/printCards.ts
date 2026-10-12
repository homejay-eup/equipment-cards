// 列印料卡（A6 直式，每張一頁）。用隱藏 iframe 列印，不依賴 globals.css。
// 進紙來源（手送台）由使用者在瀏覽器列印對話框選擇，這裡不指定。

export interface PrintableCard {
  equipment_id: string
  name: string
  main_photo: string | null
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Cloudinary 圖片：插入縮放轉換參數取較高解析度（寬上限 1200、不放大）。
// 非 Cloudinary 或已含轉換參數的 URL 原樣使用；僅接受 http(s)。
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
      // 第一段若像轉換參數（含逗號或 w_/c_/q_ 開頭）就不重複加
      const first = rest.split('/')[0]
      if (!/^[a-z]{1,3}_[^/]*/.test(first) && !first.includes(',')) {
        parsed.pathname = parsed.pathname.slice(0, idx + marker.length) + 'w_1200,c_limit,q_auto/' + rest
      }
    }
  }
  return parsed.toString()
}

function buildHtml(cards: PrintableCard[]): string {
  const pages = cards.map(c => {
    const src = toPrintPhotoUrl(c.main_photo)
    const photo = src
      ? `<img src="${escapeHtml(src)}" alt="">`
      : `<div class="nophoto">無照片</div>`
    return `<section class="page">
  <div class="photo">${photo}</div>
  <div class="info">
    <div class="eid">${escapeHtml(c.equipment_id)}</div>
    <div class="name">${escapeHtml(c.name)}</div>
  </div>
</section>`
  }).join('\n')

  return `<!doctype html>
<html lang="zh-TW"><head><meta charset="utf-8"><title>列印料卡</title>
<style>
@page { size: A6 portrait; margin: 0 }
* { box-sizing: border-box }
html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact }
body { font-family: "Microsoft JhengHei", "Noto Sans TC", sans-serif; color: #4a3422 }
.page { width: 105mm; height: 148mm; padding: 6mm; display: flex; flex-direction: column; background: #faf6f0; overflow: hidden; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
.photo { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #fff; border: 0.3mm solid #c49a72; border-radius: 2mm; overflow: hidden }
.photo img { max-width: 100%; max-height: 100%; width: 100%; height: 100%; object-fit: contain }
.nophoto { color: #a08060; font-size: 5mm }
.info { padding-top: 4mm; text-align: center }
.eid { font-family: "Consolas", "Courier New", monospace; font-size: 3.4mm; color: #7a5230; letter-spacing: 0.2mm }
.name { margin-top: 1.5mm; font-size: 5mm; font-weight: 700; color: #4a3422; line-height: 1.3; word-break: break-word }
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

// 防重入：列印流程進行中（等圖片／列印對話框開啟）忽略再次觸發，避免疊出多個列印視窗
let printing = false

export async function printCards(cards: PrintableCard[]): Promise<void> {
  if (cards.length === 0 || printing) return
  printing = true

  const iframe = document.createElement('iframe')
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = 'position:fixed;left:-10000px;top:0;width:105mm;height:148mm;border:0;pointer-events:none'
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
      iframe.srcdoc = buildHtml(cards)
    })
    const win = iframe.contentWindow
    const doc = iframe.contentDocument
    if (!win || !doc) { cleanup(); return }

    // 等所有圖片 load/error 後才列印（最多等 30 秒避免卡死）
    await Promise.race([
      waitForImages(doc),
      new Promise<void>(resolve => setTimeout(resolve, 30000)),
    ])

    win.addEventListener('afterprint', cleanup, { once: true })
    win.focus()
    win.print()
    // 部分瀏覽器不觸發 afterprint，保底延後清理
    setTimeout(cleanup, 120000)
  } catch {
    cleanup()
  }
}
