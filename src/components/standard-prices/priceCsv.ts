// Step 46：標準售價 CSV 範本產生、解析、逐列預覽分析（純函式，PriceImportDialog 使用）
//
// 送出格式對應 POST /api/standard-prices/import 的規則：
//   - CSV 標頭「有」的欄位才放進該列物件（空白儲存格 → null/''/[]）；
//     覆蓋既有版本時，空白欄位會把既有值清空，唯獨「備註」空白會保留既有備註文字。
//   - CSV 標頭「沒有」的欄位不放進物件 → 覆蓋時沿用既有值。
//   - 備註圖片/表格不在 CSV 內，覆蓋時一律保留。
import type { StandardPriceImportRow, StandardPriceItem } from '@/types/standardPrice'
import {
  STANDARD_PRICE_CSV_COLUMNS,
  STANDARD_PRICE_LIMITS as L,
  STANDARD_PRICE_NUMBER_FIELDS,
  normalizeProductName,
  parseEffectiveDate,
  parseExtraFeesText,
  parseNonNegativeNumber,
} from '@/lib/standardPriceFormat'

const MAX_NOTES = 5000
const REQUIRED_HEADERS = ['產品名稱', '分類', '生效日期']
const NUMBER_KEYS = new Set<string>(STANDARD_PRICE_NUMBER_FIELDS)
const TEXT_LIMITS: Record<string, number> = { plan_name: L.plan_name, warranty: L.warranty, rent_contract: L.rent_contract }

// ── 範本 ───────────────────────────────────────────────────

const EXAMPLE_ROWS: Record<string, string>[] = [
  {
    name: 'DMS 168',
    category: '疲勞偵測/影像配件',
    plan_name: '2025.9 DMS 168 & 土石方車機 & EDR+416 銷售方案',
    effective_date: '2025-09-01',
    buyout_list_price: '6800',
    buyout_sales_price: '6500',
    buyout_manager_price: '6000',
    warranty: '三年',
    rent_monthly: '280',
    rent_contract: '三年約（續租續保）',
    extra_fees: '',
    points_buyout: '2',
    points_rent: '1',
    notes: '需搭配車機（S168、EDR、MDVR 其一）及 Smart Box 使用',
  },
]

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

/** 產生範本 CSV 文字（含 UTF-8 BOM，Excel 開啟中文不亂碼） */
export function buildTemplateCsv(): string {
  const header = STANDARD_PRICE_CSV_COLUMNS.map((c) => c.header).join(',')
  const rows = EXAMPLE_ROWS.map((r) => STANDARD_PRICE_CSV_COLUMNS.map((c) => csvCell(r[c.key] ?? '')).join(','))
  return '﻿' + [header, ...rows].join('\r\n') + '\r\n'
}

// ── 解析 ───────────────────────────────────────────────────

/**
 * CSV 解析（雙引號跳脫、引號內換行）。比照 BatchImportDialog 的做法另寫一份（不 import 核心保護元件）。
 * 回傳每筆紀錄與其在試算表中的列號（1-based，含空白列計數，對應 Excel 的列號）。
 * unclosedQuoteLine：檔案結束時仍在雙引號內 → 該引號開始的列號（否則 null）；此時 records 不可信，呼叫端應視為格式錯誤。
 */
function parseCsv(text: string): { records: { cells: string[]; line: number }[]; unclosedQuoteLine: number | null } {
  const out: { cells: string[]; line: number }[] = []
  let quoteStartLine = 0
  let cells: string[] = []
  let current = ''
  let inQuotes = false
  let line = 0
  const src = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const flush = () => {
    cells.push(current.trim())
    current = ''
    line += 1
    if (cells.some((c) => c !== '')) out.push({ cells, line })
    cells = []
  }
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"') {
      if (inQuotes && src[i + 1] === '"') { current += '"'; i++ } else {
        inQuotes = !inQuotes
        if (inQuotes) quoteStartLine = line + 1
      }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else if (ch === '\n' && !inQuotes) {
      flush()
    } else {
      current += ch
    }
  }
  if (inQuotes) return { records: out, unclosedQuoteLine: quoteStartLine }
  if (current !== '' || cells.length > 0) flush()
  return { records: out, unclosedQuoteLine: null }
}

export type RowStatus = 'new_product' | 'new_version' | 'overwrite' | 'error'

export interface PreviewRow {
  line: number
  name: string
  effective_date: string
  status: RowStatus
  errors: string[]
  warnings: string[]
  /** 送給 API 的資料（status 為 error 時為 null） */
  row: StandardPriceImportRow | null
}

export interface CsvAnalysis {
  fatal: string | null
  unknownHeaders: string[]
  /** CSV 沒有提供的選填欄位（覆蓋時沿用既有值） */
  missingOptional: string[]
  rows: PreviewRow[]
}

