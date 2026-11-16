// Step 54：匯出盤點表到 Google 試算表（共用雲端硬碟「設備料卡規格書」/盤點表）
// 欄位：品號、品名、倉別、總計、實盤數、盤差。實盤數／盤差匯出時空白；填了實盤數，盤差（公式）才出現並依正負變色。
// 「倉別」＝儲位（A／B／C…），跟著品號記在 stocktake_locations；在網站或在試算表改都記得（下次匯出前讀回上一份）。
import { getDriveClient, getSheetsClient } from '@/lib/googleDrive'
import { getServiceClient } from '@/lib/departments'
import { locKey, type InvProductRow } from '@/lib/inventory'

export const STOCKTAKE_FOLDER_ID = process.env.GOOGLE_DRIVE_STOCKTAKE_FOLDER_ID ?? ''
const HEAD = ['品號', '品名', '倉別', '總計', '實盤數', '盤差']
const HEAD_WH = ['品號', '品名', '倉別', '倉庫', '總計', '實盤數', '盤差']   // 「同一張表、各倉分開」：多一欄倉庫
const colLetter = (i: number) => String.fromCharCode(65 + i)
const rgb = (hex: string) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 })

export interface StocktakeOptions { warehouses: string[]; mode: 'merge' | 'each' | 'stack'; qty: 'all' | 'ok'; zero: boolean }

/** 檔名「庫存明細表115 - 11月 16」、分頁「261116盤點表」（台灣時間） */
export function stocktakeNames(now = new Date()) {
  const tw = new Date(now.getTime() + 8 * 3600 * 1000)
  const y = tw.getUTCFullYear(), m = tw.getUTCMonth() + 1, d = tw.getUTCDate()
  const dd = String(d).padStart(2, '0'), mm = String(m).padStart(2, '0')
  return { file: `庫存明細表${y - 1911} - ${m}月 ${dd}`, tab: `${String(y).slice(2)}${mm}${dd}盤點表`, ymd: `${String(y).slice(2)}${mm}${dd}` }
}

export async function getLocations(): Promise<Map<string, { location: string; updated_at: string }>> {
  const { data } = await getServiceClient().from('stocktake_locations').select('product_key, location, updated_at')
  return new Map((data ?? []).map((r: { product_key: string; location: string; updated_at: string }) => [r.product_key, { location: r.location, updated_at: r.updated_at }]))
}

/**
 * 讀回上一份盤點表的「倉別」欄：試算表裡改過、而且網站上在那份匯出之後沒再改過 → 以試算表為準存回。
 * 回傳更新了幾筆；讀不到（被刪、沒權限）就略過。
 */
export async function syncLocationsFromLastSheet(): Promise<number> {
  const db = getServiceClient()
  const { data: last } = await db.from('stocktake_exports').select('sheet_id, created_at').not('sheet_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!last?.sheet_id) return 0
  const sheets = await getSheetsClient()
  let tabs: string[] = []
  try {
    const meta = await sheets.spreadsheets.get({ spreadsheetId: last.sheet_id, fields: 'sheets.properties.title' })
    tabs = (meta.data.sheets ?? []).map(s => s.properties?.title ?? '').filter(Boolean)
  } catch { return 0 }
  if (!tabs.length) return 0
  const got = await sheets.spreadsheets.values.batchGet({ spreadsheetId: last.sheet_id, ranges: tabs.map(t => `'${t}'!A2:C`) })
  const fromSheet = new Map<string, string>()
  for (const vr of got.data.valueRanges ?? []) {
    for (const row of vr.values ?? []) {
      const [pid, name, loc] = [String(row[0] ?? '').trim(), String(row[1] ?? '').trim(), String(row[2] ?? '').trim().toUpperCase()]
      if (!pid && !name) continue
      fromSheet.set(pid || `名稱:${name}`, loc)
    }
  }
  const cur = await getLocations()
  const exportedAt = new Date(last.created_at).getTime()
  const ups: { product_key: string; location: string; source: string; updated_by: string; updated_at: string }[] = []
  fromSheet.forEach((loc, key) => {
    const c = cur.get(key)
    if ((c?.location ?? '') === loc) return
    if (c && new Date(c.updated_at).getTime() > exportedAt) return   // 網站在匯出後又改過 → 網站為準
    ups.push({ product_key: key, location: loc, source: 'sheet', updated_by: '試算表', updated_at: new Date().toISOString() })   // 空字串＝在試算表清掉
  })
  if (ups.length) await db.from('stocktake_locations').upsert(ups, { onConflict: 'product_key' })
  return ups.length
}

type Row = [string, string, string, number, string?]   // [品號, 品名, 倉別, 數量, 倉庫（stack 才有）]

export function buildRows(products: InvProductRow[], whs: string[], opt: StocktakeOptions, locs: Map<string, { location: string }>): Row[] {
  return products
    .map(p => {
      const n = whs.reduce((s, w) => s + (p.cells[w]?.[0] ?? 0) + (opt.qty === 'all' ? (p.cells[w]?.[1] ?? 0) : 0), 0)
      return [p.pid ?? '', p.name, locs.get(locKey(p))?.location ?? '', n] as Row
    })
    .filter(r => opt.zero || r[3] > 0)
    .sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || (a[0] || a[1]).localeCompare(b[0] || b[1], 'zh-Hant'))   // 沒料號的排最後
}

/** 同一張表、各倉分開：每個倉一段（依選擇順序），段內依品號排序；每列多一欄倉庫 */
export function buildStackRows(products: InvProductRow[], whs: string[], opt: StocktakeOptions, locs: Map<string, { location: string }>): Row[] {
  return whs.flatMap(w => buildRows(products, [w], opt, locs).map(r => [r[0], r[1], r[2], r[3], w] as Row))
}

