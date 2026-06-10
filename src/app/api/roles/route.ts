import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/roles
export async function GET() {
  const hasPermission =
    (await requirePermission('manage_roles')) ||
    (await requirePermission('manage_users'))
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { data, error } = await getSupabase()
      .from('roles')
      .select('id, name, is_system, department_id, level, assignable_role_names, departments(name), role_permissions(permission_key)')
      .order('created_at', { ascending: true })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const roles = (data ?? []).map((r) => {
      const row = r as unknown as {
        id: string
        name: string
        is_system: boolean
        department_id: string | null
        level: string | null
        assignable_role_names: string[] | null
        departments: { name: string } | { name: string }[] | null
        role_permissions: { permission_key: string }[]
      }
      // Supabase join 可能回傳單一物件或陣列，統一取第一筆
      const deptRaw = row.departments
      const deptName = Array.isArray(deptRaw)
        ? (deptRaw[0]?.name ?? null)
        : (deptRaw?.name ?? null)
      return {
        id: row.id,
        name: row.name,
        is_system: row.is_system,
        department_id: row.department_id ?? null,
        department_name: deptName,
        level: row.level ?? null,
        permissions: row.role_permissions.map(p => p.permission_key),
      }
    })

    return NextResponse.json(roles)
  } catch {
    return NextResponse.json({ error: 'roles 表尚未建立' }, { status: 500 })
  }
}

// POST /api/roles
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { name, permissions, department_id, level } = await req.json()
  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: '角色名稱不可為空' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { data: existing } = await supabase
    .from('roles')
    .select('id')
    .eq('name', name.trim())
    .single()

  if (existing) {
    return NextResponse.json({ error: '角色名稱已存在' }, { status: 409 })
  }

  // 若提供 department_id，驗證存在
  if (department_id != null) {
    const { data: deptExists } = await supabase
      .from('departments')
      .select('id')
      .eq('id', department_id)
      .single()
    if (!deptExists) {
      return NextResponse.json({ error: '指定的部門不存在' }, { status: 400 })
    }
  }

  const { data: newRole, error: insertError } = await supabase
    .from('roles')
    .insert({
      name: name.trim(),
      is_system: false,
      department_id: typeof department_id === 'string' ? department_id : null,
      level: typeof level === 'string' ? level : 'viewer',
    })
    .select('id, name, is_system, department_id, level')
    .single()

  if (insertError || !newRole) {
    return NextResponse.json({ error: insertError?.message ?? '新增失敗' }, { status: 500 })
  }

  const permList: string[] = Array.isArray(permissions) ? permissions : []
  if (permList.length > 0) {
    const rows = permList.map((key) => ({ role_id: newRole.id, permission_key: key }))
    const { error: permError } = await supabase.from('role_permissions').insert(rows)
    if (permError) {
      return NextResponse.json({ error: permError.message }, { status: 500 })
    }
  }

  const typedRole = newRole as { id: string; name: string; is_system: boolean; department_id: string | null; level: string | null }
  return NextResponse.json({
    id: typedRole.id,
    name: typedRole.name,
    is_system: typedRole.is_system,
    department_id: typedRole.department_id,
    level: typedRole.level,
    permissions: permList,
  }, { status: 201 })
}
