import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, getUserRoleWithPermissions, getAssignableRolesData } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users } from 'lucide-react'

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function fetchAllowedEmails(
  callerLevel: string | null,
  callerDepartmentId: string | null
) {
  const service = getServiceClient()

  if (callerLevel === 'super_admin') {
    // super_admin 看全部
    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  if (callerLevel === 'dept_admin' && callerDepartmentId) {
    // dept_admin 只看同部門的角色所對應的帳號
    const { data: deptRoles } = await service
      .from('roles')
      .select('name')
      .eq('department_id', callerDepartmentId)
    const deptRoleNames = (deptRoles ?? []).map((r: { name: string }) => r.name)

    if (deptRoleNames.length === 0) return []

    const { data } = await service
      .from('allowed_emails')
      .select('email, role, created_at')
      .in('role', deptRoleNames)
      .order('created_at', { ascending: true })
    return (data ?? []) as { email: string; role: string; created_at: string }[]
  }

  // 其他（不應進入此頁，requireAdmin 已擋）：回傳空
  return []
}


export default async function AdminUsersPage() {
  const supabase = createSupabaseServerClient()

  // Step 1：平行取 auth + admin guard + role info
  const [admin, { data: { user } }, roleData] = await Promise.all([
    requireAdmin(),
    supabase.auth.getUser(),
    getUserRoleWithPermissions(),
  ])

  if (!admin) redirect('/')

  // Step 2：取 caller 的 level + department_id
  let callerLevel: string | null = null
  let callerDepartmentId: string | null = null
  if (user?.email) {
    const service = getServiceClient()
    const { data: emailRow } = await service
      .from('allowed_emails').select('role').eq('email', user.email).single()
    if (emailRow?.role) {
      const { data: roleRow } = await service
        .from('roles').select('level, department_id').eq('name', emailRow.role).single()
      callerLevel = roleRow?.level ?? null
      callerDepartmentId = (roleRow as { department_id?: string | null } | null)?.department_id ?? null
    }
  }

  // Step 3：平行取使用者清單 + 可指派角色
  const [users, assignableRoles] = await Promise.all([
    fetchAllowedEmails(callerLevel, callerDepartmentId),
    user?.email ? getAssignableRolesData(user.email) : Promise.resolve([]),
  ])

  const roleNames = assignableRoles.map(r => r.name)

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">帳號管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <UserManagementTable
          initialUsers={users}
          currentUserEmail={user!.email!}
          availableRoles={roleNames}
          permissions={roleData.permissions}
          canSyncUsers={callerLevel === 'super_admin'}
        />
      </div>
    </main>
  )
}
