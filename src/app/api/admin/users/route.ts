import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, isAllowedDomain, getAssignableRolesData } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 取得目前登入者的角色資訊（level + department_id）
async function getCallerRoleInfo(): Promise<{ level: string; department_id: string | null } | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email || !isAllowedDomain(user.email)) return null

  const service = getSupabase()
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!emailData?.role) return null

  const { data: roleData } = await service
    .from('roles')
    .select('level, department_id')
    .eq('name', emailData.role)
    .single()

  if (!roleData) return null
  return roleData as { level: string; department_id: string | null }
}

// 依 caller 身分過濾可見的 allowed_emails 範圍：
// super_admin 看全部；dept_admin 只看同部門角色對應的帳號；其他（不應進入此頁，requireAdmin 已擋）回傳空
async function fetchAllowedEmails(
  callerLevel: string | null,
  callerDepartmentId: string | null,
) {
  const service = getSupabase()

  if (callerLevel === 'super_admin') {
    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  if (callerLevel === 'dept_admin' && callerDepartmentId) {
    const { data: deptRoles } = await service
      .from('roles')
      .select('name')
      .eq('department_id', callerDepartmentId)
    const deptRoleNames = (deptRoles ?? []).map((r: { name: string }) => r.name)

    if (deptRoleNames.length === 0) return []

    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .in('role', deptRoleNames)
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  return []
}

// 撈 Supabase Auth 使用者清單，取初始登入/最後登入時間，用 email 建 map
async function fetchAuthTimestamps() {
  const service = getSupabase()
  const map = new Map<string, { auth_created_at: string | null; last_sign_in_at: string | null }>()

  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = data?.users ?? []
    if (users.length === 0) break
    for (const u of users) {
      if (!u.email) continue
      map.set(u.email.toLowerCase(), {
        auth_created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }
    if (users.length < perPage) break
    page += 1
  }

  return map
}

// GET /api/admin/users — 帳號管理分頁初始資料（清單 + 目前使用者 email + 可指派角色 + 權限 + 是否可同步）
export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = createSupabaseServerClient()
  const [{ data: { user } }, callerRole] = await Promise.all([
    supabase.auth.getUser(),
    getCallerRoleInfo(),
  ])

  if (!user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const callerLevel = callerRole?.level ?? null
  const callerDepartmentId = callerRole?.department_id ?? null

  const [allowedEmails, assignableRoles, authTimestamps] = await Promise.all([
    fetchAllowedEmails(callerLevel, callerDepartmentId),
    getAssignableRolesData(user.email),
    fetchAuthTimestamps(),
  ])

  const users = allowedEmails.map(u => ({
    ...u,
    ...(authTimestamps.get(u.email.toLowerCase()) ?? { auth_created_at: null, last_sign_in_at: null }),
  }))

  return NextResponse.json({
    users,
    currentUserEmail: user.email,
    availableRoles: assignableRoles.map(r => r.name),
    canSyncUsers: callerLevel === 'super_admin',
  })
}

// POST /api/admin/users — 新增 email
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, role } = await req.json()
  const normalizedEmail = email?.trim().toLowerCase()

  if (!normalizedEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Email 格式不正確' }, { status: 400 })
  }
  const resolvedRole = role ?? '一般使用者'
  if (!resolvedRole) {
    return NextResponse.json({ error: '角色參數錯誤' }, { status: 400 })
  }

  // dept_admin 只能指派同 department 且 level = member/viewer 的角色
  const callerRole = await getCallerRoleInfo()
  if (!callerRole) {
    return NextResponse.json({ error: '無法驗證操作者角色' }, { status: 403 })
  }
  if (callerRole.level !== 'super_admin') {
    const { data: targetRoleData } = await getSupabase()
      .from('roles')
      .select('level, department_id')
      .eq('name', resolvedRole)
      .single()

    if (!targetRoleData) {
      return NextResponse.json({ error: '指定角色不存在' }, { status: 400 })
    }

    const target = targetRoleData as { level: string; department_id: string | null }
    const isDeptAdmin = callerRole.level === 'dept_admin'
    const sameDept = target.department_id === callerRole.department_id
    const allowedLevel = target.level === 'member' || target.level === 'viewer'

    if (!isDeptAdmin || !sameDept || !allowedLevel) {
      return NextResponse.json({ error: '無權指派此角色' }, { status: 403 })
    }
  }

  const { error } = await getSupabase()
    .from('allowed_emails')
    .insert({ email: normalizedEmail, role: resolvedRole })

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: '此 Email 已加入' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 新增的 email 若已有 Auth 登入紀錄（例如原本就是公司網域帳號，只是現在才被指派角色），
  // 一併查出來回傳，避免畫面先顯示「尚未登入」等重新整理才更新
  const authInfo = await findAuthTimestamps(normalizedEmail)

  return NextResponse.json({ success: true, ...authInfo })
}

// 分頁掃描 Auth 使用者清單，找出單一 email 的登入時間戳（Admin API 沒有直接依 email 查詢的方法）
async function findAuthTimestamps(email: string) {
  const service = getSupabase()
  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = data?.users ?? []
    const match = users.find((u) => u.email?.toLowerCase() === email)
    if (match) {
      return { auth_created_at: match.created_at ?? null, last_sign_in_at: match.last_sign_in_at ?? null }
    }
    if (users.length < perPage) break
    page += 1
  }
  return { auth_created_at: null, last_sign_in_at: null }
}

// PATCH /api/admin/users — 更新角色
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email: rawEmail, role } = await req.json()
  const email = rawEmail?.trim().toLowerCase()
  if (!email || !role) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const { data: { user: callerUser } } = await createSupabaseServerClient().auth.getUser()
  if (callerUser?.email?.toLowerCase() === email) {
    return NextResponse.json({ error: '不可修改自己的角色' }, { status: 403 })
  }

  // dept_admin 只能指派同 department 且 level = member/viewer 的角色
  const callerRole = await getCallerRoleInfo()
  if (!callerRole) {
    return NextResponse.json({ error: '無法驗證操作者角色' }, { status: 403 })
  }
  if (callerRole.level !== 'super_admin') {
    // 非 super_admin → 查目標角色的 level + department_id
    const { data: targetRoleData } = await getSupabase()
      .from('roles')
      .select('level, department_id')
      .eq('name', role)
      .single()

    if (!targetRoleData) {
      return NextResponse.json({ error: '指定角色不存在' }, { status: 400 })
    }

    const target = targetRoleData as { level: string; department_id: string | null }
    const isDeptAdmin = callerRole.level === 'dept_admin'
    const sameDept = target.department_id === callerRole.department_id
    const allowedLevel = target.level === 'member' || target.level === 'viewer'

    if (!isDeptAdmin || !sameDept || !allowedLevel) {
      return NextResponse.json({ error: '無權指派此角色' }, { status: 403 })
    }
  }

  const { error } = await getSupabase()
    .from('allowed_emails')
    .update({ role })
    .eq('email', email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/users — 移除 email
export async function DELETE(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email } = await req.json()
  if (!email) return NextResponse.json({ error: '參數錯誤' }, { status: 400 })

  const { data: { user: callerUser } } = await createSupabaseServerClient().auth.getUser()
  if (callerUser?.email?.toLowerCase() === email.toLowerCase()) {
    return NextResponse.json({ error: '不可刪除自己的帳號' }, { status: 403 })
  }

  const { error } = await getSupabase()
    .from('allowed_emails')
    .delete()
    .eq('email', email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
