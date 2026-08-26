import type { TableData } from './richContentTypes'

// 貼上偵測用：Excel/Google Sheets 複製表格範圍時 clipboard 的 text/html 會帶 <table>。
// 解析成結構化列×欄資料；第一列若全是 <th> 視為表頭。
export function parseHtmlTable(html: string): TableData | null {
  if (!/<table/i.test(html)) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return null
    const rows: string[][] = []
    let hasHeader = false
    const trList = Array.from(table.querySelectorAll('tr'))
    trList.forEach((tr, idx) => {
      const cells = Array.from(tr.children).filter(
        (el): el is HTMLTableCellElement => el.tagName === 'TD' || el.tagName === 'TH',
      )
      if (cells.length === 0) return
      rows.push(cells.map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()))
      if (idx === 0 && cells.every((c) => c.tagName === 'TH')) hasHeader = true
    })
    return rows.length > 0 ? { rows, hasHeader } : null
  } catch {
    return null
  }
}
