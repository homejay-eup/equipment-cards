import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ── POST /api/groups/[id]/duplicate ──────────────────────────
// 複製個人組合（A -> B），複製 group_items，不建立任何來源關聯
// body: { name: string }
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { name } = await request.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const admin = adminClient()

  const { data: source } = await admin
    .from('user_groups')
    .select('user_id, group_items(equipment_id, added_at, quantity, sort_order)')
    .eq('id', params.id)
    .single()

  if (!source || source.user_id !== user.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: newGroup, error: insertError } = await admin
    .from('user_groups')
    .insert({ user_id: user.id, name: name.trim() })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json({ error: '組合名稱已存在' }, { status: 409 })
    }
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  const items = (source.group_items ?? []) as { equipment_id: string; quantity: number; sort_order: number }[]
  if (items.length > 0) {
    const { error: itemsError } = await admin
      .from('group_items')
      .insert(items.map((i) => ({
        group_id: newGroup.id,
        equipment_id: i.equipment_id,
        quantity: i.quantity,
        sort_order: i.sort_order,
      })))
    if (itemsError) {
      return NextResponse.json({ error: itemsError.message }, { status: 500 })
    }
  }

  const { data: full } = await admin
    .from('user_groups')
    .select('*, group_items(equipment_id, added_at, quantity, sort_order)')
    .eq('id', newGroup.id)
    .order('sort_order', { foreignTable: 'group_items', ascending: true })
    .single()

  return NextResponse.json(full ?? { ...newGroup, group_items: [] }, { status: 201 })
}
