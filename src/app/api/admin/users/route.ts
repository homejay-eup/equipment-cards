import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const ALLOWED_DOMAIN = '@eup.com.tw'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 取得目前登入者的角色資訊（level + dept_group）
async function getCallerRoleInfo(): Promise<{ level: string; dept_group: string | null } | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email || !user.email.endsWith(ALLOWED_DOMAIN)) return null

  const service = getSupabase()
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!emailData?.role) return null

  const { data: roleData } = await service
    .from('roles')
    .select('level, dept_group')
    .eq('name', emailData.role)
    .single()

  if (!roleData) return null
  return roleData as { level: string; dept_group: string | null }
}

// GET /api/admin/users
export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getSupabase()
    .from('allowed_emails')
    .select('email, role, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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

  // Step 23：dept_admin 只能指派同 dept_group 且 level = member/viewer 的角色
  const callerRole = await getCallerRoleInfo()
  if (!callerRole) {
    return NextResponse.json({ error: '無法驗證操作者角色' }, { status: 403 })
  }
  if (callerRole.level !== 'super_admin') {
    const { data: targetRoleData } = await getSupabase()
      .from('roles')
      .select('level, dept_group')
      .eq('name', resolvedRole)
      .single()

    if (!targetRoleData) {
      return NextResponse.json({ error: '指定角色不存在' }, { status: 400 })
    }

    const target = targetRoleData as { level: string; dept_group: string | null }
    const isDeptAdmin = callerRole.level === 'dept_admin'
    const sameGroup = target.dept_group === callerRole.dept_group
    const allowedLevel = target.level === 'member' || target.level === 'viewer'

    if (!isDeptAdmin || !sameGroup || !allowedLevel) {
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

  return NextResponse.json({ success: true })
}

// PATCH /api/admin/users — 更新角色
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { email, role } = await req.json()
  if (!email || !role) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  // Step 23：dept_admin 只能指派同 dept_group 且 level = member/viewer 的角色
  const callerRole = await getCallerRoleInfo()
  if (!callerRole) {
    return NextResponse.json({ error: '無法驗證操作者角色' }, { status: 403 })
  }
  if (callerRole.level !== 'super_admin') {
    // 非 super_admin → 查目標角色的 level + dept_group
    const { data: targetRoleData } = await getSupabase()
      .from('roles')
      .select('level, dept_group')
      .eq('name', role)
      .single()

    if (!targetRoleData) {
      return NextResponse.json({ error: '指定角色不存在' }, { status: 400 })
    }

    const target = targetRoleData as { level: string; dept_group: string | null }
    const isDeptAdmin = callerRole.level === 'dept_admin'
    const sameGroup = target.dept_group === callerRole.dept_group
    const allowedLevel = target.level === 'member' || target.level === 'viewer'

    if (!isDeptAdmin || !sameGroup || !allowedLevel) {
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

  const { error } = await getSupabase()
    .from('allowed_emails')
    .delete()
    .eq('email', email)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
