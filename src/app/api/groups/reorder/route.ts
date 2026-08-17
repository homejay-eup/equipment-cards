import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

const adminClient = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function PATCH(request: Request) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { orders } = await request.json()
  if (!Array.isArray(orders)) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const admin = adminClient()
  const ids = orders.map((o: { id: string }) => o.id)

  // 驗證所有組合都屬於當前使用者，且不是預設組合
  const { data: groups, error } = await admin
    .from('user_groups')
    .select('id, is_default')
    .in('id', ids)
    .eq('user_id', user.id)

  if (error || !groups) return NextResponse.json({ error: 'Query failed' }, { status: 500 })
  if (groups.length !== ids.length) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (groups.some((g: { is_default: boolean }) => g.is_default)) {
    return NextResponse.json({ error: 'Cannot reorder default group' }, { status: 400 })
  }

  const updates = await Promise.allSettled(
    orders.map((o: { id: string; sort_order: number }) =>
      admin
        .from('user_groups')
        .update({ sort_order: o.sort_order })
        .eq('id', o.id)
        .eq('user_id', user.id)
    )
  )

  const failed = updates.filter(r => r.status === 'rejected').length
  if (failed > 0) return NextResponse.json({ error: 'Partial update failed' }, { status: 500 })

  return NextResponse.json({ ok: true })
}