/** 建立試算表並套好格式；回傳 { id, url, name } */
export async function createStocktakeSheet(tabs: { title: string; rows: Row[]; withWh?: boolean }[]) {
  if (!STOCKTAKE_FOLDER_ID) throw new Error('伺服器尚未設定盤點表資料夾（GOOGLE_DRIVE_STOCKTAKE_FOLDER_ID）')
  const drive = await getDriveClient()
  const sheets = await getSheetsClient()
  const { file } = stocktakeNames()
  // 同一天已有同名檔 → 加 (2)、(3)…
  const existing = await drive.files.list({
    q: `'${STOCKTAKE_FOLDER_ID}' in parents and name contains '${file}' and trashed=false`,
    includeItemsFromAllDrives: true, supportsAllDrives: true, fields: 'files(name)',
  })
  const names = new Set((existing.data.files ?? []).map(f => f.name))
  let name = file
  for (let i = 2; names.has(name); i++) name = `${file} (${i})`

  const created = await drive.files.create({
    requestBody: { name, mimeType: 'application/vnd.google-apps.spreadsheet', parents: [STOCKTAKE_FOLDER_ID] },
    supportsAllDrives: true, fields: 'id, webViewLink',
  })
  const id = created.data.id!
  const meta = await sheets.spreadsheets.get({ spreadsheetId: id, fields: 'sheets.properties.sheetId' })
  const firstId = meta.data.sheets?.[0]?.properties?.sheetId ?? 0

  // 分頁：第一個改名，其他新增
  const reqs: object[] = [{ updateSheetProperties: { properties: { sheetId: firstId, title: tabs[0].title }, fields: 'title' } }]
  const ids = [firstId]
  tabs.slice(1).forEach((t, i) => { ids.push(1000 + i); reqs.push({ addSheet: { properties: { sheetId: 1000 + i, title: t.title } } }) })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: reqs } })

  // 資料：盤差＝實盤數空白時不顯示，填了才算（實盤數 − 總計）
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId: id,
    requestBody: {
      valueInputOption: 'USER_ENTERED',
      data: tabs.map(t => {
        const w = t.withWh ? 1 : 0, Q = colLetter(3 + w), C = colLetter(4 + w)
        return {
          range: `'${t.title}'!A1`,
          values: [t.withWh ? HEAD_WH : HEAD, ...t.rows.map((r, i) => [r[0], r[1], r[2], ...(w ? [r[4] ?? ''] : []), r[3], '', `=IF(${C}${i + 2}="","",${C}${i + 2}-${Q}${i + 2})`])],
        }
      }),
    },
  })

  // 格式（沿用料卡網站木質色調）
  const fmt: object[] = []
  tabs.forEach((t, k) => {
    const sid = ids[k], n = t.rows.length + 1, w = t.withWh ? 1 : 0, nc = 6 + w
    const range = (c0: number, c1: number, r0 = 0, r1 = n) => ({ sheetId: sid, startRowIndex: r0, endRowIndex: r1, startColumnIndex: c0, endColumnIndex: c1 })
    fmt.push(
      { updateSheetProperties: { properties: { sheetId: sid, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
      { repeatCell: { range: range(0, nc, 0, n), cell: { userEnteredFormat: { textFormat: { fontSize: 12 }, verticalAlignment: 'MIDDLE' } }, fields: 'userEnteredFormat(textFormat.fontSize,verticalAlignment)' } },
      { repeatCell: { range: range(0, nc, 0, 1), cell: { userEnteredFormat: { backgroundColor: rgb('#7a5230'), horizontalAlignment: 'CENTER', textFormat: { foregroundColor: rgb('#ffffff'), bold: true, fontSize: 13 } } }, fields: 'userEnteredFormat(backgroundColor,horizontalAlignment,textFormat)' } },
      { repeatCell: { range: range(2, nc, 1, n), cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
      { repeatCell: { range: range(0, 1, 1, n), cell: { userEnteredFormat: { horizontalAlignment: 'LEFT' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
      { addBanding: { bandedRange: { range: range(0, nc, 0, n), rowProperties: { headerColor: rgb('#7a5230'), firstBandColor: rgb('#ffffff'), secondBandColor: rgb('#faf6f0') } } } },
      { repeatCell: { range: range(4 + w, 5 + w, 1, n), cell: { userEnteredFormat: { backgroundColor: rgb('#fffbe8') } }, fields: 'userEnteredFormat.backgroundColor' } },
      { setBasicFilter: { filter: { range: range(0, nc, 0, n) } } },
      { addConditionalFormatRule: { index: 0, rule: { ranges: [range(5 + w, 6 + w, 1, n)], booleanRule: { condition: { type: 'NUMBER_GREATER', values: [{ userEnteredValue: '0' }] }, format: { backgroundColor: rgb('#e6f0e0'), textFormat: { foregroundColor: rgb('#3d7a3a'), bold: true } } } } } },
      { addConditionalFormatRule: { index: 1, rule: { ranges: [range(5 + w, 6 + w, 1, n)], booleanRule: { condition: { type: 'NUMBER_LESS', values: [{ userEnteredValue: '0' }] }, format: { backgroundColor: rgb('#f8e4dc'), textFormat: { foregroundColor: rgb('#b5451b'), bold: true } } } } } },
      ...(w ? [[0, 120], [1, 320], [2, 80], [3, 130], [4, 90], [5, 90], [6, 80]] : [[0, 120], [1, 320], [2, 80], [3, 90], [4, 90], [5, 80]]).map(([c, px]) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' } })),
    )
  })
  await sheets.spreadsheets.batchUpdate({ spreadsheetId: id, requestBody: { requests: fmt } })
  return { id, url: created.data.webViewLink ?? `https://docs.google.com/spreadsheets/d/${id}/edit`, name }
}
