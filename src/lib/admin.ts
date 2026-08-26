import { createClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
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

// 持續性白名單檢查：非公司網域帳號若已被移出 allowed_emails，即使 session 仍有效也強制登出
// 只在渲染完整頁面內容的入口 Server Component 呼叫（非公司網域才需要檢查，公司網域一律放行）
export async function assertStillAuthorized(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  email: string | null | undefined,
): Promise<void> {
  if (!email) return
  if (await isEmailAllowedToLogin(email)) return
  await supabase.auth.signOut()
  redirect('/login?error=unauthorized')
}

// 透過 roles + role_permissions 查權限
// 若 roles 表不存在或找不到角色 → 依舊 role 名稱做 fallback
// userEmail：呼叫端若已經呼叫過 supabase.auth.getUser() 拿到 email，直接傳入省一次重複的 auth 往返；
// 不傳則退回原本自己查一次 auth.getUser()（維持向後相容）
export async function getUserRoleWithPermissions(userEmail?: string | null): Promise<{ roleName: string; permissions: string[] }> {
  // 平行：（視情況）驗證 session + 預載所有角色權限資料
  const [email, rolesResult] = await Promise.all([
    userEmail !== undefined
      ? Promise.resolve(userEmail)
      : createSupabaseServerClient().auth.getUser().then(({ data }) => data.user?.email ?? null),
    getServiceClient()
      .from('roles')
      .select('name, role_permissions(permission_key)')
      .order('id', { ascending: true }),
  ])

  if (!email) return { roleName: '', permissions: VIEWER_PERMISSIONS }

  // 不再用網域降級決定權限：登入閘門 isEmailAllowedToLogin 已保證「非公司信箱一定要先被
  // 管理員加進 allowed_emails 才進得來」，所以這裡一律以 allowed_emails 指派的角色算權限，
  // 私人信箱（外包人員）指派的角色才會真正生效。未被指派角色者（公司預設 / 查無資料）
  // 會在下面的 fallback 落到 VIEWER_PERMISSIONS，不會誤放權。
  const { data: emailData } = await getServiceClient()
    .from('allowed_emails')
    .select('role')
    .eq('email', email)
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
  const { permissions } = await getUserRoleWithPermissions(user.email)
  return permissions.includes(key) ? user : null
}

export async function requireAdmin() {
  return requirePermission('manage_users')
}

export async function getUserRole(): Promise<'admin' | 'viewer' | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null

  // 與 getUserRoleWithPermissions 一致：不再用網域降級，一律以 allowed_emails 指派的角色決定
  // （非公司信箱能登入代表已在 allowed_emails；未指派者預設 viewer）
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

  // super_admin 一律看到全部角色，不管 assignable_role_names 是否有明確設定
  // （若放在下面的「明確設定清單優先」分支之後，assignable_role_names 一旦被設過就會
  // 卡住舊清單，新建立的角色永遠不會出現在 super_admin 可指派範圍內）
  if (level === 'super_admin') {
    const { data } = await service
      .from('roles')
      .select('id, name, is_system, department_id, level')
      .order('sort_order', { ascending: true, nullsFirst: false })
    return (data ?? []) as AssignableRoleRow[]
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
