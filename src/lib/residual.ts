// Step 53：設備殘值 伺服器專用共用工具（API Route 用）
//
// ⚠️ 這個檔案 import 了 supabase-server（next/headers）與 admin.ts，只能給 API Route／Server Component 使用，
// 不得被 client component 直接或間接 import。純函式／型別請放 residualValidation.ts、residualCalc.ts、types/residual.ts。
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { RESIDUAL_EDIT_PERMISSION, RESIDUAL_VIEW_PERMISSION } from '@/types/residual'

/** service_role client：兩張表全鎖（無 policy），讀寫一律走這個 client＋API 權限檢查 */
export function getResidualDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function isResidualUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value)
}

export const RESIDUAL_ITEM_COLUMNS = 'id, code, name, price, years, sort_order, updated_at, updated_by'

export type ResidualAuthResult =
  | { ok: true; email: string; canEdit: boolean }
  | { ok: false; response: NextResponse }

/**
 * API 入口的權限檢查：
 * - 'view'：view_residual 或 edit_residual
 * - 'edit'：edit_residual
 * 使用者身份一律從 session 取得。未登入回 401，沒權限回 403（body 一律 { error }）。
 */
export async function authorizeResidual(level: 'view' | 'edit'): Promise<ResidualAuthResult> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { ok: false, response: NextResponse.json({ error: '請先登入' }, { status: 401 }) }
  const { permissions } = await getUserRoleWithPermissions(user.email)
  const canEdit = permissions.includes(RESIDUAL_EDIT_PERMISSION)
  const canView = canEdit || permissions.includes(RESIDUAL_VIEW_PERMISSION)
  const allowed = level === 'edit' ? canEdit : canView
  if (!allowed) return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { ok: true, email: user.email, canEdit }
}

interface DbErrorLike { code?: string; message: string }

/** 資料表尚未建立（正式 DB 還沒執行 step53 SQL）→ 回中文訊息取代 Supabase 的英文錯誤 */
export function residualDbErrorMessage(error: DbErrorLike): string {
  if (error.code === 'PGRST205' || error.code === '42P01' || /residual_(items|meta)/.test(error.message)) {
    return '設備殘值資料表尚未建立，請聯繫管理員執行 Step 53 SQL'
  }
  return error.message
}

/** 把未預期的 DB 錯誤記 log 並回 500 */
export function residualServerError(context: string, error: DbErrorLike): NextResponse {
  console.error(`[residual/${context}]`, error)
  return NextResponse.json({ error: residualDbErrorMessage(error) }, { status: 500 })
}
