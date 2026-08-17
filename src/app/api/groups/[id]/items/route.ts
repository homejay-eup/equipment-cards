import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { equipment_id, quantity } = await request.json()
  if (!equipment_id) return NextResponse.json({ error: 'equipment_id required' }, { status: 400 })

  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 1 || quantity > 999)) {
    return NextResponse.json({ error: '數量需為 1–999 的整數' }, { status: 400 })
  }

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // 新項目插到最後面：目前最大 sort_order + 1000（沒有任何項目時視為 0）
  const { data: maxRow } = await admin
    .from('group_items')
    .select('sort_order')
    .eq('group_id', params.id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSortOrder = ((maxRow as { sort_order: number } | null)?.sort_order ?? 0) + 1000

  const insertPayload: { group_id: string; equipment_id: string; quantity?: number; sort_order: number } = {
    group_id: params.id,
    equipment_id,
    sort_order: nextSortOrder,
  }
  if (quantity !== undefined) insertPayload.quantity = quantity

  const { data, error } = await admin
    .from('group_items')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '已在組合中' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 供「設備組合」來源對齊機制比對：加卡也算組合內容變動
  await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json(data, { status: 201 })
}
