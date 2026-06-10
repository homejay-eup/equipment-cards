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

// PATCH /api/departments/[id]
// 重命名部門，需 manage_roles 權限
// body: { name: string }
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { name } = body as { name?: unknown }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: '部門名稱不可為空' }, { status: 400 })
  }

  const trimmedName = name.trim()
  const supabase = getSupabase()

  // 確認部門存在
  const { data: dept, error: fetchError } = await supabase
    .from('departments')
    .select('id, name')
    .eq('id', id)
    .single()

  if (fetchError || !dept) {
    return NextResponse.json({ error: '找不到部門' }, { status: 404 })
  }

  // 檢查名稱是否與其他部門重複（排除自己）
  const { data: duplicate } = await supabase
    .from('departments')
    .select('id')
    .eq('name', trimmedName)
    .neq('id', id)
    .single()

  if (duplicate) {
    return NextResponse.json({ error: '部門名稱已存在' }, { status: 409 })
  }

  const { data: updated, error: updateError } = await supabase
    .from('departments')
    .update({ name: trimmedName })
    .eq('id', id)
    .select('id, name, created_at')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  return NextResponse.json(updated)
}

// DELETE /api/departments/[id]
// 刪除部門，需 manage_roles 權限
// 若仍有角色的 department_id = id，回傳 409
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const supabase = getSupabase()

  // 確認部門存在
  const { data: dept, error: fetchError } = await supabase
    .from('departments')
    .select('id, name')
    .eq('id', id)
    .single()

  if (fetchError || !dept) {
    return NextResponse.json({ error: '找不到部門' }, { status: 404 })
  }

  // 確認沒有角色仍屬於此部門
  const { data: rolesInDept, error: rolesError } = await supabase
    .from('roles')
    .select('id')
    .eq('department_id', id)

  if (rolesError) {
    return NextResponse.json({ error: rolesError.message }, { status: 500 })
  }

  if (rolesInDept && rolesInDept.length > 0) {
    return NextResponse.json(
      { error: '仍有角色屬於此部門，請先重新分配後再刪除' },
      { status: 409 },
    )
  }

  const { error: deleteError } = await supabase
    .from('departments')
    .delete()
    .eq('id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
