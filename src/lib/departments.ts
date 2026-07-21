import { createClient } from '@supabase/supabase-js'

export function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/**
 * 查詢使用者「當下」的 department_id（比照 issues 表模式：
 * allowed_emails.role -> roles.department_id）。查詢失敗或無歸屬一律回 null，
 * 呼叫端應將 null 視為「無部門歸屬」並回空清單/拒絕寫入，不做例外放行（含管理員無例外）。
 */
export async function getCallerDepartmentId(email: string): Promise<string | null> {
  try {
    const service = getServiceClient()
    const { data: emailRow } = await service
      .from('allowed_emails')
      .select('role')
      .eq('email', email)
      .single()
    if (!emailRow?.role) return null

    const { data: roleRow } = await service
      .from('roles')
      .select('department_id')
      .eq('name', emailRow.role)
      .single()

    return (roleRow as { department_id: string | null } | null)?.department_id ?? null
  } catch {
    return null
  }
}
