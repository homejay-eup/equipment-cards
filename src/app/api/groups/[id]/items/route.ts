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

  const insertPayload: { group_id: string; equipment_id: string; quantity?: number } = {
    group_id: params.id,
    equipment_id,
  }
  if (quantity !== undefined) insertPayload.quantity = quantity

  const { data, error } = await admin
    .from('group_items')
    .insert(insertPayload)
    .select()
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '已在群組中' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 供「設備套餐」來源對齊機制比對：加卡也算群組內容變動
  await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json(data, { status: 201 })
}
