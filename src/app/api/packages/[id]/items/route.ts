import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── POST /api/packages/[id]/items ──────────────────────────────
// 加入單一料卡
// 權限：edit_own_packages，且僅限套餐所屬部門
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { equipment_id, quantity } = await req.json()
    if (!equipment_id) {
      return NextResponse.json({ error: 'equipment_id 為必填' }, { status: 400 })
    }
    if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)) {
      return NextResponse.json({ error: '數量需為 1–999 的整數' }, { status: 400 })
    }

    const supabase = getServiceClient()

    const { data: pkg } = await supabase
      .from('equipment_packages')
      .select('id, department_id')
      .eq('id', params.id)
      .single()

    if (!pkg) return NextResponse.json({ error: '找不到套餐' }, { status: 404 })
    if (pkg.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const insertPayload: { package_id: string; equipment_id: string; quantity?: number } = {
      package_id: params.id,
      equipment_id,
    }
    if (quantity !== undefined) insertPayload.quantity = quantity

    const { data, error } = await supabase
      .from('package_items')
      .insert(insertPayload)
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '已在套餐中' }, { status: 409 })
      }
      throw error
    }

    await supabase
      .from('equipment_packages')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[packages/items] add error', err)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }
}
