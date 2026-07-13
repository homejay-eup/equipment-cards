import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// PATCH /api/quotes/reorder
// Body: { orders: { id: string; sort_order: number }[] }
export async function PATCH(req: NextRequest) {
  if (!await requirePermission('edit_quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { orders?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: '無效的請求內容' }, { status: 400 })
  }

  const { orders } = body
  if (!Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: 'orders 必須為非空陣列' }, { status: 400 })
  }

  const supabase = getSupabase()
  const failed: string[] = []

  for (const item of orders as { id: string; sort_order: number }[]) {
    if (typeof item.id !== 'string' || typeof item.sort_order !== 'number') continue
    const { error } = await supabase
      .from('quote_items')
      .update({ sort_order: item.sort_order })
      .eq('id', item.id)
    if (error) failed.push(item.id)
  }

  if (failed.length > 0) {
    return NextResponse.json({ error: `部分排序更新失敗：${failed.join(', ')}` }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
