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

// PUT /api/roles/[id]/default
// 儲存目前草稿為「記憶預設」快照
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { permissions: unknown; assignable_role_names: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { permissions, assignable_role_names } = body

  if (!Array.isArray(permissions)) {
    return NextResponse.json({ error: 'permissions must be an array' }, { status: 400 })
  }
  if (assignable_role_names !== null && !Array.isArray(assignable_role_names)) {
    return NextResponse.json({ error: 'assignable_role_names must be an array or null' }, { status: 400 })
  }

  const supabase = getSupabase()

  const { error } = await supabase
    .from('roles')
    .update({
      custom_default_permissions: permissions as string[],
      custom_default_assignable_role_names: Array.isArray(assignable_role_names) && (assignable_role_names as string[]).length > 0
        ? assignable_role_names as string[]
        : null,
    })
    .eq('id', params.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
