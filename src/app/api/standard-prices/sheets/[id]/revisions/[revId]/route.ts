import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// GET /api/standard-prices/sheets/[id]/revisions/[revId] — 需 edit_standard_prices；回傳某筆修改紀錄的完整內容（預覽／還原用）
export async function GET(_req: NextRequest, { params }: { params: { id: string; revId: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_standard_prices')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.revId)) {
    return NextResponse.json({ error: '找不到此紀錄' }, { status: 404 })
  }

  const { data, error } = await getSupabase()
    .from('standard_price_sheet_revisions')
    .select('id, sheet_id, html, saved_by, saved_at, note')
    .eq('id', params.revId)
    .eq('sheet_id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此紀錄' }, { status: 404 })
  return NextResponse.json({ revision: data })
}
