// Step 46：標準售價 API 共用驗證／正規化（POST、PATCH、批次匯入三個端點共用同一套規則）
//
// 只給 API Route（伺服器端）使用。前端要用的純函式（parseExtraFeesText、normalizeProductName、
// parseEffectiveDate 等）放在 standardPriceFormat.ts，client component 請 import 那個檔案。
import { validateRichContent } from '@/lib/richContentValidation'
import {
  STANDARD_PRICE_LIMITS as L,
  STANDARD_PRICE_NUMBER_FIELDS,
  STANDARD_PRICE_TEXT_FIELDS,
  parseEffectiveDate,
  parseNonNegativeNumber,
  type ParseResult,
} from '@/lib/standardPriceFormat'
import type { StandardPriceExtraFee } from '@/types/standardPrice'

const NUMBER_FIELD_LABELS: Record<string, string> = {
  buyout_list_price: '買斷定價',
  buyout_sales_price: '業務價',
  buyout_manager_price: '主管價',
  rent_monthly: '月租',
  platform_fee_buyout: '平台費(買斷)',
  platform_fee_rent: '平台費(租賃)',
  install_fee: '施工費',
  points_buyout: '買斷積分',
  points_rent: '租賃積分',
}

const TEXT_FIELD_LABELS: Record<string, string> = {
  plan_name: '方案名稱',
  warranty: '保固',
  rent_contract: '合約期',
}

export type StandardPriceValidationResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string; status: number }

export interface StandardPriceValidationOptions {
  /**
   * true：部分更新（PATCH），只驗證並回傳有送到（!== undefined）的欄位，必填欄位不強制出現；
   * false：完整新增（POST／匯入），name / category / effective_date 必填。
   */
  partial?: boolean
  /**
   * 是否處理備註圖片/表格（notes_image_urls / notes_table_data）。
   * 匯入（CSV 沒有這兩欄）設 false：只處理 notes 文字，body 帶了這兩欄也忽略。預設 true。
   */
  includeRichNotes?: boolean
}

/** 必填短字串：trim 後不可為空、不可超過長度上限 */
function parseRequiredString(value: unknown, label: string, max: number): ParseResult<string> {
  if (typeof value !== 'string' || !value.trim()) return { ok: false, error: `${label}為必填` }
  const trimmed = value.trim()
  if (trimmed.length > max) return { ok: false, error: `${label}最多 ${max} 字` }
  return { ok: true, value: trimmed }
}

/** 選填字串：undefined/null/'' → null */
function parseOptionalString(value: unknown, label: string, max: number): ParseResult<string | null> {
  if (value === undefined || value === null) return { ok: true, value: null }
  if (typeof value !== 'string') return { ok: false, error: `${label}格式錯誤` }
  const trimmed = value.trim()
  if (!trimmed) return { ok: true, value: null }
  if (trimmed.length > max) return { ok: false, error: `${label}最多 ${max} 字` }
  return { ok: true, value: trimmed }
}

/**
 * 其他費用陣列驗證：上限 20 筆；name 必填 ≤ 50 字；unit ≤ 20 字（可空）；amount 為 null 或 ≥ 0 的數字
 * （也接受數字字串）。undefined/null → []。
 */
export function validateExtraFees(value: unknown): ParseResult<StandardPriceExtraFee[]> {
  if (value === undefined || value === null) return { ok: true, value: [] }
  if (!Array.isArray(value)) return { ok: false, error: '其他費用格式錯誤' }
  if (value.length > L.extraFeesMax) return { ok: false, error: `其他費用最多 ${L.extraFeesMax} 筆` }
  const fees: StandardPriceExtraFee[] = []
  for (let i = 0; i < value.length; i++) {
    const fee = value[i] as Partial<Record<keyof StandardPriceExtraFee, unknown>> | null
    if (!fee || typeof fee !== 'object') return { ok: false, error: `其他費用第 ${i + 1} 筆格式錯誤` }
    const name = parseRequiredString(fee.name, `其他費用第 ${i + 1} 筆名稱`, L.extraFeeName)
    if (!name.ok) return name
    const unit = parseOptionalString(fee.unit, `其他費用「${name.value}」單位`, L.extraFeeUnit)
    if (!unit.ok) return unit
    const amount = parseNonNegativeNumber(fee.amount, `其他費用「${name.value}」金額`)
    if (!amount.ok) return amount
    fees.push({ name: name.value, amount: amount.value, unit: unit.value ?? '' })
  }
  return { ok: true, value: fees }
}

