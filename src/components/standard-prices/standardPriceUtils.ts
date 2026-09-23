// Step 46：標準售價前端共用小工具（分組、現行版本、金額格式化、合併 API 回傳結果）
import type { StandardPriceItem } from '@/types/standardPrice'

/** 千分位（不含單位）；null/undefined → null */
export function formatNumber(n: number | null | undefined): string | null {
  if (n === null || n === undefined || !Number.isFinite(n)) return null
  return n.toLocaleString('zh-TW', { maximumFractionDigits: 2 })
}

/** 千分位 + 單位，例：6,800 元、280 元/月；null → null */
export function formatWithUnit(n: number | null | undefined, unit: string): string | null {
  const s = formatNumber(n)
  return s === null ? null : `${s} ${unit}`
}

/** YYYY-MM-DD → YYYY/MM/DD */
export function formatDate(date: string): string {
  return date.replace(/-/g, '/')
}

/** 依 effective_date 由新到舊排序（YYYY-MM-DD 字串可直接比較） */
function byDateDesc(a: StandardPriceItem, b: StandardPriceItem): number {
  return b.effective_date.localeCompare(a.effective_date)
}

/** 依產品名稱分組，每組版本由新到舊；第 0 筆＝現行版本 */
export function groupVersionsByName(items: StandardPriceItem[]): Map<string, StandardPriceItem[]> {
  const map = new Map<string, StandardPriceItem[]>()
  for (const item of items) {
    const list = map.get(item.name)
    if (list) list.push(item)
    else map.set(item.name, [item])
  }
  map.forEach((list) => list.sort(byDateDesc))
  return map
}

/** 清單列顯示用的代表價格：買斷定價優先，沒有才顯示月租 */
export function headlinePrice(item: StandardPriceItem): string | null {
  if (item.buyout_list_price !== null) return formatWithUnit(item.buyout_list_price, '元')
  if (item.rent_monthly !== null) return formatWithUnit(item.rent_monthly, '元/月')
  return null
}

/** 把 API 回傳的項目合併進現有清單：同 id 取代、沒有的新增 */
export function mergeItems(items: StandardPriceItem[], incoming: StandardPriceItem[]): StandardPriceItem[] {
  const incomingById = new Map(incoming.map((it) => [it.id, it]))
  const merged = items.map((it) => incomingById.get(it.id) ?? it)
  const existingIds = new Set(items.map((it) => it.id))
  for (const it of incoming) {
    if (!existingIds.has(it.id)) merged.push(it)
  }
  return merged
}

/** 中文排序（分類、產品名稱） */
export const zhCompare = (a: string, b: string) => a.localeCompare(b, 'zh-Hant')

/** 從 fetch 回應取出錯誤訊息（API 一律回 { error }） */
export async function readApiError(res: Response, fallback: string): Promise<string> {
  const data = await res.json().catch(() => null)
  if (data && typeof data.error === 'string' && data.error) {
    return data.error === 'Forbidden' ? '沒有權限執行此操作' : data.error
  }
  return fallback
}
