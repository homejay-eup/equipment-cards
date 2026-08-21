import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'

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

// GET /api/admin/roles — 角色管理分頁初始資料（部門清單 + 角色清單 + 目前使用者角色名稱）
export async function GET() {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const [departments, roles, roleData] = await Promise.all([
    fetchDepartments(),
    fetchRoles(),
    getUserRoleWithPermissions(),
  ])

  return NextResponse.json({
    departments,
    roles,
    currentUserRoleName: roleData.roleName,
  })
}
