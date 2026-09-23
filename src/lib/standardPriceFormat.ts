// Step 46：標準售價共用純函式（前端 client component 與 API Route 都可 import）
//
// ⚠️ 這個檔案不可 import 任何 server-only 模組（next/headers、supabase-server、admin.ts 等），
// 否則 client component import 時會 build 失敗（Step 39 maintenance.ts 踩過同一個坑，
// 當時把純函式拆到 maintenanceFormat.ts 解決）。伺服器端驗證放在 standardPriceValidation.ts。
import type {
  StandardPriceExtraFee,
  StandardPriceNumberField,
  StandardPriceTextField,
} from '@/types/standardPrice'

// ── 欄位常數 ─────────────────────────────────────────────────

export const STANDARD_PRICE_NUMBER_FIELDS: StandardPriceNumberField[] = [
  'buyout_list_price',
  'buyout_sales_price',
  'buyout_manager_price',
  'rent_monthly',
  'platform_fee_buyout',
  'platform_fee_rent',
  'install_fee',
  'points_buyout',
  'points_rent',
]

export const STANDARD_PRICE_TEXT_FIELDS: StandardPriceTextField[] = ['plan_name', 'warranty', 'rent_contract']

// 長度上限（API 驗證與前端表單 maxLength 共用）
export const STANDARD_PRICE_LIMITS = {
  name: 100,
  category: 50,
  plan_name: 200,
  warranty: 100,
  rent_contract: 100,
  extraFeesMax: 20,
  extraFeeName: 50,
  extraFeeUnit: 20,
  importRowsMax: 500,
} as const

/**
 * CSV 匯入/匯出欄位對照（依規格固定順序）。
 * key 為 standard_price_items 欄位名，前端解析 CSV 時依 header 對應成 StandardPriceImportRow。
 */
export const STANDARD_PRICE_CSV_COLUMNS: { header: string; key: string }[] = [
  { header: '產品名稱', key: 'name' },
  { header: '分類', key: 'category' },
  { header: '方案名稱', key: 'plan_name' },
  { header: '生效日期', key: 'effective_date' },
  { header: '買斷定價', key: 'buyout_list_price' },
  { header: '業務價', key: 'buyout_sales_price' },
  { header: '主管價', key: 'buyout_manager_price' },
  { header: '保固', key: 'warranty' },
  { header: '月租', key: 'rent_monthly' },
  { header: '合約期', key: 'rent_contract' },
  { header: '平台費(買斷)', key: 'platform_fee_buyout' },
  { header: '平台費(租賃)', key: 'platform_fee_rent' },
  { header: '施工費', key: 'install_fee' },
  { header: '其他費用', key: 'extra_fees' },
  { header: '買斷積分', key: 'points_buyout' },
  { header: '租賃積分', key: 'points_rent' },
  { header: '備註', key: 'notes' },
]

// ── 名稱正規化（匯入時「名稱相近」偵測用） ──────────────────────

/**
 * 產品名稱正規化：全形轉半形 → 去除所有空白 → 轉小寫。
 * 兩個名稱正規化後相同但原字串不同 → 視為「名稱相近」提示使用者（不自動合併）。
 */
export function normalizeProductName(name: string): string {
  return toHalfWidth(name).replace(/\s+/g, '').toLowerCase()
}

/** 全形字元（！～、全形空白）轉半形 */
export function toHalfWidth(text: string): string {
  return text
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, ' ')
}

// ── 數字 / 日期解析 ──────────────────────────────────────────

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string }

/**
 * 非負數字欄位解析：undefined/null/'' → null；number 或數字字串（允許標準千分位逗號、全形數字）→ number；
 * 非數字、無限大、負數 → 錯誤。label 用於錯誤訊息。
 */
