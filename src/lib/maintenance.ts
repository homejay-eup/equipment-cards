// Step 38：維修資訊管理 共用工具函式
//
// 純格式化/判斷函式已搬到 ./maintenanceFormat.ts（client component 安全 import），
// 這裡繼續 re-export 供既有 server-side（API routes）呼叫端相容；
// isLoggedIn() 依賴 next/headers，僅限 server 端使用，不得被 client component 直接或間接 import。

export { computeNeedsReview, VALID_MAINTENANCE_RULE_TYPES, formatWarrantyPeriod, MAX_WARRANTY_PERIOD_MONTHS } from './maintenanceFormat'

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
