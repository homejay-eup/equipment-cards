import { NextRequest, NextResponse } from 'next/server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/settings — 公開，任何登入者可讀
export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

// PATCH /api/settings — 管理員或有 edit_card_category / edit_card_status / create_issues / tracker_edit_issue 權限
export async function PATCH(req: NextRequest) {
  // Session check
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions()
  const canManageSettings =
    permissions.includes('manage_roles') ||
    permissions.includes('edit_card_category') ||
    permissions.includes('edit_card_status') ||
    permissions.includes('create_issues') ||
    permissions.includes('tracker_edit_issue')
  if (!canManageSettings) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key, value } = await req.json()
  if (!['categories', 'statuses', 'documentTypes', 'issueTypes', 'issueTags', 'quoteCategories'].includes(key) || !Array.isArray(value)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  // issueTypes / issueTags → 寫入 department_issue_types（按部門隔離）
  if (key === 'issueTypes' || key === 'issueTags') {
    if (!permissions.includes('manage_roles') &&
        !permissions.includes('create_issues') &&
        !permissions.includes('tracker_edit_issue')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const service = getSupabase()
    // 查呼叫者的 department_id
    const { data: emailRow } = await service
      .from('allowed_emails')
      .select('role')
      .eq('email', user.email)
      .single()
    if (!emailRow?.role) return NextResponse.json({ error: '無部門歸屬' }, { status: 403 })

    const { data: roleRow } = await service
      .from('roles')
      .select('department_id')
      .eq('name', emailRow.role)
      .single()
    const departmentId = (roleRow as { department_id: string | null } | null)?.department_id
    if (!departmentId) return NextResponse.json({ error: '無部門歸屬' }, { status: 403 })

    const column = key === 'issueTypes' ? 'types' : 'tags'
    const { error } = await service
      .from('department_issue_types')
      .upsert({ department_id: departmentId, [column]: value, updated_at: new Date().toISOString() }, { onConflict: 'department_id' })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ success: true })
  }

  // 其餘 key (categories / statuses / documentTypes / quoteCategories) → 欄位層級隔離寫 app_settings
  const allowedKeys: string[] = []
  if (permissions.includes('manage_roles')) {
    allowedKeys.push('categories', 'statuses', 'documentTypes', 'quoteCategories')
  } else {
    if (permissions.includes('edit_card_category')) allowedKeys.push('categories', 'documentTypes')
    if (permissions.includes('edit_card_status')) allowedKeys.push('statuses')
    if (permissions.includes('edit_quotes')) allowedKeys.push('quoteCategories')
  }
  if (!allowedKeys.includes(key)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { error } = await getSupabase()
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
