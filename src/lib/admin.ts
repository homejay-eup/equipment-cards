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
  'use_bookmarks', 'create_delete_cards',
  'manage_users', 'manage_roles', 'use_groups',
]
const VIEWER_PERMISSIONS = [
  'read_active_only',
]

const ALLOWED_DOMAINS = ['eup.com.tw', 'eup.net.vn']

export function isAllowedDomain(email: string): boolean {
  const domain = email.split('@')[1]
  return !!domain && ALLOWED_DOMAINS.includes(domain)
}

// 登入闸门：公司網域 email 一律放行；非公司網域則需已被管理員明確加入 allowed_emails
export async function isEmailAllowedToLogin(email: string): Promise<boolean> {
  const normalized = email.toLowerCase()
  if (isAllowedDomain(normalized)) return true
  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('email')
    .eq('email', normalized)
    .single()
  return !!data
}

// 透過 roles + role_permissions 查權限
// 若 roles 表不存在或找不到角色 → 依舊 role 名稱做 fallback
export async function getUserRoleWithPermissions(): Promise<{ roleName: string; permissions: string[] }> {
  const supabase = createSupabaseServerClient()

  // 平行：驗證 session + 預載所有角色權限資料
  const [{ data: { user } }, rolesResult] = await Promise.all([
    supabase.auth.getUser(),
    getServiceClient()
      .from('roles')
      .select('name, role_permissions(permission_key)')
      .order('id', { ascending: true }),
  ])

  if (!user?.email) return { roleName: '', permissions: VIEWER_PERMISSIONS }
  if (!isAllowedDomain(user.email)) return { roleName: '', permissions: VIEWER_PERMISSIONS }

  const { data: emailData } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  const roleName = emailData?.role ?? ''

  // 從預載的 roles 資料比對（省去第三次 DB 往返）
  const roleRow = rolesResult.data?.find((r: { name: string; role_permissions: { permission_key: string }[] }) => r.name === roleName)
  if (roleRow && Array.isArray(roleRow.role_permissions)) {
    const permissions = roleRow.role_permissions.map((p: { permission_key: string }) => p.permission_key)
    return { roleName, permissions }
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

  // 非公司信箱：無權限（嚴格比對 domain）
  if (!isAllowedDomain(user.email)) return null

  const { data } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  // allowed_emails 有記錄就用指定角色，否則公司信箱預設 viewer
  if (data?.role === 'admin') return 'admin'
  return 'viewer'
}

export interface AssignableRoleRow {
  id: string
  name: string
  is_system: boolean
  department_id: string | null
  level: string | null
}

/**
 * 依目前登入者的 level/department_id/assignable_role_names 回傳可指派的角色清單。
 * 直接接受 email，使用 service client 查詢（可用於 SSR 或 API route）。
 */
export async function getAssignableRolesData(userEmail: string): Promise<AssignableRoleRow[]> {
  const service = getServiceClient()

  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', userEmail)
    .single()

  if (!emailData?.role) return []

  const { data: roleData, error: roleError } = await service
    .from('roles')
    .select('id, name, is_system, department_id, level, assignable_role_names')
    .eq('name', emailData.role)
    .single()

  if (roleError || !roleData) return []

  const { level, department_id, assignable_role_names } = roleData as {
    id: string; name: string; is_system: boolean
    department_id: string | null; level: string
    assignable_role_names: string[] | null
  }

  // 優先：明確設定的清單
  if (assignable_role_names && assignable_role_names.length > 0) {
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, department_id, level')
      .in('name', assignable_role_names)
      .order('sort_order', { ascending: true, nullsFirst: false })
    return (data ?? []) as AssignableRoleRow[]
  }

  // Fallback：依 level
  if (level === 'super_admin') {
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, department_id, level')
      .order('sort_order', { ascending: true, nullsFirst: false })
    return (data ?? []) as AssignableRoleRow[]
  }

  if (level === 'dept_admin') {
    if (!department_id) return []
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, department_id, level')
      .eq('department_id', department_id)
      .in('level', ['member', 'viewer'])
      .order('sort_order', { ascending: true, nullsFirst: false })
    return (data ?? []) as AssignableRoleRow[]
  }

  return []
}
