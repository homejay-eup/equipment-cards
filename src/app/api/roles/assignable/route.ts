import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { isAllowedDomain, getAssignableRolesData } from '@/lib/admin'

// GET /api/roles/assignable
// 回傳目前使用者可指派給別人的角色清單
// - super_admin → 所有角色
// - dept_admin  → 同 dept_group 且 level IN ('member','viewer') 的角色
// - 其他        → 空陣列
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user?.email || !isAllowedDomain(user.email)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const roles = await getAssignableRolesData(user.email)
  return NextResponse.json(roles)
}
