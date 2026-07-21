export const dynamic = 'force-dynamic'

import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getServiceClient, getCallerDepartmentId } from '@/lib/departments'
import { EquipmentCard } from '@/types/equipment'
import { EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import PackagesClient from './PackagesClient'

const PACKAGE_PERM_KEYS = [
  'view_own_packages', 'edit_own_packages', 'share_own_packages', 'view_shared_packages',
]

export default async function PackagesPage() {
  const { permissions } = await getUserRoleWithPermissions()
  // 四個 permission key 只要具備任一即可進入頁面（比照 view_tracker/view_quotes 模式）
  if (!PACKAGE_PERM_KEYS.some(k => permissions.includes(k))) {
    redirect('/')
  }

  const supabase = createSupabaseServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()
  const userEmail = authUser?.email ?? ''

  const adminClient = getServiceClient()

  // 部門歸屬查詢改用共用函式（比照 /api/packages/** 的做法），避免重複實作
  // allowed_emails.role -> roles.department_id 這段查詢邏輯
  const userDepartmentId = userEmail ? await getCallerDepartmentId(userEmail) : null

  // 「本部門套餐」「分享給我」「部門清單（分享彈窗用）」三批平行查詢
  const canViewOwn = permissions.includes('view_own_packages') || permissions.includes('edit_own_packages')
  const canViewShared = permissions.includes('view_shared_packages')

  const [ownResult, sharedResult, deptResult, cardsResult] = await Promise.all([
    canViewOwn && userDepartmentId
      ? adminClient
          .from('equipment_packages')
          .select('*, package_items(equipment_id, added_at), package_shared_departments(department_id)')
          .eq('department_id', userDepartmentId)
          .order('sort_order', { ascending: true, nullsFirst: false })
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] }),
    canViewShared && userDepartmentId
      ? (async () => {
          const { data: shares } = await adminClient
            .from('package_shared_departments')
            .select('package_id')
            .eq('department_id', userDepartmentId)
          const packageIds = (shares ?? []).map((s: { package_id: string }) => s.package_id)
          if (packageIds.length === 0) return { data: [] }
          return adminClient
            .from('equipment_packages')
            .select('*, package_items(equipment_id, added_at), departments!equipment_packages_department_id_fkey(name)')
            .in('id', packageIds)
            .neq('department_id', userDepartmentId)
            .order('created_at', { ascending: false })
        })()
      : Promise.resolve({ data: [] }),
    adminClient.from('departments').select('id, name').order('created_at', { ascending: true }),
    adminClient.from('equipment_cards').select('*').order('equipment_id'),
  ])

  const ownPackages = (ownResult.data ?? []) as EquipmentPackage[]

  // 對齊狀態徽章用：/api/packages 回傳的套餐不帶來源群組的 updated_at，
  // 這裡另外查一次 user_groups（service client，不受 RLS/擁有者限制），
  // 組成 { source_group_id: updated_at } 對照表供前端比較是否「來源已更新」。
  // 來源群組若已被刪除（source_group_id 指到不存在的群組），對照表就不會有該筆，前端不顯示徽章。
  const sourceGroupIds = Array.from(new Set(
    ownPackages.map(p => p.source_group_id).filter((id): id is string => !!id),
  ))
  const sourceGroupUpdatedAt: Record<string, string> = {}
  if (sourceGroupIds.length > 0) {
    const { data: sourceGroups } = await adminClient
      .from('user_groups')
      .select('id, updated_at')
      .in('id', sourceGroupIds)
    for (const g of (sourceGroups ?? []) as { id: string; updated_at: string }[]) {
      sourceGroupUpdatedAt[g.id] = g.updated_at
    }
  }

  type SharedRaw = Record<string, unknown> & { departments?: { name: string } | null }
  const sharedPackages: SharedEquipmentPackage[] = ((sharedResult.data ?? []) as SharedRaw[]).map((p) => ({
    ...(p as unknown as EquipmentPackage),
    source_department_name: p.departments?.name ?? null,
  }))

  const departments = (deptResult.data ?? []) as { id: string; name: string }[]
  const allCards = (cardsResult.data ?? []) as EquipmentCard[]

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <Suspense>
        <PackagesClient
          initialOwnPackages={ownPackages}
          initialSharedPackages={sharedPackages}
          departments={departments}
          allCards={allCards}
          permissions={permissions}
          userEmail={userEmail}
          userDepartmentId={userDepartmentId}
          sourceGroupUpdatedAt={sourceGroupUpdatedAt}
        />
      </Suspense>
    </main>
  )
}
