// Step 46：新增/編輯標準售價表單的狀態轉換與前端驗證（API 端仍會再驗證一次）
import type { StandardPriceInput, StandardPriceItem, StandardPriceNumberField } from '@/types/standardPrice'
import {
  STANDARD_PRICE_LIMITS as L,
  parseEffectiveDate,
  parseNonNegativeNumber,
} from '@/lib/standardPriceFormat'

export interface ExtraFeeRow {
  key: string
  name: string
  amount: string
  unit: string
}

export interface PriceFormState {
  name: string
  category: string
  plan_name: string
  effective_date: string
  buyout_list_price: string
  buyout_sales_price: string
  buyout_manager_price: string
  warranty: string
  rent_monthly: string
  rent_contract: string
  platform_fee_buyout: string
  platform_fee_rent: string
  install_fee: string
  points_buyout: string
  points_rent: string
  notes: string
  extra_fees: ExtraFeeRow[]
}

export const NUMBER_LABELS: Record<StandardPriceNumberField, string> = {
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

let rowSeq = 0
export function newFeeRow(name = '', amount = '', unit = ''): ExtraFeeRow {
  rowSeq += 1
  return { key: `fee-${Date.now()}-${rowSeq}`, name, amount, unit }
}

const num = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n))

export function formFromItem(item?: StandardPriceItem): PriceFormState {
  return {
    name: item?.name ?? '',
    category: item?.category ?? '',
    plan_name: item?.plan_name ?? '',
    effective_date: item?.effective_date ?? '',
    buyout_list_price: num(item?.buyout_list_price),
    buyout_sales_price: num(item?.buyout_sales_price),
    buyout_manager_price: num(item?.buyout_manager_price),
    warranty: item?.warranty ?? '',
    rent_monthly: num(item?.rent_monthly),
    rent_contract: item?.rent_contract ?? '',
    platform_fee_buyout: num(item?.platform_fee_buyout),
    platform_fee_rent: num(item?.platform_fee_rent),
    install_fee: num(item?.install_fee),
    points_buyout: num(item?.points_buyout),
    points_rent: num(item?.points_rent),
    notes: item?.notes ?? '',
    extra_fees: (item?.extra_fees ?? []).map((f) => newFeeRow(f.name, num(f.amount), f.unit ?? '')),
  }
}

const NUMBER_KEYS = Object.keys(NUMBER_LABELS) as StandardPriceNumberField[]

/**
 * 驗證表單並轉成 API body（不含備註圖片/表格，由呼叫端補上）。
 * 失敗回傳第一個錯誤訊息。
 */
export function buildPayload(form: PriceFormState): { ok: true; payload: StandardPriceInput } | { ok: false; error: string } {
  const name = form.name.trim()
  const category = form.category.trim()
  if (!name) return { ok: false, error: '產品名稱為必填' }
  if (name.length > L.name) return { ok: false, error: `產品名稱最多 ${L.name} 字` }
  if (!category) return { ok: false, error: '分類為必填' }
  if (category.length > L.category) return { ok: false, error: `分類最多 ${L.category} 字` }
  const date = parseEffectiveDate(form.effective_date)
  if (!date.ok) return { ok: false, error: date.error }

  const texts = [
    ['plan_name', '方案名稱', L.plan_name],
    ['warranty', '保固', L.warranty],
    ['rent_contract', '合約期', L.rent_contract],
  ] as const
  for (const [key, label, max] of texts) {
    if (form[key].trim().length > max) return { ok: false, error: `${label}最多 ${max} 字` }
  }

  const payload: StandardPriceInput = {
    name,
    category,
    effective_date: date.value,
    plan_name: form.plan_name.trim() || null,
    warranty: form.warranty.trim() || null,
    rent_contract: form.rent_contract.trim() || null,
    notes: form.notes.trim() || null,
  }

  for (const key of NUMBER_KEYS) {
    const r = parseNonNegativeNumber(form[key], NUMBER_LABELS[key])
    if (!r.ok) return { ok: false, error: r.error }
    payload[key] = r.value
  }

  // 其他費用：完全空白的列直接略過
  const fees = form.extra_fees.filter((f) => f.name.trim() || f.amount.trim() || f.unit.trim())
  if (fees.length > L.extraFeesMax) return { ok: false, error: `其他費用最多 ${L.extraFeesMax} 筆` }
  const extra: StandardPriceInput['extra_fees'] = []
  for (let i = 0; i < fees.length; i++) {
    const f = fees[i]
    const feeName = f.name.trim()
    if (!feeName) return { ok: false, error: `其他費用第 ${i + 1} 筆缺少名稱` }
    if (feeName.length > L.extraFeeName) return { ok: false, error: `其他費用名稱最多 ${L.extraFeeName} 字` }
    const unit = f.unit.trim()
    if (unit.length > L.extraFeeUnit) return { ok: false, error: `其他費用單位最多 ${L.extraFeeUnit} 字` }
    const amount = parseNonNegativeNumber(f.amount, `其他費用「${feeName}」金額`)
    if (!amount.ok) return { ok: false, error: amount.error }
    extra.push({ name: feeName, amount: amount.value, unit })
  }
  payload.extra_fees = extra

  return { ok: true, payload }
}
