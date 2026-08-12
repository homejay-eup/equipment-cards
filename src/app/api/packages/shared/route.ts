import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'

// ── GET /api/packages/shared ───────────────────────────────────
// 查詢其他部門有分享給「我的部門」的套餐（永遠唯讀），每筆帶來源部門名稱
// 權限：view_shared_packages
export async function GET() {
  const user = await requirePermission('view_shared_packages')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const departmentId = await getCallerDepartmentId(user.email!)
  if (!departmentId) {
    return NextResponse.json([])
  }

  try {
    const supabase = getServiceClient()

    // 找出有分享給我的部門的 package_id
    const { data: shares, error: sharesError } = await supabase
      .from('package_shared_departments')
      .select('package_id')
      .eq('department_id', departmentId)

    if (sharesError) throw sharesError

    const packageIds = (shares ?? []).map((s: { package_id: string }) => s.package_id)
    if (packageIds.length === 0) {
      return NextResponse.json([])
    }

    const { data: packages, error: packagesError } = await supabase
      .from('equipment_packages')
      .select('*, package_items(equipment_id, added_at, quantity, sort_order), departments!equipment_packages_department_id_fkey(name)')
      .in('id', packageIds)
      // 分享套餐一律只回其他部門的（避免自己部門分享給自己的邊界狀況混入本區塊）
      .neq('department_id', departmentId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('sort_order', { foreignTable: 'package_items', ascending: true })

    if (packagesError) throw packagesError

    const formatted = (packages ?? []).map((p: Record<string, unknown> & { departments?: { name: string } | null }) => ({
      ...p,
      source_department_name: p.departments?.name ?? null,
      departments: undefined,
    }))

    return NextResponse.json(formatted)
  } catch (err) {
    console.error('[packages/shared] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
