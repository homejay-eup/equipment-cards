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

// 正式 DB 尚未執行 step47 SQL（資料表不存在）時，回中文訊息取代 Supabase 的英文錯誤
function dbErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'PGRST205' || error.code === '42P01' || /standard_price_sheets/.test(error.message)) {
    return '價目表資料表尚未建立，請聯繫管理員執行 Step 47 SQL'
  }
  return error.message
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function getCallerPermissions() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions(user.email)
  return permissions
}

// GET /api/standard-prices/sheets/[id] — 需 view_standard_prices 或 edit_standard_prices；回傳含 html 本文
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const permissions = await getCallerPermissions()
  if (!permissions || (!permissions.includes('view_standard_prices') && !permissions.includes('edit_standard_prices'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })

  const { data, error } = await getSupabase()
    .from('standard_price_sheets')
    .select('*')
    .eq('id', params.id)
    .maybeSingle()

  if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })
  return NextResponse.json({ sheet: data })
}

// DELETE /api/standard-prices/sheets/[id] — 需 edit_standard_prices
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const permissions = await getCallerPermissions()
  if (!permissions || !permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })

  const { data, error } = await getSupabase()
    .from('standard_price_sheets')
    .delete()
    .eq('id', params.id)
    .select('id')

  if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 500 })
  if (!data || data.length === 0) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })
  return NextResponse.json({ success: true })
}
