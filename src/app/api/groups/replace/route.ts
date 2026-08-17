import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { old_equipment_id, new_equipment_id, group_ids } = await request.json()
  if (!old_equipment_id || !new_equipment_id || !Array.isArray(group_ids) || group_ids.length === 0) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const admin = adminClient()

  // 確認所有 group_ids 都屬於此使用者
  const { data: userGroups } = await admin
    .from('user_groups')
    .select('id')
    .eq('user_id', user.id)
    .in('id', group_ids)

  if (!userGroups || userGroups.length !== group_ids.length) {
    return NextResponse.json({ error: 'Unauthorized group' }, { status: 403 })
  }

  // 先查這批組合裡舊料卡目前的數量與排序位置，替換時把兩者都帶過去
  // （數量不重置成 1；排序位置沿用同一個位置，不讓替換後的料卡跑到清單最後面）
  const { data: oldItems } = await admin
    .from('group_items')
    .select('group_id, quantity, sort_order')
    .in('group_id', group_ids)
    .eq('equipment_id', old_equipment_id)

  const oldItemByGroupId = new Map<string, { quantity: number; sort_order: number }>(
    (oldItems ?? []).map((i: { group_id: string; quantity: number; sort_order: number }) => [
      i.group_id,
      { quantity: i.quantity, sort_order: i.sort_order },
    ]),
  )

  // 在每個組合中刪除舊料卡、插入新料卡
  for (const groupId of group_ids) {
    await admin.from('group_items').delete()
      .eq('group_id', groupId).eq('equipment_id', old_equipment_id)
    // ON CONFLICT DO NOTHING：新料卡本來就在組合裡也不報錯
    const oldItem = oldItemByGroupId.get(groupId)
    const insertPayload: { group_id: string; equipment_id: string; quantity?: number; sort_order?: number } = {
      group_id: groupId,
      equipment_id: new_equipment_id,
    }
    if (oldItem !== undefined) {
      insertPayload.quantity = oldItem.quantity
      insertPayload.sort_order = oldItem.sort_order
    }
    try {
      await admin.from('group_items').insert(insertPayload)
    } catch {
      // ignore duplicate key error
    }
    // 供「設備組合」來源對齊機制比對：替換卡片也算組合內容變動
    await admin.from('user_groups').update({ updated_at: new Date().toISOString() }).eq('id', groupId)
  }

  return NextResponse.json({ success: true })
}
