import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = adminClient()

  // 查詢現有群組
  let { data: groups } = await admin
    .from('user_groups')
    .select('*, group_items(equipment_id, added_at, quantity, sort_order)')
    .eq('user_id', user.id)
    .order('is_default', { ascending: false })
    .order('sort_order')
    .order('sort_order', { foreignTable: 'group_items', ascending: true })

  // 懶遷移：若完全沒有群組，從 user_bookmarks 遷移
  if (!groups || groups.length === 0) {
    const { data: bookmarks } = await admin
      .from('user_bookmarks')
      .select('equipment_id, created_at')
      .eq('user_id', user.id)

    const { data: newGroup } = await admin
      .from('user_groups')
      .insert({ user_id: user.id, name: '我的關注', is_default: true })
      .select()
      .single()

    if (newGroup && bookmarks && bookmarks.length > 0) {
      // 依料號升序給初始排序值，比照 step36 backfill 邏輯
      const sorted = [...bookmarks].sort((a, b) => a.equipment_id.localeCompare(b.equipment_id))
      await admin.from('group_items').insert(
        sorted.map((b: { equipment_id: string; created_at: string }, idx: number) => ({
          group_id: newGroup.id,
          equipment_id: b.equipment_id,
          added_at: b.created_at,
          sort_order: (idx + 1) * 1000,
        }))
      )
    }

    const { data: fresh } = await admin
      .from('user_groups')
      .select('*, group_items(equipment_id, added_at, quantity, sort_order)')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('sort_order')
      .order('sort_order', { foreignTable: 'group_items', ascending: true })
    groups = fresh
  }

  return NextResponse.json(groups ?? [])
}

export async function POST(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const admin = adminClient()
  const { data, error } = await admin
    .from('user_groups')
    .insert({ user_id: user.id, name: name.trim() })
    .select('*, group_items(equipment_id, added_at, quantity, sort_order)')
    .single()

  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: '群組名稱已存在' }, { status: 409 })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}
