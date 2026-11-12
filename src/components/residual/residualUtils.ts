// Step 53：設備殘值前端小工具（CSV 解析／匯出、API 錯誤訊息）

/** 從 fetch 回應取出錯誤訊息（API 一律回 { error }） */
export async function readError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null)
  if (data && typeof data.error === 'string' && data.error) {
    return data.error === 'Forbidden' ? '沒有權限執行此操作' : data.error
  }
  return fallback
}

/** 解析 CSV／Excel 貼上的 TSV 文字成二維陣列（支援雙引號欄位、欄位內換行與 "" 跳脫；分隔符號自動判斷 tab 或逗號） */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^﻿/, '')
  const firstLine = src.split(/\r?\n/, 1)[0] ?? ''
  const delim = firstLine.includes('\t') ? '\t' : ','
  const out: string[][] = []
  let row: string[] = []
  let cell = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++ } else inQuotes = false
      } else cell += ch
    } else if (ch === '"' && cell === '') {
      inQuotes = true
    } else if (ch === delim) {
      row.push(cell); cell = ''
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(cell); cell = ''
      out.push(row); row = []
    } else cell += ch
  }
  if (cell !== '' || row.length) { row.push(cell); out.push(row) }
  return out.filter((r) => r.some((c) => c.trim() !== ''))
}

const HEADER_HINT = /品號|品名|金額|年限|code|name|price|years/i

/** 二維陣列 → 匯入用的列。第一列像表頭（含品號／品名…字樣）就略過；欄位順序固定：品號、品名、金額、年限(月) */
export function rowsToImport(table: string[][]): { code: string; name: string; price: string; years: string }[] {
  const body = table.length && HEADER_HINT.test(table[0].join(',')) ? table.slice(1) : table
  return body.map((r) => ({
    code: (r[0] ?? '').trim(),
    // 匯出時為防 Excel 公式注入補的前導單引號，匯回時還原
    name: (r[1] ?? '').trim().replace(/^'(?=[=+\-@])/, ''),
    price: (r[2] ?? '').trim(),
    years: (r[3] ?? '').trim(),
  }))
}

/** CSV 欄位輸出：含逗號／引號／換行就加引號；開頭是 = + - @ 的非數字文字前面補單引號，避免被 Excel 當公式執行 */
function csvCell(v: string | number | null | undefined): string {
  let s = v === null || v === undefined ? '' : String(v)
  if (typeof v === 'string' && /^[=+\-@]/.test(s) && Number.isNaN(Number(s))) s = "'" + s
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

export function itemsToCsv(items: { code: string; name: string; price: number | null; years: number | null }[]): string {
  const lines = [['品號', '品名', '金額', '年限(月)'].join(',')]
  for (const it of items) lines.push([csvCell(it.code), csvCell(it.name), csvCell(it.price), csvCell(it.years)].join(','))
  return '﻿' + lines.join('\r\n')
}
