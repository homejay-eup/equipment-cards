import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── POST /api/packages/[id]/align ──────────────────────────────
// 從 source_group_id 指向的「我的關注」群組重新對齊：
// 用群組目前名稱 + group_items 整個覆蓋套餐的 name + package_items，更新 source_synced_at
// 權限：edit_own_packages + 必須是來源群組的擁有者（單向手動觸發，僅限個人群組本人操作）
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getServiceClient()

    const { data: pkg } = await supabase
      .from('equipment_packages')
      .select('id, department_id, source_group_id')
      .eq('id', params.id)
      .single()

    if (!pkg) return NextResponse.json({ error: '找不到套餐' }, { status: 404 })
    if (pkg.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!pkg.source_group_id) {
      return NextResponse.json({ error: '此套餐未連結來源群組' }, { status: 400 })
    }

    const { data: group } = await supabase
      .from('user_groups')
      .select('id, user_id, name')
      .eq('id', pkg.source_group_id)
      .single()

    if (!group) {
      return NextResponse.json({ error: '來源群組已不存在' }, { status: 404 })
    }
    // 僅限來源群組的擁有者本人可觸發對齊
    if (group.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: groupItems } = await supabase
      .from('group_items')
      .select('equipment_id')
      .eq('group_id', pkg.source_group_id)

    const equipmentIds = (groupItems ?? []).map((g: { equipment_id: string }) => g.equipment_id)
    const now = new Date().toISOString()

    // 整個覆蓋 package_items
    const { error: deleteError } = await supabase
      .from('package_items')
      .delete()
      .eq('package_id', params.id)
    if (deleteError) throw deleteError

    if (equipmentIds.length > 0) {
      const { error: insertError } = await supabase
        .from('package_items')
        .insert(equipmentIds.map((equipment_id) => ({ package_id: params.id, equipment_id })))
      if (insertError) throw insertError
    }

    const { data: updated, error: updateError } = await supabase
      .from('equipment_packages')
      .update({ name: group.name, source_synced_at: now, updated_at: now })
      .eq('id', params.id)
      .select('*, package_items(equipment_id, added_at), package_shared_departments(department_id)')
      .single()

    if (updateError) {
      if (updateError.code === '23505') {
        return NextResponse.json({ error: '對齊後的名稱與同部門其他套餐重複' }, { status: 409 })
      }
      throw updateError
    }

    return NextResponse.json(updated)
  } catch (err) {
    console.error('[packages] align error', err)
    return NextResponse.json({ error: '對齊失敗' }, { status: 500 })
  }
}
