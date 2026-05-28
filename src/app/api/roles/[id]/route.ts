import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// PATCH /api/roles/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const { name } = await req.json()

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: '角色名稱不可為空' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到角色' }, { status: 404 })
  }

  if (role.is_system) {
    return NextResponse.json({ error: '系統角色不可重命名' }, { status: 403 })
  }

  const { error: updateError } = await supabase
    .from('roles')
    .update({ name: name.trim() })
    .eq('id', id)

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

// DELETE /api/roles/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const supabase = getSupabase()

  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id, name, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到角色' }, { status: 404 })
  }

  if (role.is_system) {
    return NextResponse.json({ error: '系統角色不可刪除' }, { status: 403 })
  }

  // 確認沒有 allowed_emails 在使用此角色
  const { data: usersWithRole, error: usersError } = await supabase
    .from('allowed_emails')
    .select('email')
    .eq('role', role.name)

  if (usersError) {
    return NextResponse.json({ error: usersError.message }, { status: 500 })
  }

  if (usersWithRole && usersWithRole.length > 0) {
    const emails = usersWithRole.map((u) => u.email).join(', ')
    return NextResponse.json(
      { error: `角色仍有使用者，請先重新指派角色後再刪除。相關使用者：${emails}` },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase
    .from('roles')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
