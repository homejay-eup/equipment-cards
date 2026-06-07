import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import RolesManager from '@/components/RolesManager'

interface RoleData {
  id: string
  name: string
  is_system: boolean
  dept_group: string | null
  level: string | null
  permissions: string[]
  assignable_role_names: string[] | null
}

async function fetchRoles(): Promise<RoleData[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, is_system, dept_group, level, assignable_role_names, role_permissions(permission_key)')
      .order('id', { ascending: true })

    if (error || !data) return []

    return data.map((row: {
      id: string
      name: string
      is_system: boolean
      dept_group: string | null
      level: string | null
      assignable_role_names: string[] | null
      role_permissions: { permission_key: string }[]
    }) => ({
      id: row.id,
      name: row.name,
      is_system: row.is_system ?? false,
      dept_group: row.dept_group ?? null,
      level: row.level ?? null,
      assignable_role_names: row.assignable_role_names ?? null,
      permissions: (row.role_permissions ?? []).map(p => p.permission_key),
    }))
  } catch {
    return []
  }
}

export default async function AdminRolesPage() {
  // 平行：權限驗證 + 頁面資料 + 當前使用者角色
  const [user, roles, roleData] = await Promise.all([
    requirePermission('manage_roles'),
    fetchRoles(),
    getUserRoleWithPermissions(),
  ])

  if (!user) redirect('/')

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/users" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">角色管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <RolesManager initialRoles={roles} currentUserRoleName={roleData.roleName} />
      </div>
    </main>
  )
}
