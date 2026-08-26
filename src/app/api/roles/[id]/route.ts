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

// 取得呼叫者自己那個角色的 level（用來判斷是否有權變更「其他角色的 level」，
// 不能只看 manage_roles 這個一般權限——level 本身就是一層更高的授權邊界，
// 例如 admin/users/route.ts 用 level === 'super_admin' 決定能不能跨部門指派角色，
// 若只要 manage_roles 就能把任一非系統角色（含自己所屬角色）的 level 改成
// super_admin，manage_roles 就形同能自我提權為 super_admin，即使該角色原本只
// 打算開放給部門管理員做角色改名/調整權限之類的局部管理）
async function getCallerLevel(email: string): Promise<string | null> {
  const service = getSupabase()
  const { data: emailData } = await service
    .from('allowed_emails')
    .select('role')
    .eq('email', email)
    .single()
  if (!emailData?.role) return null

  const { data: roleData } = await service
    .from('roles')
    .select('level')
    .eq('name', emailData.role)
    .single()
  return (roleData as { level: string | null } | null)?.level ?? null
}

// PATCH /api/roles/[id]
// 支援更新 name 或 department_id（至少需傳入其一）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const caller = await requirePermission('manage_roles')
  if (!caller) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { name, department_id, level } = body as { name?: unknown; department_id?: unknown; level?: unknown }

  // 驗證：至少需要 name、department_id、level 其中一個
  const hasName = name !== undefined
  const hasDepartmentId = department_id !== undefined
  const hasLevel = level !== undefined

  if (!hasName && !hasDepartmentId && !hasLevel) {
    return NextResponse.json({ error: '請提供 name、department_id 或 level' }, { status: 400 })
  }

  if (hasName && (typeof name !== 'string' || (name as string).trim() === '')) {
    return NextResponse.json({ error: '角色名稱不可為空' }, { status: 400 })
  }

  if (hasDepartmentId && department_id !== null && typeof department_id !== 'string') {
    return NextResponse.json({ error: 'department_id 必須為字串或 null' }, { status: 400 })
  }

  const VALID_LEVELS = ['super_admin', 'dept_admin', 'member', 'viewer']
  if (hasLevel && (typeof level !== 'string' || !VALID_LEVELS.includes(level))) {
    return NextResponse.json({ error: 'level 必須為 super_admin / dept_admin / member / viewer 其中之一' }, { status: 400 })
  }

  // level 是比一般權限更高的授權邊界（見上方 getCallerLevel 說明），只有呼叫者自己
  // 本身就是 super_admin 才能變更任何角色（含自己所屬角色）的 level，避免只靠
  // manage_roles 權限自我提權
  if (hasLevel) {
    const callerLevel = await getCallerLevel(caller.email!)
    if (callerLevel !== 'super_admin') {
      return NextResponse.json({ error: '只有管理員層級（super_admin）才能修改角色層級' }, { status: 403 })
    }
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

  // 系統角色（如「管理員」）的核心權限保護（見 /api/roles/[id]/permissions）是用
  // is_system && level === 'super_admin' 判斷，若允許改掉系統角色的 level 會讓這條保護失效
  if (hasLevel && (role as { is_system: boolean }).is_system) {
    return NextResponse.json({ error: '系統角色的層級不可修改' }, { status: 403 })
  }

  const updateFields: Record<string, unknown> = {}
  if (hasName) updateFields.name = (name as string).trim()
  if (hasDepartmentId) updateFields.department_id = (department_id as string | null)
  if (hasLevel) updateFields.level = level as string

  const { data: updated, error: updateError } = await supabase
    .from('roles')
    .update(updateFields)
    .eq('id', id)
    .select('id, name, department_id, level')
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
