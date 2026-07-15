import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// POST /api/analytics/event — 記錄關鍵功能使用事件（通用事件表）
// email 一律從伺服器端 session 取得，不信任前端傳來的值
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  let event_type: unknown
  let metadata: unknown
  try {
    const body = await req.json()
    event_type = body?.event_type
    metadata = body?.metadata
  } catch {
    return NextResponse.json({ error: 'event_type 必填' }, { status: 400 })
  }

  if (typeof event_type !== 'string' || event_type.trim().length === 0) {
    return NextResponse.json({ error: 'event_type 必填' }, { status: 400 })
  }

  try {
    const service = getSupabase()
    const { error } = await service
      .from('usage_events')
      .insert({
        email: user.email,
        event_type,
        metadata: metadata ?? null,
      })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[analytics/event] error', err)
    return NextResponse.json({ error: '事件記錄失敗' }, { status: 500 })
  }
}
