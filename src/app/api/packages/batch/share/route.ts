import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── PATCH /api/packages/batch/share ────────────────────────────
// 批次設定分享部門（全量覆蓋每個套餐的 package_shared_departments）
// body: { package_ids: string[], department_ids: string[] }
// 權限：share_own_packages，且所有 package_ids 必須屬於呼叫者的部門
export async function PATCH(req: NextRequest) {
  const user = await requirePermission('share_own_packages')
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
    const departmentIds: string[] = Array.isArray(body?.department_ids)
      ? body.department_ids.filter((v: unknown) => typeof v === 'string')
      : []

    if (packageIds.length === 0) {
      return NextResponse.json({ error: 'package_ids 為必填' }, { status: 400 })
    }
    if (packageIds.length > 500 || departmentIds.length > 500) {
      return NextResponse.json({ error: '單次批次筆數不可超過 500 筆' }, { status: 400 })
    }

    const supabase = getServiceClient()

    // 驗證所有套餐皆屬於呼叫者的部門，不允許跨部門操作他人套餐的分享設定
    const { data: packages, error: fetchError } = await supabase
      .from('equipment_packages')
      .select('id, department_id')
      .in('id', packageIds)

    if (fetchError) throw fetchError

    if (!packages || packages.length !== packageIds.length) {
      return NextResponse.json({ error: '部分套餐不存在' }, { status: 404 })
    }
    const foreign = packages.filter((p: { department_id: string }) => p.department_id !== departmentId)
    if (foreign.length > 0) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // 排除分享給自己部門（分享對象必須是「其他」部門）
    const targetDepartmentIds = departmentIds.filter((id) => id !== departmentId)

    // 插入前先驗證 department_ids 都真實存在，避免「先刪後插」在插入階段因 FK 違反失敗，
    // 導致刪除已生效但插入沒完成、使用者原本的分享設定被清空且不可逆
    if (targetDepartmentIds.length > 0) {
      const { data: existingDepartments, error: deptCheckError } = await supabase
        .from('departments')
        .select('id')
        .in('id', targetDepartmentIds)
      if (deptCheckError) throw deptCheckError
      if (!existingDepartments || existingDepartments.length !== targetDepartmentIds.length) {
        return NextResponse.json({ error: '部分部門不存在' }, { status: 400 })
      }
    }

    // 全量覆蓋：先清空這批套餐的分享設定，再依新清單插入
    const { error: deleteError } = await supabase
      .from('package_shared_departments')
      .delete()
      .in('package_id', packageIds)
    if (deleteError) throw deleteError

    if (targetDepartmentIds.length > 0) {
      const rows = packageIds.flatMap((package_id) =>
        targetDepartmentIds.map((department_id) => ({ package_id, department_id })),
      )
      const { error: insertError } = await supabase.from('package_shared_departments').insert(rows)
      if (insertError) throw insertError
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[packages/batch/share] error', err)
    return NextResponse.json({ error: '批次分享設定失敗' }, { status: 500 })
  }
}
