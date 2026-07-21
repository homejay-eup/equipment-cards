import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── PATCH /api/packages/[id] ───────────────────────────────────
// 改名（同部門唯一）
// 權限：edit_own_packages，且僅限套餐所屬部門
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
    const body = await req.json()
    const name: string | undefined = body?.name
    if (!name?.trim()) {
      return NextResponse.json({ error: '套餐名稱為必填' }, { status: 400 })
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

    const { data, error } = await supabase
      .from('equipment_packages')
      .update({ name: name.trim(), updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('*, package_items(equipment_id, added_at), package_shared_departments(department_id)')
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '套餐名稱已存在' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[packages] rename error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// ── DELETE /api/packages/[id] ──────────────────────────────────
// 刪除套餐（cascade 刪除 package_items / package_shared_departments）
// 權限：edit_own_packages，且僅限套餐所屬部門
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
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

    if (!pkg) return NextResponse.json({ error: '找不到套餐' }, { status: 404 })
    if (pkg.department_id !== departmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase.from('equipment_packages').delete().eq('id', params.id)
    if (error) throw error

    return new NextResponse(null, { status: 204 })
  } catch (err) {
    console.error('[packages] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
