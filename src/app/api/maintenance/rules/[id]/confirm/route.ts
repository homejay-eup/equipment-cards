import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/maintenance/rules/[id]/confirm ────────────────────
// 標示「已確認最新」，寫入 confirmed_at/by，需 manage_maintenance_info
export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_rules')
      .update({
        confirmed_at: new Date().toISOString(),
        confirmed_by: user?.email ?? null,
      })
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    return NextResponse.json({ rule: data })
  } catch (err) {
    console.error('[maintenance/rules/confirm] error', err)
    return NextResponse.json({ error: '標示確認失敗' }, { status: 500 })
  }
}
