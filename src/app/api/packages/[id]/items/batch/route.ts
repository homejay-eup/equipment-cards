import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── POST /api/packages/[id]/items/batch ────────────────────────
// 批次加/移料號掛載，供「依料號檢視」的批次維護使用
// body: { add?: string[], remove?: string[] }
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
    const body = await req.json()
    const add: string[] = Array.isArray(body?.add) ? body.add.filter((v: unknown) => typeof v === 'string') : []
    const remove: string[] = Array.isArray(body?.remove) ? body.remove.filter((v: unknown) => typeof v === 'string') : []

    if (add.length === 0 && remove.length === 0) {
      return NextResponse.json({ error: 'add 或 remove 至少需一項' }, { status: 400 })
    }
    if (add.length > 500 || remove.length > 500) {
      return NextResponse.json({ error: '單次批次筆數不可超過 500 筆' }, { status: 400 })
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

    // 先查目前實際內容，算出 add/remove 是否會造成淨變動——
    // 供「設備套餐」來源對齊機制比對：no-op（加已存在的料號、移不存在的料號）不算內容異動，不 bump updated_at
    const { data: existingItems } = await supabase
      .from('package_items')
      .select('equipment_id')
      .eq('package_id', params.id)
    const existingIds = new Set((existingItems ?? []).map((i: { equipment_id: string }) => i.equipment_id))
    const hasRealChange = remove.some((id) => existingIds.has(id)) || add.some((id) => !existingIds.has(id))

    if (remove.length > 0) {
      const { error: removeError } = await supabase
        .from('package_items')
        .delete()
        .eq('package_id', params.id)
        .in('equipment_id', remove)
      if (removeError) throw removeError
    }

    if (add.length > 0) {
      // upsert：已存在的料號不報錯，忽略即可
      const { error: addError } = await supabase
        .from('package_items')
        .upsert(
          add.map((equipment_id) => ({ package_id: params.id, equipment_id })),
          { onConflict: 'package_id,equipment_id', ignoreDuplicates: true },
        )
      if (addError) throw addError
    }

    if (hasRealChange) {
      await supabase
        .from('equipment_packages')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', params.id)
    }

    const { data: full } = await supabase
      .from('equipment_packages')
      .select('*, package_items(equipment_id, added_at, quantity), package_shared_departments(department_id)')
      .eq('id', params.id)
      .single()

    return NextResponse.json(full)
  } catch (err) {
    console.error('[packages/items/batch] error', err)
    return NextResponse.json({ error: '批次更新失敗' }, { status: 500 })
  }
}
