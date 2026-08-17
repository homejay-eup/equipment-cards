import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── DELETE /api/packages/batch ─────────────────────────────────
// 批次刪除組合（package_items / package_shared_departments 由既有 ON DELETE CASCADE 自動清除）
// body: { package_ids: string[] }
// 權限：edit_own_packages，且所有 package_ids 必須屬於呼叫者的部門，否則整批拒絕（不部分刪除）
export async function DELETE(req: NextRequest) {
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
    const packageIds: string[] = Array.isArray(body?.package_ids)
      ? body.package_ids.filter((v: unknown) => typeof v === 'string')
      : []

    if (packageIds.length === 0) {
      return NextResponse.json({ error: 'package_ids 為必填' }, { status: 400 })
    }
    if (packageIds.length > 500) {
      return NextResponse.json({ error: '單次批次筆數不可超過 500 筆' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // 驗證所有組合皆存在且屬於呼叫者的部門，不信任前端傳來的 id 就代表有權限
    const { data: packages, error: fetchError } = await supabase
      .from('equipment_packages')
      .select('id, department_id')
      .in('id', packageIds)

    if (fetchError) throw fetchError

    if (!packages || packages.length !== packageIds.length) {
      // 有 id 不存在：整批拒絕，不部分刪除
      return NextResponse.json({ error: '部分組合不存在' }, { status: 400 })
    }
    const foreign = packages.filter((p: { department_id: string }) => p.department_id !== departmentId)
    if (foreign.length > 0) {
      // 有 id 不屬於呼叫者部門：整批拒絕，不部分刪除
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error: deleteError } = await supabase
      .from('equipment_packages')
      .delete()
      .in('id', packageIds)

    if (deleteError) throw deleteError

    return NextResponse.json({ success: true, deleted: packageIds.length })
  } catch (err) {
    console.error('[packages/batch] delete error', err)
    return NextResponse.json({ error: '批次刪除失敗' }, { status: 500 })
  }
}
