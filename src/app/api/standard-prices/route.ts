import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { validateStandardPriceInput, DUPLICATE_VERSION_MESSAGE } from '@/lib/standardPriceValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/standard-prices — 需 view_standard_prices 或 edit_standard_prices（看得到的人三層價格全部顯示，不分級）
// 回傳全部版本，前端自行計算每個產品的現行版本（同 name 中 effective_date 最大者）
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('view_standard_prices') && !permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getSupabase()
    .from('standard_price_items')
    .select('*')
    .order('category')
    .order('name')
    .order('effective_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: data ?? [] })
}

// POST /api/standard-prices — 需 edit_standard_prices；新增一筆（新產品或既有產品的新版本）
// (name, effective_date) 重複回 409
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const validation = validateStandardPriceInput(body)
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: validation.status })
  }

  const { data, error } = await getSupabase()
    .from('standard_price_items')
    .insert({ ...validation.data, updated_by: user.email })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: DUPLICATE_VERSION_MESSAGE }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: data })
}
