import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { parseEffectiveDate } from '@/lib/standardPriceFormat'

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

// HTML 本文上限 2MB（目前 2026/10/1 版約 29KB，留足空間給內嵌圖片的版本）
const MAX_HTML_LENGTH = 2 * 1024 * 1024
const META_COLUMNS = 'id, title, effective_date, file_name, uploaded_by, created_at'

// GET /api/standard-prices/sheets — 需 view_standard_prices 或 edit_standard_prices
// 回傳全部版本（不含 html 本文），依生效日期、上傳時間由新到舊；第 0 筆＝現行版本
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('view_standard_prices') && !permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getSupabase()
    .from('standard_price_sheets')
    .select(META_COLUMNS)
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 500 })
  return NextResponse.json({ sheets: data ?? [] })
}

// POST /api/standard-prices/sheets — 需 edit_standard_prices；上傳新版本價目表
// body: { title, effective_date, file_name?, html }
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const html = typeof body?.html === 'string' ? body.html : ''
  const fileName = typeof body?.file_name === 'string' ? body.file_name.trim().slice(0, 200) : null
  if (!title) return NextResponse.json({ error: '請輸入標題' }, { status: 400 })
  if (title.length > 200) return NextResponse.json({ error: '標題最多 200 字' }, { status: 400 })
  if (!html.trim()) return NextResponse.json({ error: 'HTML 內容是空的' }, { status: 400 })
  if (html.length > MAX_HTML_LENGTH) return NextResponse.json({ error: 'HTML 檔案太大（上限 2MB）' }, { status: 400 })
  const date = parseEffectiveDate(body?.effective_date)
  if (!date.ok) return NextResponse.json({ error: date.error }, { status: 400 })

  const { data, error } = await getSupabase()
    .from('standard_price_sheets')
    .insert({ title, effective_date: date.value, file_name: fileName || null, html, uploaded_by: user.email })
    .select(META_COLUMNS)
    .single()

  if (error) return NextResponse.json({ error: dbErrorMessage(error) }, { status: 500 })
  return NextResponse.json({ sheet: data })
}
