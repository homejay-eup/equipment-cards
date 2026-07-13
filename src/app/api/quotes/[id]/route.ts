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

async function checkEditQuotes() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions()
  return permissions.includes('edit_quotes') ? { user, permissions } : null
}

// PATCH /api/quotes/[id] — 需 edit_quotes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await checkEditQuotes()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const { user, permissions } = auth

  const { category, name, standard_price, manager_price } = await req.json()
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: user.email }

  if (category !== undefined) {
    if (typeof category !== 'string' || !category) {
      return NextResponse.json({ error: '分類不可為空' }, { status: 400 })
    }
    update.category = category
  }
  if (name !== undefined) {
    if (typeof name !== 'string' || !name) {
      return NextResponse.json({ error: '品名不可為空' }, { status: 400 })
    }
    update.name = name
  }
  if (standard_price !== undefined) {
    if (typeof standard_price !== 'number' || Number.isNaN(standard_price)) {
      return NextResponse.json({ error: '標準售價必須為數字' }, { status: 400 })
    }
    update.standard_price = standard_price
  }
  // 無 view_quotes_manager_price 的使用者，即使傳了 manager_price 也完全忽略（不寫入 update，避免蓋掉既有值）
  if (manager_price !== undefined && permissions.includes('view_quotes_manager_price')) {
    if (manager_price !== null && (typeof manager_price !== 'number' || Number.isNaN(manager_price))) {
      return NextResponse.json({ error: '主管權限價格式錯誤' }, { status: 400 })
    }
    update.manager_price = manager_price
  }

  const { data, error } = await getSupabase()
    .from('quote_items')
    .update(update)
    .eq('id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ item: data })
}

// DELETE /api/quotes/[id] — 需 edit_quotes
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await checkEditQuotes()
  if (!auth) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await getSupabase()
    .from('quote_items')
    .delete()
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
