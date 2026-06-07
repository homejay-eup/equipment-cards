import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const ALLOWED_DOMAIN = '@eup.com.tw'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/roles/assignable
// 回傳目前使用者可指派給別人的角色清單
// - super_admin → 所有角色
// - dept_admin  → 同 dept_group 且 level IN ('member','viewer') 的角色
// - 其他        → 空陣列
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email || !user.email.endsWith(ALLOWED_DOMAIN)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const service = getServiceClient()

  // 取得目前使用者的角色名稱
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', user.email)
    .single()

  if (!emailData?.role) {
    return NextResponse.json([])
  }

  // 取得該角色的 dept_group + level
  const { data: roleData, error: roleError } = await service
    .from('roles')
    .select('id, name, is_system, dept_group, level')
    .eq('name', emailData.role)
    .single()

  if (roleError || !roleData) {
    return NextResponse.json([])
  }

  const { level, dept_group } = roleData as {
    id: string
    name: string
    is_system: boolean
    dept_group: string | null
    level: string
  }

  if (level === 'super_admin') {
    // super_admin 可指派所有角色
    const { data, error } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  if (level === 'dept_admin') {
    // dept_admin 只能指派同 dept_group 且 level IN ('member','viewer') 的角色
    if (!dept_group) return NextResponse.json([])
    const { data, error } = await service
      .from('roles')
      .select('id, name, is_system, dept_group, level')
      .eq('dept_group', dept_group)
      .in('level', ['member', 'viewer'])
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data ?? [])
  }

  // member / viewer 或其他：無指派權限
  return NextResponse.json([])
}
