import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── PATCH /api/packages/[id]/items/reorder ──────────────────────
// 組合內料卡拖曳排序
// body: { orders: [{ equipment_id: string, sort_order: number }] }
// 權限：edit_own_packages，且僅限組合所屬部門
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const user = await requirePermission('edit_own_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { orders } = await req.json()
    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }
    const isValid = orders.every(
      (o: { equipment_id?: unknown; sort_order?: unknown }) =>
        typeof o?.equipment_id === 'string' && o.equipment_id.length > 0 &&
        Number.isInteger(o.sort_order) && (o.sort_order as number) >= 0,
    )
    if (!isValid) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

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

    const results = await Promise.allSettled(
      (orders as { equipment_id: string; sort_order: number }[]).map((o) =>
        supabase
          .from('package_items')
          .update({ sort_order: o.sort_order })
          .eq('package_id', params.id)
          .eq('equipment_id', o.equipment_id)
      )
    )

    const failed = results.filter((r) => r.status === 'rejected').length
    if (failed > 0) return NextResponse.json({ error: '部分更新失敗' }, { status: 500 })

    await supabase
      .from('equipment_packages')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[packages/items/reorder] error', err)
    return NextResponse.json({ error: '排序更新失敗' }, { status: 500 })
  }
}
