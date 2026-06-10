import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Building2 } from 'lucide-react'
import { requirePermission } from '@/lib/admin'
import { createClient } from '@supabase/supabase-js'
import DepartmentsManager from '@/components/DepartmentsManager'

export interface Department {
  id: string
  name: string
  created_at: string
}

export interface RoleBasic {
  id: string
  name: string
  is_system: boolean
  department_id: string | null
  department_name: string | null
  level: string | null
}

const ROLE_ORDER = [
  '管理員', '管理員(供應鏈)', '管理員(採購)', '管理員(工程)', '管理員(業務)', '管理員(技師)',
  '供應鏈', '採購', '工程', '業務', '技師', '一般使用者',
]

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
      .select('id, name, created_at')
      .order('name', { ascending: true })

    if (error || !data) return []
    return data as Department[]
  } catch {
    return []
  }
}

async function fetchRoles(): Promise<RoleBasic[]> {
  const supabase = getServiceClient()

  try {
    const { data, error } = await supabase
      .from('roles')
      .select('id, name, is_system, department_id, level, departments(name)')
      .order('id', { ascending: true })

    if (error || !data) return []

    const mapped = data.map((row: {
      id: string
      name: string
      is_system: boolean
      department_id: string | null
      level: string | null
      departments: { name: string }[] | { name: string } | null
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
      }
    })
    return sortByRoleOrder(mapped)
  } catch {
    return []
  }
}

export default async function AdminDepartmentsPage() {
  const [user, departments, roles] = await Promise.all([
    requirePermission('manage_roles'),
    fetchDepartments(),
    fetchRoles(),
  ])

  if (!user) redirect('/')

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/admin/roles" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">部門管理</h1>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8">
        <DepartmentsManager initialDepartments={departments} initialRoles={roles} />
      </div>
    </main>
  )
}
