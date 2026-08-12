import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── PATCH /api/packages/reorder ──────────────────────────────────
// 「設備套餐」頁面套餐本身（不同套餐資料夾）拖曳排序
// body: { orders: [{ id: string, sort_order: number }] }
// 權限：edit_own_packages，且僅限呼叫者部門自己的套餐
export async function PATCH(req: NextRequest) {
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
      (o: { id?: unknown; sort_order?: unknown }) =>
        typeof o?.id === 'string' && o.id.length > 0 &&
        Number.isInteger(o.sort_order) && (o.sort_order as number) >= 0,
    )
    if (!isValid) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

    const supabase = getServiceClient()
    const ids = (orders as { id: string; sort_order: number }[]).map((o) => o.id)

    // 驗證所有套餐都屬於呼叫者的部門
    const { data: packages, error } = await supabase
      .from('equipment_packages')
      .select('id, department_id')
      .in('id', ids)

    if (error) return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    if (!packages || packages.length !== ids.length) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (packages.some((p: { department_id: string }) => p.department_id !== departmentId)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const updates = await Promise.allSettled(
      (orders as { id: string; sort_order: number }[]).map((o) =>
        supabase
          .from('equipment_packages')
          .update({ sort_order: o.sort_order })
          .eq('id', o.id)
          .eq('department_id', departmentId)
      )
    )

    const failed = updates.filter((r) => r.status === 'rejected').length
    if (failed > 0) return NextResponse.json({ error: '部分更新失敗' }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[packages/reorder] error', err)
    return NextResponse.json({ error: '排序更新失敗' }, { status: 500 })
  }
}
