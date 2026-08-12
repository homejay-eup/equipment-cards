import { NextRequest, NextResponse } from 'next/server'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── GET /api/packages ──────────────────────────────────────────
// 查詢「本部門套餐」清單（含內含料卡）
// 權限：view_own_packages 或 edit_own_packages（edit 隱含 view）
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  if (!authUser?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { permissions } = await getUserRoleWithPermissions()
  if (!permissions.includes('view_own_packages') && !permissions.includes('edit_own_packages')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const user = authUser

  const departmentId = await getCallerDepartmentId(user.email!)
  // 無部門歸屬（含管理員未設部門）→ 一律回空，無例外
  if (!departmentId) {
    return NextResponse.json([])
  }

  try {
    const supabase = getServiceClient()
    const { data, error } = await supabase
      .from('equipment_packages')
      .select('*, package_items(equipment_id, added_at, quantity, sort_order), package_shared_departments(department_id)')
      .eq('department_id', departmentId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('sort_order', { foreignTable: 'package_items', ascending: true })

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[packages] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── POST /api/packages ─────────────────────────────────────────
// 建立套餐（可帶 source_group_id 做「複製為套餐」）
// 權限：edit_own_packages
export async function POST(req: NextRequest) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: '您目前未歸屬任何部門，無法建立套餐' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const name: string | undefined = body?.name
    const sourceGroupId: string | undefined = body?.source_group_id

    if (!name?.trim()) {
      return NextResponse.json({ error: '套餐名稱為必填' }, { status: 400 })
    }

    const supabase = getServiceClient()

    let itemsToCopy: { equipment_id: string; quantity: number; sort_order: number }[] = []

    if (sourceGroupId) {
      // 驗證來源群組屬於此使用者
      const { data: group } = await supabase
        .from('user_groups')
        .select('id, user_id')
        .eq('id', sourceGroupId)
        .single()

      if (!group || group.user_id !== user.id) {
        return NextResponse.json({ error: '找不到來源群組' }, { status: 404 })
      }

      // 一個群組最多只能連結一份套餐：若已連結，回 409 並附現有套餐 id，前端改叫 align
      const { data: existingPackage } = await supabase
        .from('equipment_packages')
        .select('id')
        .eq('source_group_id', sourceGroupId)
        .maybeSingle()

      if (existingPackage) {
        return NextResponse.json(
          { error: '此群組已連結套餐，請改用「重新對齊套餐」', existing_package_id: existingPackage.id },
          { status: 409 },
        )
      }

      const { data: groupItems } = await supabase
        .from('group_items')
        .select('equipment_id, quantity, sort_order')
        .eq('group_id', sourceGroupId)

      itemsToCopy = (groupItems ?? []) as { equipment_id: string; quantity: number; sort_order: number }[]
    }

    const now = new Date().toISOString()
    const { data: pkg, error: insertError } = await supabase
      .from('equipment_packages')
      .insert({
        name: name.trim(),
        department_id: departmentId,
        source_group_id: sourceGroupId ?? null,
        source_synced_at: sourceGroupId ? now : null,
        created_by: user.email!,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        // 併發窗口：兩個請求同時通過「群組是否已連結套餐」的應用層檢查，
        // DB 的 partial unique index（equipment_packages_source_group_id_unique）擋下第二筆。
        // 判斷是哪種衝突：source_group_id 唯一約束 vs (department_id, name) 唯一約束。
        if (sourceGroupId) {
          const { data: existingPackage } = await supabase
            .from('equipment_packages')
            .select('id')
            .eq('source_group_id', sourceGroupId)
            .maybeSingle()
          if (existingPackage) {
            return NextResponse.json(
              { error: '此群組已連結套餐，請改用「重新對齊套餐」', existing_package_id: existingPackage.id },
              { status: 409 },
            )
          }
        }
        return NextResponse.json({ error: '套餐名稱已存在' }, { status: 409 })
      }
      throw insertError
    }

    if (itemsToCopy.length > 0) {
      const { error: itemsError } = await supabase
        .from('package_items')
        .insert(itemsToCopy.map((i) => ({
          package_id: pkg.id,
          equipment_id: i.equipment_id,
          quantity: i.quantity,
          sort_order: i.sort_order,
        })))
      if (itemsError) throw itemsError
    }

    const { data: full } = await supabase
      .from('equipment_packages')
      .select('*, package_items(equipment_id, added_at, quantity, sort_order), package_shared_departments(department_id)')
      .eq('id', pkg.id)
      .order('sort_order', { foreignTable: 'package_items', ascending: true })
      .single()

    return NextResponse.json(full ?? pkg, { status: 201 })
  } catch (err) {
    console.error('[packages] create error', err)
    return NextResponse.json({ error: '建立失敗' }, { status: 500 })
  }
}