/**
 * 驗證並正規化標準售價輸入，回傳可直接寫入 standard_price_items 的欄位物件
 * （不含 id / created_at / updated_at / updated_by，由呼叫端補上）。
 *
 * - 字串一律 trim；選填字串空值 → null
 * - 數字欄位：''/null → null；非數字或負數 → 400
 * - effective_date：YYYY-MM-DD 或 YYYY/MM/DD，必須是真實日期，輸出 YYYY-MM-DD
 * - 備註三欄位（notes / notes_image_urls / notes_table_data）用 validateRichContent() 驗證；
 *   partial 模式下三者任一有送到才整批驗證，且只回傳有送到的那幾個欄位
 *   （比照 PATCH /api/cards/[id] Step 45 的做法，避免只改文字時把既有圖片/表格清空）
 */
export function validateStandardPriceInput(
  body: unknown,
  options: StandardPriceValidationOptions = {},
): StandardPriceValidationResult {
  const { partial = false, includeRichNotes = true } = options
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, error: '資料格式錯誤', status: 400 }
  }
  const input = body as Record<string, unknown>
  const data: Record<string, unknown> = {}
  const fail = (error: string): StandardPriceValidationResult => ({ ok: false, error, status: 400 })
  // partial 模式下沒送到的欄位直接略過；完整模式一律處理（必填欄位會在解析時報錯）
  const has = (key: string) => !partial || input[key] !== undefined

  // ── 必填欄位 ────────────────────────────────────────────
  if (has('name')) {
    const r = parseRequiredString(input.name, '產品名稱', L.name)
    if (!r.ok) return fail(r.error)
    data.name = r.value
  }
  if (has('category')) {
    const r = parseRequiredString(input.category, '分類', L.category)
    if (!r.ok) return fail(r.error)
    data.category = r.value
  }
  if (has('effective_date')) {
    const r = parseEffectiveDate(input.effective_date)
    if (!r.ok) return fail(r.error)
    data.effective_date = r.value
  }

  // ── 選填文字欄位 ─────────────────────────────────────────
  for (const key of STANDARD_PRICE_TEXT_FIELDS) {
    if (!has(key)) continue
    const r = parseOptionalString(input[key], TEXT_FIELD_LABELS[key], L[key])
    if (!r.ok) return fail(r.error)
    data[key] = r.value
  }

  // ── 數字欄位 ────────────────────────────────────────────
  for (const key of STANDARD_PRICE_NUMBER_FIELDS) {
    if (!has(key)) continue
    const r = parseNonNegativeNumber(input[key], NUMBER_FIELD_LABELS[key])
    if (!r.ok) return fail(r.error)
    data[key] = r.value
  }

  // ── 其他費用 ────────────────────────────────────────────
  if (has('extra_fees')) {
    const r = validateExtraFees(input.extra_fees)
    if (!r.ok) return fail(r.error)
    data.extra_fees = r.value
  }

  // ── 備註（複合內容） ─────────────────────────────────────
  const notesKeys = includeRichNotes ? ['notes', 'notes_image_urls', 'notes_table_data'] : ['notes']
  if (notesKeys.some((k) => has(k))) {
    const v = validateRichContent({
      content: input.notes,
      image_urls: includeRichNotes ? input.notes_image_urls : undefined,
      table_data: includeRichNotes ? input.notes_table_data : undefined,
    })
    if (!v.ok) return { ok: false, error: `備註：${v.error}`, status: v.status }
    if (has('notes')) data.notes = v.content
    if (includeRichNotes && has('notes_image_urls')) data.notes_image_urls = v.images
    if (includeRichNotes && has('notes_table_data')) data.notes_table_data = v.table
  }

  return { ok: true, data }
}

/** Postgres unique_violation（(name, effective_date) 重複）的 409 訊息 */
export const DUPLICATE_VERSION_MESSAGE = '此產品在相同生效日期已有一個版本（產品名稱＋生效日期不可重複），請改用其他生效日期或直接編輯該版本'
