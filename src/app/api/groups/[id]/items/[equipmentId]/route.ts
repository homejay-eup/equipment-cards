import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function DELETE(_: Request, { params }: { params: { id: string; equipmentId: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  await admin
    .from('group_items')
    .delete()
    .eq('group_id', params.id)
    .eq('equipment_id', params.equipmentId)

  // 供「設備組合」來源對齊機制比對：移除卡片也算組合內容變動
  await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', params.id)

  return new NextResponse(null, { status: 204 })
}

export async function PATCH(request: Request, { params }: { params: { id: string; equipmentId: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { quantity } = await request.json()
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 999) {
    return NextResponse.json({ error: '數量需為 1–999 的整數' }, { status: 400 })
  }

  const admin = adminClient()
  const { data: group } = await admin
    .from('user_groups')
    .select('user_id')
    .eq('id', params.id)
    .single()

  if (!group || group.user_id !== user.id) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data, error } = await admin
    .from('group_items')
    .update({ quantity })
    .eq('group_id', params.id)
    .eq('equipment_id', params.equipmentId)
    .select('equipment_id, added_at, quantity')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // 供「設備組合」來源對齊機制比對：調整數量也算組合內容變動
  await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', params.id)

  return NextResponse.json(data, { status: 200 })
}
