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

// GET /api/quotes — 需 view_quotes；manager_price 依 view_quotes_manager_price 決定是否回傳
export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions()
  if (!permissions.includes('view_quotes') && !permissions.includes('edit_quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { data, error } = await getSupabase()
    .from('quote_items')
    .select('*')
    .order('category')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const canViewManagerPrice = permissions.includes('view_quotes_manager_price')
  const items = (data ?? []).map((item) =>
    canViewManagerPrice ? item : { ...item, manager_price: null },
  )

  return NextResponse.json({ items })
}

// POST /api/quotes — 需 edit_quotes
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions()
  if (!permissions.includes('edit_quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { category, name, standard_price, manager_price } = await req.json()
  if (!category || typeof category !== 'string' || !name || typeof name !== 'string') {
    return NextResponse.json({ error: '分類與品名為必填' }, { status: 400 })
  }
  if (typeof standard_price !== 'number' || Number.isNaN(standard_price)) {
    return NextResponse.json({ error: '標準售價必須為數字' }, { status: 400 })
  }
  if (manager_price !== null && manager_price !== undefined && (typeof manager_price !== 'number' || Number.isNaN(manager_price))) {
    return NextResponse.json({ error: '主管權限價格式錯誤' }, { status: 400 })
  }

  // 無 view_quotes_manager_price 的使用者，即使傳了 manager_price 也一律忽略（新建項目一律以 null 起始）
  const canSetManagerPrice = permissions.includes('view_quotes_manager_price')

  const { data, error } = await getSupabase()
    .from('quote_items')
    .insert({
      category,
      name,
      standard_price,
      manager_price: canSetManagerPrice ? (manager_price ?? null) : null,
      updated_by: user.email,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}
