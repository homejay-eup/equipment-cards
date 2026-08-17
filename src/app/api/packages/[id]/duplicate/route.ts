import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── POST /api/packages/[id]/duplicate ──────────────────────────
// 複製組合（A -> B），複製 package_items，不建立任何來源關聯
// body: { name: string }
// 權限：edit_own_packages，且僅限組合所屬部門
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
    const name: string | undefined = body?.name
    if (!name?.trim()) {
      return NextResponse.json({ error: '新組合名稱為必填' }, { status: 400 })
    }

    const supabase = getServiceClient()

    const { data: source } = await supabase
      .from('equipment_packages')
      .select('id, department_id, package_items(equipment_id, quantity, sort_order)')
      .eq('id', params.id)
      .single()

    if (!source) return NextResponse.json({ error: '找不到組合' }, { status: 404 })
    if (source.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data: newPkg, error: insertError } = await supabase
      .from('equipment_packages')
      .insert({
        name: name.trim(),
        department_id: departmentId,
        source_group_id: null,
        source_synced_at: null,
        created_by: user.email!,
      })
      .select()
      .single()

    if (insertError) {
      if (insertError.code === '23505') {
        return NextResponse.json({ error: '組合名稱已存在' }, { status: 409 })
      }
      throw insertError
    }

    const items = (source.package_items ?? []) as { equipment_id: string; quantity: number; sort_order: number }[]
    if (items.length > 0) {
      const { error: itemsError } = await supabase
        .from('package_items')
        .insert(items.map((i) => ({
          package_id: newPkg.id,
          equipment_id: i.equipment_id,
          quantity: i.quantity,
          sort_order: i.sort_order,
        })))
      if (itemsError) throw itemsError
    }

    const { data: full } = await supabase
      .from('equipment_packages')
      .select('*, package_items(equipment_id, added_at, quantity, sort_order), package_shared_departments(department_id)')
      .eq('id', newPkg.id)
      .order('sort_order', { foreignTable: 'package_items', ascending: true })
      .single()

    return NextResponse.json(full ?? newPkg, { status: 201 })
  } catch (err) {
    console.error('[packages] duplicate error', err)
    return NextResponse.json({ error: '複製失敗' }, { status: 500 })
  }
}
