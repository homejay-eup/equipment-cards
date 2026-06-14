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
// 支援更新 name 或 department_id（至少需傳入其一）
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

  const { name, department_id } = body as { name?: unknown; department_id?: unknown }

  // 驗證：至少需要 name 或 department_id 其中一個
  const hasName = name !== undefined
  const hasDepartmentId = department_id !== undefined

  if (!hasName && !hasDepartmentId) {
    return NextResponse.json({ error: '請提供 name 或 department_id' }, { status: 400 })
  }

  if (hasName && (typeof name !== 'string' || (name as string).trim() === '')) {
    return NextResponse.json({ error: '角色名稱不可為空' }, { status: 400 })
  }

  if (hasDepartmentId && department_id !== null && typeof department_id !== 'string') {
    return NextResponse.json({ error: 'department_id 必須為字串或 null' }, { status: 400 })
  }

  const supabase = getSupabase()

  // 若提供 department_id（非 null），驗證存在
  if (hasDepartmentId && department_id !== null) {
    const { data: deptExists } = await supabase
      .from('departments')
      .select('id')
      .eq('id', department_id as string)
      .single()
    if (!deptExists) {
      return NextResponse.json({ error: '指定的部門不存在' }, { status: 400 })
    }
  }

  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id, name, is_system')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到角色' }, { status: 404 })
  }

  const updateFields: Record<string, unknown> = {}
  if (hasName) updateFields.name = (name as string).trim()
  if (hasDepartmentId) updateFields.department_id = (department_id as string | null)

  const { data: updated, error: updateError } = await supabase
    .from('roles')
    .update(updateFields)
    .eq('id', id)
    .select('id, name, department_id')
    .single()

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 })
  }

  // D5：若角色有重命名，cascade 更新 allowed_emails.role
  const originalName = (role as { id: string; name: string; is_system: boolean }).name
  if (hasName && typeof updateFields.name === 'string' && updateFields.name !== originalName) {
    const newName = updateFields.name as string

    const { error: cascadeError } = await supabase
      .from('allowed_emails')
      .update({ role: newName })
      .eq('role', originalName)

    if (cascadeError) {
      console.error('[roles] cascade allowed_emails update failed:', cascadeError)
      return NextResponse.json({
        ...updated,
        warning: 'roles 已重命名，但 allowed_emails 同步失敗，請手動確認',
      })
    }

    // cascade assignable_role_names：把其他角色陣列裡的舊名換成新名
    const { data: rolesWithOldName } = await supabase
      .from('roles')
      .select('id, assignable_role_names')
      .contains('assignable_role_names', [originalName])

    const cascadeFailedIds: string[] = []
    for (const r of rolesWithOldName ?? []) {
      const refreshed = (r.assignable_role_names as string[]).map(
        (n: string) => (n === originalName ? newName : n),
      )
      const { error: cascadeItemError } = await supabase
        .from('roles').update({ assignable_role_names: refreshed }).eq('id', r.id)
      if (cascadeItemError) cascadeFailedIds.push(r.id as string)
    }

    if (cascadeFailedIds.length > 0) {
      return NextResponse.json({
        ...updated,
        warning: `roles 已重命名，但以下角色的 assignable_role_names 同步失敗，請手動確認：${cascadeFailedIds.join(', ')}`,
      })
    }
  }

  return NextResponse.json(updated)
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

  // cascade assignable_role_names：清除其他角色陣列裡的殘留名稱
  const { data: rolesWithName } = await supabase
    .from('roles')
    .select('id, assignable_role_names')
    .contains('assignable_role_names', [role.name])

  const cascadeFailedIds: string[] = []
  for (const r of rolesWithName ?? []) {
    const cleaned = (r.assignable_role_names as string[]).filter(
      (n: string) => n !== role.name,
    )
    const { error: cascadeItemError } = await supabase
      .from('roles').update({ assignable_role_names: cleaned }).eq('id', r.id)
    if (cascadeItemError) cascadeFailedIds.push(r.id as string)
  }

  if (cascadeFailedIds.length > 0) {
    return NextResponse.json({
      success: true,
      warning: `角色已刪除，但以下角色的 assignable_role_names 清除失敗，請手動確認：${cascadeFailedIds.join(', ')}`,
    })
  }

  return NextResponse.json({ success: true })
}
