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

// GET /api/standard-prices/sheets/[id]/revisions — 需 edit_standard_prices；Step 48b 修改紀錄清單（不含 html，新到舊）
// 還沒修改過的版本回傳空陣列（第一次儲存修改時才會建立「上傳原始內容」紀錄）
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_standard_prices')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })

  const { data, error } = await getSupabase()
    .from('standard_price_sheet_revisions')
    .select('id, saved_by, saved_at, note')
    .eq('sheet_id', params.id)
    .order('saved_at', { ascending: false })

  if (error) {
    if (error.code === 'PGRST205' || error.code === '42P01') return NextResponse.json({ revisions: [] })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ revisions: data ?? [] })
}
