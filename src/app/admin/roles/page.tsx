import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import RolesManager from '@/components/RolesManager'

interface Department {
  id: string
  name: string
}

interface RoleData {
  id: string
  name: string
  is_system: boolean
  department_id: string | null
  department_name: string | null
  level: string | null
  sort_order?: number
  permissions: string[]
  assignable_role_names: string[] | null
  custom_default_permissions: string[] | null
  custom_default_assignable_role_names: string[] | null
}

const ROLE_ORDER = [
  '管理員', '管理員(供應鏈)', '管理員(採購)', '管理員(工程)', '管理員(業務)', '管理員(技師)',
  '供應鏈', '採購', '工程', '業務', '技師', '一般使用者',
]

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function sortByRoleOrder<T extends { name: string }>(roles: T[]): T[] {
  return [...roles].sort((a, b) => {
    const ai = ROLE_ORDER.indexOf(a.name)
    const bi = ROLE_ORDER.indexOf(b.name)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

async function fetchDepartments(): Promise<Department[]> {
  const supabase = getServiceClient()
  try {
    const { data, error } = await supabase
      .from('departments')
      .select('id, name')
      .order('name', { ascending: true })

    if (error || !data) return []
    return data as Department[]
  } catch {
    return []
  }
}

async function fetchRoles(): Promise<RoleData[]> {
  const supabase = getServiceClient()

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, is_system, department_id, level, sort_order, assignable_role_names, custom_default_permissions, custom_default_assignable_role_names, departments(name), role_permissions(permission_key)')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('id', { ascending: true })

    if (error || !data) return []

    const mapped = data.map((row: {
      id: string
      name: string
      is_system: boolean
      department_id: string | null
      level: string | null
      sort_order: number | null
      assignable_role_names: string[] | null
      custom_default_permissions: string[] | null
      custom_default_assignable_role_names: string[] | null
      departments: { name: string }[] | { name: string } | null
      role_permissions: { permission_key: string }[]
    }) => {
      const deptName = Array.isArray(row.departments)
        ? (row.departments[0]?.name ?? null)
        : (row.departments?.name ?? null)
      return {
        id: row.id,
        name: row.name,
        is_system: row.is_system ?? false,
        department_id: row.department_id ?? null,
        department_name: deptName,
        level: row.level ?? null,
        sort_order: row.sort_order ?? undefined,
        assignable_role_names: row.assignable_role_names ?? null,
        custom_default_permissions: row.custom_default_permissions ?? null,
        custom_default_assignable_role_names: row.custom_default_assignable_role_names ?? null,
        permissions: (row.role_permissions ?? []).map(p => p.permission_key),
      }
    })
    return mapped
  } catch {
    return []
  }
}

export default async function AdminRolesPage() {
  // 平行：權限驗證 + 頁面資料 + 當前使用者角色
  const [user, departments, roles, roleData] = await Promise.all([
    requirePermission('manage_roles'),
    fetchDepartments(),
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
        <RolesManager initialRoles={roles} currentUserRoleName={roleData.roleName} deptGroups={departments} />
      </div>
    </main>
  )
}
