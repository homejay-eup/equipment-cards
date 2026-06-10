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

export interface Department {
  id: string
  name: string
  created_at: string
}

// GET /api/departments
// 回傳所有部門清單，需 manage_roles 或 manage_users 權限
export async function GET() {
  const hasManageRoles = await requirePermission('manage_roles')
  const hasManageUsers = !hasManageRoles && await requirePermission('manage_users')

  if (!hasManageRoles && !hasManageUsers) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getSupabase()
    .from('departments')
    .select('id, name, created_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ departments: (data ?? []) as Department[] })
}

// POST /api/departments
// 建立部門，需 manage_roles 權限
// body: { name: string }
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { name } = body as { name?: unknown }

  if (!name || typeof name !== 'string' || name.trim() === '') {
    return NextResponse.json({ error: '部門名稱不可為空' }, { status: 400 })
  }

  const trimmedName = name.trim()
  const supabase = getSupabase()

  // 檢查名稱是否重複
  const { data: existing } = await supabase
    .from('departments')
    .select('id')
    .eq('name', trimmedName)
    .single()

  if (existing) {
    return NextResponse.json({ error: '部門名稱已存在' }, { status: 409 })
  }

  const { data: newDept, error: insertError } = await supabase
    .from('departments')
    .insert({ name: trimmedName })
    .select('id, name, created_at')
    .single()

  if (insertError || !newDept) {
    return NextResponse.json({ error: insertError?.message ?? '新增失敗' }, { status: 500 })
  }

  return NextResponse.json(newDept as Department, { status: 201 })
}
