import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── PATCH /api/groups/[id]/items/reorder ────────────────────────
// 組合內料卡拖曳排序
// body: { orders: [{ equipment_id: string, sort_order: number }] }
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orders } = await request.json()
  if (!Array.isArray(orders) || orders.length === 0) {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }
  const isValid = orders.every(
    (o: { equipment_id?: unknown; sort_order?: unknown }) =>
      typeof o?.equipment_id === 'string' && o.equipment_id.length > 0 &&
      Number.isInteger(o.sort_order) && (o.sort_order as number) >= 0,
  )
  if (!isValid) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const admin = adminClient()

  // 驗證此組合屬於當前使用者
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const updates = await Promise.allSettled(
    (orders as { equipment_id: string; sort_order: number }[]).map((o) =>
      admin
        .from('group_items')
        .update({ sort_order: o.sort_order })
        .eq('group_id', params.id)
        .eq('equipment_id', o.equipment_id)
    )
  )

  const failed = updates.filter(r => r.status === 'rejected').length
  if (failed > 0) return NextResponse.json({ error: 'Partial update failed' }, { status: 500 })

  // 供「設備組合」來源對齊機制比對：內部排序異動也算組合內容變動
  await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json({ ok: true })
}
