import { normalizeSheetData, type SheetData, type SheetLegend } from '@/lib/priceSheetTemplate'

// Step 48：把 2026/10/1 原始版價目表（資料直接寫在 <script> 的 const STD/CATS/RULES）轉成 SheetData。
// - 表頭、圖例、頁尾：用 DOMParser 解析（DOMParser 不會執行任何 script）
// - CATS/RULES：是 JS 物件字面值不是 JSON，交給 sandbox iframe（只有 allow-scripts，
//   不給 allow-same-origin）執行後 postMessage 回傳，程式碼碰不到料卡系統的 cookie / DOM / API

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

function runInSandbox(code: string): Promise<{ cats: unknown; rules: unknown }> {
  return new Promise((resolve, reject) => {
    const token = Math.random().toString(36).slice(2)
    const iframe = document.createElement('iframe')
    iframe.setAttribute('sandbox', 'allow-scripts')
    iframe.style.display = 'none'
    const cleanup = () => {
      window.removeEventListener('message', onMessage)
      clearTimeout(timer)
      iframe.remove()
    }
    const onMessage = (e: MessageEvent) => {
      if (e.source !== iframe.contentWindow || e.data?.token !== token) return
      cleanup()
      if (e.data.error) reject(new Error(e.data.error))
      else resolve({ cats: e.data.cats, rules: e.data.rules })
    }
    const timer = setTimeout(() => { cleanup(); reject(new Error('timeout')) }, 5000)
    window.addEventListener('message', onMessage)
    // </script> 不可能出現在 code 裡（extractDataScript 在第一個 </script> 前就截斷）
    iframe.srcdoc = `<script>try{${code}
;parent.postMessage({token:${JSON.stringify(token)},cats:CATS,rules:typeof RULES==='undefined'?[]:RULES},'*')}catch(err){parent.postMessage({token:${JSON.stringify(token)},error:String(err)},'*')}</script>`
    document.body.appendChild(iframe)
  })
}

export async function importLegacySheet(html: string): Promise<SheetData | null> {
  const code = extractDataScript(html)
  if (!code) return null
  try {
    const { cats, rules } = await runInSandbox(code)
    return normalizeSheetData({ version: 1, meta: parseMeta(html), cats, rules })
  } catch {
    return null
  }
}
