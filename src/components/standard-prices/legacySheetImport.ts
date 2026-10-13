import {
  KNOWN_CAT_KEYS, KNOWN_ITEM_KEYS, KNOWN_RULE_KEYS,
  normalizeSheetData, renderSheetHtml, type SheetData, type SheetLegend,
} from '@/lib/priceSheetTemplate'

// Step 48：把舊格式價目表（資料直接寫在 <script> 的 const STD/CATS/RULES，例如 2026/10/1、10/7 版）轉成 SheetData。
// - 表頭、圖例、頁尾：用 DOMParser 解析（DOMParser 不會執行任何 script）
// - CATS/RULES：是 JS 物件字面值不是 JSON，交給 sandbox iframe（只有 allow-scripts，
//   不給 allow-same-origin）執行後 postMessage 回傳，程式碼碰不到料卡系統的 cookie / DOM / API
// - 轉完會再做「還原度檢查」：原檔與用編輯器版型重新產生的頁面，產品區塊與分類選單必須一字不差，
//   否則代表原檔有編輯器不認得的內容（例如 10/7 版新增的黃色框），拒絕開啟，避免存檔時內容被默默丟掉

export type LegacyImportResult =
  | { ok: true; data: SheetData }
  | { ok: false; reason: string }

function text(el: Element | null | undefined): string {
  return (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
}

function parseMeta(html: string) {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const facts = doc.querySelectorAll('.fact')
  const legend: SheetLegend[] = Array.from(doc.querySelectorAll('.legend > span')).map(span => {
    const mark = span.querySelector('mark')
    const k = mark ? `«${text(mark)}»` : text(span.querySelector('i'))
    const v = text(span).replace(/^[^：:]*[：:]/, '').trim()
    return { k, v }
  })
  const changeTag = html.match(/chip new">([^<]*)</)?.[1]?.trim() ?? ''
  return {
    docTitle: text(doc.querySelector('title')),
    brand: text(doc.querySelector('.brand')),
    title: text(doc.querySelector('h1')),
    sub: text(doc.querySelector('.sub')),
    factDate: text(facts[0]?.querySelector('b')),
    factDateLabel: text(facts[0]?.querySelector('span')),
    changeTag,
    legend,
    footer: text(doc.querySelector('footer')),
  }
}

// 從原始 script 裡切出宣告資料的那一段（const STD ... 到 const esc 之前）
function extractDataScript(html: string): string | null {
  const start = html.search(/const (STD|CATS)\s*=/)
  if (start < 0) return null
  const rest = html.slice(start)
  const end = rest.search(/const esc\s*=|<\/script>/)
  return end < 0 ? null : rest.slice(0, end)
}

// 在 sandbox iframe 裡跑一段 HTML，等它用 postMessage({token, ...}) 回報
function runSandbox<T>(buildDoc: (token: string) => string): Promise<T> {
  return new Promise((resolve, reject) => {
    const token = Math.random().toString(36).slice(2)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.cssText = 'position:absolute;left:-10000px;width:1200px;height:800px;border:0'
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      iframe.remove()
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.data?.token !== token) return
      cleanup()
      if (e.data.error) reject(new Error(e.data.error))
      else resolve(e.data as T)
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, 8000)
    window.addEventListener('message', onMessage)
    iframe.srcdoc = buildDoc(token)
    document.body.appendChild(iframe)
  })
}

function readData(code: string) {
  // </script> 不可能出現在 code 裡（extractDataScript 在第一個 </script> 前就截斷）
  return runSandbox<{ cats: unknown; rules: unknown }>(token => `<script>try{${code}
;parent.postMessage({token:${JSON.stringify(token)},cats:CATS,rules:typeof RULES==='undefined'?[]:RULES},'*')}catch(err){parent.postMessage({token:${JSON.stringify(token)},error:String(err)},'*')}</script>`)
}

// 讓頁面自己的 script 跑完後，回報產品區塊與分類選單的 HTML
function snapshot(html: string) {
  return runSandbox<{ main: string; side: string }>(token => {
    const probe = `<script>parent.postMessage({token:${JSON.stringify(token)},main:(document.getElementById('main')||{}).innerHTML||'',side:(document.getElementById('side')||{}).innerHTML||''},'*')</script>`
    return /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${probe}</body>`) : html + probe
  })
}

function unknownKeys(cats: unknown, rules: unknown): string[] {
  const found = new Set<string>()
  const check = (obj: unknown, known: string[], where: string) => {
    if (!obj || typeof obj !== 'object') return
    for (const k of Object.keys(obj)) if (!known.includes(k)) found.add(`${where}.${k}`)
  }
  for (const c of Array.isArray(cats) ? cats : []) {
    check(c, KNOWN_CAT_KEYS, '分類')
    for (const it of Array.isArray((c as { items?: unknown[] })?.items) ? (c as { items: unknown[] }).items : []) check(it, KNOWN_ITEM_KEYS, '產品')
  }
  for (const r of Array.isArray(rules) ? rules : []) check(r, KNOWN_RULE_KEYS, '規則')
  return Array.from(found)
}

const UNSUPPORTED = '這個版本的 HTML 有編輯器還不認得的內容，為了避免存檔時被刪掉，暫時不能用編輯器修改。請改用「上傳新版」，或聯絡 Lala 讓編輯器支援'

export async function importLegacySheet(html: string): Promise<LegacyImportResult> {
  const code = extractDataScript(html)
  if (!code) return { ok: false, reason: UNSUPPORTED }
  try {
    const { cats, rules } = await readData(code)
    const extra = unknownKeys(cats, rules)
    if (extra.length) return { ok: false, reason: `${UNSUPPORTED}（${extra.join('、')}）` }
    const data = normalizeSheetData({ version: 1, meta: parseMeta(html), cats, rules })
    if (!data) return { ok: false, reason: UNSUPPORTED }

    const [before, after] = await Promise.all([snapshot(html), snapshot(renderSheetHtml(data))])
    if (before.main !== after.main || before.side !== after.side) return { ok: false, reason: UNSUPPORTED }
    return { ok: true, data }
  } catch {
    return { ok: false, reason: '讀取價目表內容失敗，請重新整理後再試' }
  }
}
