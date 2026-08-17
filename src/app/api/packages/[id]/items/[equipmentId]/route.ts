import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── DELETE /api/packages/[id]/items/[equipmentId] ──────────────
// 移除單一料卡
// 權限：edit_own_packages，且僅限組合所屬部門
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string; equipmentId: string } },
) {
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
      .select('id, department_id')
      .eq('id', params.id)
      .single()

    if (!pkg) return NextResponse.json({ error: '找不到組合' }, { status: 404 })
    if (pkg.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase
      .from('package_items')
      .delete()
      .eq('package_id', params.id)
      .eq('equipment_id', params.equipmentId)

    if (error) throw error

    await supabase
      .from('equipment_packages')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[packages/items] remove error', err)
    return NextResponse.json({ error: '移除失敗' }, { status: 500 })
  }
}

// ── PATCH /api/packages/[id]/items/[equipmentId] ───────────────
// 更新單一料卡的數量
// 權限：edit_own_packages，且僅限組合所屬部門
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; equipmentId: string } },
) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { quantity } = await req.json()
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
      return NextResponse.json({ error: '數量需為 1–999 的整數' }, { status: 400 })
    }

    const supabase = getServiceClient()

    const { data: pkg } = await supabase
      .from('equipment_packages')
      .select('id, department_id')
      .eq('id', params.id)
      .single()

    if (!pkg) return NextResponse.json({ error: '找不到組合' }, { status: 404 })
    if (pkg.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase
      .from('package_items')
      .update({ quantity })
      .eq('package_id', params.id)
      .eq('equipment_id', params.equipmentId)
      .select('equipment_id, added_at, quantity')
      .single()

    if (error) throw error

    await supabase
      .from('equipment_packages')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json(data, { status: 200 })
  } catch (err) {
    console.error('[packages/items] update quantity error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}
