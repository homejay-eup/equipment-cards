// Step 38：維修資訊管理 共用工具函式

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
 * 維修資訊讀取類 API 的權限門檻：所有已登入使用者皆可讀（一般人員唯讀瀏覽），
 * 沒有現成的通用「已登入」permission key，故直接檢查 session 是否存在。
 * 寫入類操作一律另外檢查 requirePermission('manage_maintenance_info')。
 */
export async function isLoggedIn(): Promise<boolean> {
  const { createSupabaseServerClient } = await import('@/lib/supabase-server')
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  return !!user?.email
}