export function parseNonNegativeNumber(value: unknown, label: string): ParseResult<number | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  let num: number
  if (typeof value === 'number') {
    num = value
  } else if (typeof value === 'string') {
    const trimmed = toHalfWidth(value).trim()
    if (trimmed === '') return { ok: true, value: null }
    // 有逗號時只接受標準千分位（6,800、13,800、1,234,567.5），避免 1,2,3 被當成 123
    if (trimmed.includes(',') && !/^[+-]?\d{1,3}(,\d{3})+(\.\d*)?$/.test(trimmed)) {
      return { ok: false, error: `${label}必須為數字（千分位逗號需每 3 位一個，例：6,800）` }
    }
    const cleaned = trimmed.replace(/,/g, '')
    if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(cleaned)) {
      return { ok: false, error: `${label}必須為數字` }
    }
    num = Number(cleaned)
  } else {
    return { ok: false, error: `${label}必須為數字` }
  }
  if (!Number.isFinite(num)) return { ok: false, error: `${label}必須為數字` }
  if (num < 0) return { ok: false, error: `${label}不可為負數` }
  return { ok: true, value: num }
}

/**
 * 生效日期解析：接受 YYYY-MM-DD 或 YYYY/MM/DD（月、日可為 1 位數），必須是真實存在的日期。
 * 成功回傳正規化後的 YYYY-MM-DD。
 */
export function parseEffectiveDate(value: unknown): ParseResult<string> {
  if (typeof value !== 'string' || !value.trim()) {
    return { ok: false, error: '生效日期為必填' }
  }
  const m = toHalfWidth(value).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!m) return { ok: false, error: '生效日期格式錯誤（需為 YYYY-MM-DD 或 YYYY/MM/DD）' }
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (
    mo < 1 || mo > 12 || d < 1 ||
    date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d
  ) {
    return { ok: false, error: `生效日期不是有效日期：${value.trim()}` }
  }
  return { ok: true, value: `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}` }
}

// ── 其他費用 CSV 格式 ────────────────────────────────────────

/**
 * 解析 CSV「其他費用」欄位：`名稱=金額/單位`，多筆用中文頓號「、」或 `|` 分隔。
 * 金額與單位皆可省略：`名稱=/單位`、`名稱=金額`、`名稱`。
 * 例：`加裝4G模組=4500/台、校驗=500/次` → [{name:'加裝4G模組',amount:4500,unit:'台'}, {name:'校驗',amount:500,unit:'次'}]
 * 空字串 → []。這裡只做格式解析與數字檢查；長度/筆數上限由 API 驗證（validateExtraFees）把關。
 */
export function parseExtraFeesText(text: string | null | undefined): ParseResult<StandardPriceExtraFee[]> {
  if (!text || !text.trim()) return { ok: true, value: [] }
  const segments = text.split(/[、|]/).map((s) => s.trim()).filter(Boolean)
  const fees: StandardPriceExtraFee[] = []
  for (const seg of segments) {
    const eqIdx = seg.search(/[=＝]/)
    const name = (eqIdx === -1 ? seg : seg.slice(0, eqIdx)).trim()
    if (!name) return { ok: false, error: `其他費用格式錯誤：「${seg}」缺少名稱` }
    let amount: number | null = null
    let unit = ''
    if (eqIdx !== -1) {
      const rest = seg.slice(eqIdx + 1).trim()
      const slashIdx = rest.search(/[/／]/)
      const amountText = (slashIdx === -1 ? rest : rest.slice(0, slashIdx)).trim()
      unit = slashIdx === -1 ? '' : rest.slice(slashIdx + 1).trim()
      const parsed = parseNonNegativeNumber(amountText, `其他費用「${name}」金額`)
      if (!parsed.ok) return parsed
      amount = parsed.value
    }
    fees.push({ name, amount, unit })
  }
  return { ok: true, value: fees }
}

/** parseExtraFeesText 的反向：陣列 → CSV 文字（匯出/範本用），多筆以「、」連接 */
export function formatExtraFeesText(fees: StandardPriceExtraFee[] | null | undefined): string {
  if (!Array.isArray(fees) || fees.length === 0) return ''
  return fees
    .map((f) => {
      if (f.amount === null && !f.unit) return f.name
      return `${f.name}=${f.amount ?? ''}${f.unit ? `/${f.unit}` : ''}`
    })
    .join('、')
}
