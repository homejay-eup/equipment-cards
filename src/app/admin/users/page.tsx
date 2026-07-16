import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin, getUserRoleWithPermissions, getAssignableRolesData } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import UserManagementTable from '@/components/UserManagementTable'
import { ArrowLeft, Users, BarChart3 } from 'lucide-react'

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

// 撈 Supabase Auth 使用者清單，取初始登入/最後登入時間，用 email 建 map
async function fetchAuthTimestamps() {
  const service = getServiceClient()
  const map = new Map<string, { auth_created_at: string | null; last_sign_in_at: string | null }>()

  let page = 1
  const perPage = 1000
  while (true) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage })
    if (error) break
    const users = data?.users ?? []
    if (users.length === 0) break
    for (const u of users) {
      if (!u.email) continue
      map.set(u.email.toLowerCase(), {
        auth_created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      })
    }
    if (users.length < perPage) break
    page += 1
  }

  return map
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

  // Step 3：平行取使用者清單 + 可指派角色 + Auth 登入時間
  const [allowedEmails, assignableRoles, authTimestamps] = await Promise.all([
    fetchAllowedEmails(callerLevel, callerDepartmentId),
    user?.email ? getAssignableRolesData(user.email) : Promise.resolve([]),
    fetchAuthTimestamps(),
  ])

  const users = allowedEmails.map(u => ({
    ...u,
    ...(authTimestamps.get(u.email.toLowerCase()) ?? { auth_created_at: null, last_sign_in_at: null }),
  }))

  const roleNames = assignableRoles.map(r => r.name)

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#7a5230]" />
              <h1 className="text-xl font-bold text-[#7a5230]">帳號管理</h1>
            </div>
          </div>
          {roleData.permissions.includes('view_analytics') && (
            <Link
              href="/admin/analytics"
              className="flex items-center gap-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
            >
              <BarChart3 className="h-4 w-4" />
              使用統計
            </Link>
          )}
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
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
