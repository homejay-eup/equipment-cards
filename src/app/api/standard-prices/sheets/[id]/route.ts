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

async function getCaller() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions(user.email)
  return { email: user.email, permissions }
}

async function getCallerPermissions() {
  return (await getCaller())?.permissions ?? null
}

const MAX_HTML_LENGTH = 2 * 1024 * 1024
const MAX_NOTE_LENGTH = 100

// PATCH /api/standard-prices/sheets/[id] — 需 edit_standard_prices；Step 48b「儲存修改」
// 只允許修改現行版本（生效日期最新、同日期取最後上傳者）；不新增版本，內容與修改紀錄由
// DB function update_standard_price_sheet 在同一交易內寫入。
// body: { html, title?, note?, base }（base＝編輯器開啟時的 updated_at ?? created_at，用來偵測別人同時修改）
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const caller = await getCaller()
  if (!caller || !caller.permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const html = typeof body?.html === 'string' ? body.html : ''
  const title = typeof body?.title === 'string' ? body.title.trim() : ''
  const note = typeof body?.note === 'string' ? body.note.trim().slice(0, MAX_NOTE_LENGTH) : ''
  const base = typeof body?.base === 'string' && body.base ? body.base : null
  if (!html.trim()) return NextResponse.json({ error: 'HTML 內容是空的' }, { status: 400 })
  if (html.length > MAX_HTML_LENGTH) return NextResponse.json({ error: 'HTML 內容太大（上限 2MB）' }, { status: 400 })
  if (title.length > 200) return NextResponse.json({ error: '標題最多 200 字' }, { status: 400 })

  const db = getSupabase()
  const { data: current, error: curErr } = await db
    .from('standard_price_sheets')
    .select('id')
    .order('effective_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (curErr) return NextResponse.json({ error: dbErrorMessage(curErr) }, { status: 500 })
  if (!current) return NextResponse.json({ error: '找不到此版本' }, { status: 404 })
  if (current.id !== params.id) {
    return NextResponse.json({ error: '只有現行版本可以儲存修改；歷史版本請改用「另存為新版本」' }, { status: 409 })
  }

  const { data: result, error } = await db.rpc('update_standard_price_sheet', {
    p_id: params.id, p_html: html, p_title: title, p_user: caller.email, p_note: note || '細節修改', p_base: base,
  })
  if (error) {
    if (error.code === 'PGRST202' || /update_standard_price_sheet/.test(error.message)) {
      return NextResponse.json({ error: '修改功能的資料表尚未建立，請聯繫管理員執行 Step 48 SQL' }, { status: 500 })
    }
    return NextResponse.json({ error: dbErrorMessage(error) }, { status: 500 })
  }
  if (result === 'not_found') return NextResponse.json({ error: '找不到此版本' }, { status: 404 })
  if (result === 'conflict') {
    return NextResponse.json({ error: '這個版本在你編輯期間已被其他人修改，請重新開啟編輯器再改' }, { status: 409 })
  }

  const { data: sheet, error: readErr } = await db
    .from('standard_price_sheets')
    .select('id, title, effective_date, file_name, uploaded_by, created_at, updated_at, updated_by')
    .eq('id', params.id)
    .single()
  if (readErr) return NextResponse.json({ error: dbErrorMessage(readErr) }, { status: 500 })
  return NextResponse.json({ sheet })
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
