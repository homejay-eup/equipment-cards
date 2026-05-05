import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/admin/users — 列出所有使用者（含角色）
export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabase()

  // 從 auth.users 取得 email + last_sign_in_at
  const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers()
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 })
  }

  // 從 profiles 取得 role
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, role')

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 })
  }

  const roleMap = new Map(profiles?.map(p => [p.id, p.role]) ?? [])

  const users = authUsers.users.map(u => ({
    id: u.id,
    email: u.email ?? '',
    role: roleMap.get(u.id) ?? 'viewer',
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
  }))

  // 依建立時間排序
  users.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())

  return NextResponse.json(users)
}

// PATCH /api/admin/users — 更新使用者角色
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id, role } = await req.json()
  if (!id || !['admin', 'viewer'].includes(role)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { error } = await supabase
    .from('profiles')
    .upsert({ id, role }, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
