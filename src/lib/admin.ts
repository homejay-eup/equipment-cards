import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from './supabase-server'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 預設權限常數（SQL 執行前的 fallback）
const ADMIN_PERMISSIONS = [
  'read_all_cards',
  'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content',
  'use_bookmarks', 'crud_cards',
  'manage_users', 'manage_roles', 'use_groups',
]
const VIEWER_PERMISSIONS = [
  'read_active_only',
  'read_documents', 'read_notes', 'read_vendor',
  'use_bookmarks', 'use_groups',
]

const ALLOWED_DOMAIN = '@eup.com.tw'

// 透過 roles + role_permissions 查權限
// 若 roles 表不存在或找不到角色 → 依舊 role 名稱做 fallback
export async function getUserRoleWithPermissions(): Promise<{ roleName: string; permissions: string[] }> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { roleName: '', permissions: VIEWER_PERMISSIONS }

  if (!user.email.endsWith(ALLOWED_DOMAIN)) return { roleName: '', permissions: VIEWER_PERMISSIONS }

  const { data: emailData } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  const roleName = emailData?.role ?? ''

  // 嘗試從 roles 表查詢（SQL 執行後才存在）
  try {
    const { data: roleData, error } = await getServiceClient()
      .from('roles')
      .select('id, role_permissions(permission_key)')
      .eq('name', roleName)
      .single()

    if (!error && roleData && Array.isArray(roleData.role_permissions)) {
      const permissions = (roleData.role_permissions as { permission_key: string }[]).map(p => p.permission_key)
      return { roleName, permissions }
    }
  } catch {
    // roles 表不存在，走 fallback
  }

  // Fallback：SQL 執行前，依舊英文 role 名稱判斷
  if (roleName === 'admin' || roleName === '管理員') {
    return { roleName, permissions: ADMIN_PERMISSIONS }
  }
  return { roleName, permissions: VIEWER_PERMISSIONS }
}

// 檢查目前使用者是否有特定 permission
export async function requirePermission(key: string) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions()
  return permissions.includes(key) ? user : null
}

export async function requireAdmin() {
  return requirePermission('manage_users')
}

export async function getUserRole(): Promise<'admin' | 'viewer' | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  // 非公司信箱：無權限
  if (!user.email.endsWith(ALLOWED_DOMAIN)) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  // allowed_emails 有記錄就用指定角色，否則公司信箱預設 viewer
  if (data?.role === 'admin') return 'admin'
  return 'viewer'
}
