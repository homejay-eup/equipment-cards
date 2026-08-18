// Step 38/39：維修資訊管理 共用「純函式」工具（不依賴 server-only 模組，client component 可安全 import）
//
// 注意：這個檔案刻意跟 src/lib/maintenance.ts 的 isLoggedIn() 分開。
// isLoggedIn() 內部動態 import '@/lib/supabase-server'（依賴 next/headers），
// Next.js 對 client component 可 reach 到的模組會做 server/client 邊界靜態分析，
// 即使是動態 import() 也會被追蹤到，一旦有 client component 經由任何路徑 import 到
// maintenance.ts，build 就會因為「You're importing a component that needs next/headers」失敗。
// 因此純格式化/判斷函式獨立放這裡，client component（例如 RuleCard.tsx）直接從這裡 import。

const SIX_MONTHS_MS = 1000 * 60 * 60 * 24 * 30 * 6

/**
 * 過時判斷：取 last_updated_at 與 confirmed_at 較新者，超過 6 個月即建議覆核。
 */
export function computeNeedsReview(
  lastUpdatedAt: string | null | undefined,
  confirmedAt: string | null | undefined,
): boolean {
  const lastUpdatedTime = lastUpdatedAt ? new Date(lastUpdatedAt).getTime() : 0
  const confirmedTime = confirmedAt ? new Date(confirmedAt).getTime() : 0
  const mostRecent = Math.max(lastUpdatedTime, confirmedTime)
  if (!mostRecent) return true
  return Date.now() - mostRecent > SIX_MONTHS_MS
}

export const VALID_MAINTENANCE_RULE_TYPES = ['送修規則', '保固說明', '報廢條件', '其他'] as const

/**
 * Step 39：保固期間上限（月數）＝ 100 年。純防呆用途，避免使用者誤填超大數字
 * 造成畫面顯示異常（例如「83333333 年 3 個月」）或資料庫存入無意義的極端值。
 * API route（POST/PATCH）與 RuleFormDialog 皆引用此常數，維持上限一致。
 */
export const MAX_WARRANTY_PERIOD_MONTHS = 1200

/**
 * Step 39：保固期間（月數）換算成人類可讀格式，例如 18 -> "1 年 6 個月"、24 -> "2 年"、6 -> "6 個月"。
 * null/undefined 回傳 null，呼叫端據此決定是否顯示這行。
 */
export function formatWarrantyPeriod(months: number | null | undefined): string | null {
  if (months === null || months === undefined) return null
  if (months < 12) return `${months} 個月`
  if (months % 12 === 0) return `${months / 12} 年`
  return `${Math.floor(months / 12)} 年 ${months % 12} 個月`
}