/** 解析 CSV 並與既有資料比對，產生逐列預覽 */
export function analyzeCsv(text: string, existing: StandardPriceItem[]): CsvAnalysis {
  const { records, unclosedQuoteLine } = parseCsv(text)
  const empty: CsvAnalysis = { fatal: null, unknownHeaders: [], missingOptional: [], rows: [] }
  if (unclosedQuoteLine !== null) {
    return {
      ...empty,
      fatal: `CSV 格式錯誤：第 ${unclosedQuoteLine} 列有雙引號（"）沒有成對結束，之後的內容無法正確解析。請檢查該列儲存格內的引號，或用 Excel 重新另存為 CSV UTF-8`,
    }
  }
  if (records.length === 0) return { ...empty, fatal: 'CSV 沒有任何內容' }

  const headerCells = records[0].cells.map((h) => h.trim())
  const colIndex = new Map<string, number>() // key → 欄位索引
  const unknownHeaders: string[] = []
  headerCells.forEach((h, idx) => {
    if (!h) return
    const col = STANDARD_PRICE_CSV_COLUMNS.find((c) => c.header === h || c.key === h)
    if (!col) unknownHeaders.push(h)
    else if (!colIndex.has(col.key)) colIndex.set(col.key, idx)
  })
  const missingRequired = REQUIRED_HEADERS.filter((h) => {
    const col = STANDARD_PRICE_CSV_COLUMNS.find((c) => c.header === h)
    return col && !colIndex.has(col.key)
  })
  const missingOptional = STANDARD_PRICE_CSV_COLUMNS
    .filter((c) => !REQUIRED_HEADERS.includes(c.header) && !colIndex.has(c.key))
    .map((c) => c.header)
  if (missingRequired.length > 0) {
    return { ...empty, unknownHeaders, missingOptional, fatal: `CSV 缺少必要欄位：${missingRequired.join('、')}（請使用範本的標頭；若標頭看起來正確，可能是檔案編碼不是 UTF-8，請在 Excel 用「另存新檔 → CSV UTF-8（逗號分隔）」重新儲存）` }
  }
  if (records.length < 2) return { ...empty, unknownHeaders, missingOptional, fatal: 'CSV 只有標頭，沒有資料列' }

  // 既有資料索引
  const existingVersions = new Set(existing.map((i) => `${i.name}\u0000${i.effective_date}`))
  const existingNames = new Set(existing.map((i) => i.name))
  const normToNames = new Map<string, Set<string>>()
  const addNorm = (name: string) => {
    const k = normalizeProductName(name)
    const set = normToNames.get(k) ?? new Set<string>()
    set.add(name)
    normToNames.set(k, set)
  }
  existing.forEach((i) => addNorm(i.name))

  const rows: PreviewRow[] = []
  const seenInFile = new Map<string, number>() // name+date → 列號
  const newNamesInFile = new Set<string>() // 檔案內前面列已「新增產品」的名稱，後續同名列算「新版本」
  for (const rec of records.slice(1)) {
    const get = (key: string) => {
      const idx = colIndex.get(key)
      return idx === undefined ? undefined : (rec.cells[idx] ?? '')
    }
    const errors: string[] = []
    const name = (get('name') ?? '').trim()
    const category = (get('category') ?? '').trim()
    if (!name) errors.push('產品名稱為必填')
    else if (name.length > L.name) errors.push(`產品名稱最多 ${L.name} 字`)
    if (!category) errors.push('分類為必填')
    else if (category.length > L.category) errors.push(`分類最多 ${L.category} 字`)
    const dateRes = parseEffectiveDate(get('effective_date') ?? '')
    if (!dateRes.ok) errors.push(dateRes.error)
    const date = dateRes.ok ? dateRes.value : (get('effective_date') ?? '').trim()

    const row: Record<string, unknown> = { name, category, effective_date: date }
    for (const col of STANDARD_PRICE_CSV_COLUMNS) {
      const key = col.key
      if (key === 'name' || key === 'category' || key === 'effective_date') continue
      const raw = get(key)
      if (raw === undefined) continue // CSV 沒這欄 → 不送，覆蓋時沿用既有值
      if (NUMBER_KEYS.has(key)) {
        const r = parseNonNegativeNumber(raw, col.header)
        if (r.ok) row[key] = r.value
        else errors.push(r.error)
      } else if (key === 'extra_fees') {
        const r = parseExtraFeesText(raw)
        if (!r.ok) { errors.push(r.error); continue }
        if (r.value.length > L.extraFeesMax) errors.push(`其他費用最多 ${L.extraFeesMax} 筆`)
        for (const f of r.value) {
          if (f.name.length > L.extraFeeName) errors.push(`其他費用名稱最多 ${L.extraFeeName} 字：${f.name}`)
          if (f.unit.length > L.extraFeeUnit) errors.push(`其他費用「${f.name}」單位最多 ${L.extraFeeUnit} 字`)
        }
        row[key] = r.value
      } else if (key === 'notes') {
        if (raw.trim().length > MAX_NOTES) errors.push(`備註最多 ${MAX_NOTES} 字`)
        row[key] = raw.trim() || null
      } else {
        const max = TEXT_LIMITS[key]
        if (max && raw.trim().length > max) errors.push(`${col.header}最多 ${max} 字`)
        row[key] = raw.trim() || null
      }
    }

    if (name && dateRes.ok) {
      const vk = `${name}\u0000${date}`
      const first = seenInFile.get(vk)
      if (first !== undefined) errors.push(`與第 ${first} 列的產品名稱＋生效日期重複`)
      else seenInFile.set(vk, rec.line)
    }

    let status: RowStatus = 'error'
    if (errors.length === 0) {
      if (existingVersions.has(`${name}\u0000${date}`)) status = 'overwrite'
      else if (existingNames.has(name) || newNamesInFile.has(name)) status = 'new_version'
      else { status = 'new_product'; newNamesInFile.add(name) }
    }
    if (name) addNorm(name)
    rows.push({
      line: rec.line,
      name,
      effective_date: date,
      status,
      errors,
      warnings: [],
      row: errors.length === 0 ? (row as StandardPriceImportRow) : null,
    })
  }

  // 名稱相近提示（全部列讀完再比，才能涵蓋檔案內前後列）
  for (const r of rows) {
    if (!r.name) continue
    const similar = Array.from(normToNames.get(normalizeProductName(r.name)) ?? []).filter((n) => n !== r.name)
    if (similar.length > 0) r.warnings.push(`名稱相近：${similar.join('、')}`)
  }

  return { fatal: null, unknownHeaders, missingOptional, rows }
}
