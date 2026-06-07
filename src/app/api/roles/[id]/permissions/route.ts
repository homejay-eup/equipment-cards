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

const VALID_PERMISSION_KEYS = [
  'read_all_cards', 'read_active_only', 'read_documents', 'read_notes', 'read_vendor',
  'read_updated_by', 'read_updated_content', 'use_bookmarks',
  'add_delete_cards', 'edit_cards',
  'edit_field_id', 'edit_field_name', 'edit_field_category', 'edit_field_status',
  'edit_field_vendor', 'edit_field_tags', 'edit_field_notes', 'edit_field_net_weight',
  'edit_field_documents', 'edit_field_is_new', 'edit_field_main_photo', 'edit_field_detail_photos',
  'manage_users', 'manage_roles', 'use_groups',
  'view_tracker', 'view_my_tasks', 'show_login_banner', 'create_issues',
]

// GET /api/roles/[id]/permissions
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const hasPermission =
    (await requirePermission('manage_roles')) ||
    (await requirePermission('manage_users'))
  if (!hasPermission) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('role_permissions')
    .select('permission_key')
    .eq('role_id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const permissions = (data ?? [])
    .map((p) => p.permission_key)
    .filter((k) => VALID_PERMISSION_KEYS.includes(k))
  return NextResponse.json({ permissions })
}

// PUT /api/roles/[id]/permissions
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_roles')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const { permissions } = await req.json()

  if (!Array.isArray(permissions)) {
    return NextResponse.json({ error: 'permissions 必須為陣列' }, { status: 400 })
  }

  // 驗證所有 permission_key 合法
  const invalid = permissions.filter((k) => !VALID_PERMISSION_KEYS.includes(k))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `無效的 permission_key：${invalid.join(', ')}` }, { status: 400 })
  }

  // read_all_cards 與 read_active_only 互斥：保留 read_active_only，移除 read_all_cards（保守策略）
  let finalPermissions: string[] = [...permissions]
  if (finalPermissions.includes('read_all_cards') && finalPermissions.includes('read_active_only')) {
    finalPermissions = finalPermissions.filter((k) => k !== 'read_all_cards')
  }

  const supabase = getSupabase()

  // 確認角色存在
  const { data: role, error: fetchError } = await supabase
    .from('roles')
    .select('id')
    .eq('id', id)
    .single()

  if (fetchError || !role) {
    return NextResponse.json({ error: '找不到角色' }, { status: 404 })
  }

  // 覆寫：先刪除再插入
  const { error: deleteError } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role_id', id)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  if (finalPermissions.length > 0) {
    const rows = finalPermissions.map((key) => ({ role_id: id, permission_key: key }))
    const { error: insertError } = await supabase.from('role_permissions').insert(rows)
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, permissions: finalPermissions })
}
