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

// POST /api/analytics/heartbeat — 前端每 60 秒呼叫一次，估算單次停留時長
// email 一律從伺服器端 session 取得，不信任前端傳來的值
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: '未登入' }, { status: 401 })
  }

  let session_id: string | undefined
  try {
    const body = await req.json()
    session_id = body?.session_id
  } catch {
    return NextResponse.json({ error: 'session_id 必填' }, { status: 400 })
  }

  if (!session_id || typeof session_id !== 'string') {
    return NextResponse.json({ error: 'session_id 必填' }, { status: 400 })
  }

  try {
    const service = getSupabase()

    // 一併比對 email，避免同一分頁換帳號登入時，心跳誤更新到別人名下的 session
    // （sessionStorage 存的 session_id 只在分頁關閉時失效，登出不會清除）
    const { data: existing } = await service
      .from('usage_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('email', user.email)
      .maybeSingle()

    if (existing) {
      const { error } = await service
        .from('usage_sessions')
        .update({ last_ping_at: new Date().toISOString() })
        .eq('id', session_id)
      if (error) throw error
    } else {
      // 若這個 id 其實屬於別人（PK 衝突），insert 會失敗——直接吞掉即可，
      // 這是 fire-and-forget 記錄功能，不需要讓前端知道或重試
      const { error } = await service
        .from('usage_sessions')
        .insert({ id: session_id, email: user.email })
      if (error && error.code !== '23505') throw error
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[analytics/heartbeat] error', err)
    return NextResponse.json({ error: '心跳記錄失敗' }, { status: 500 })
  }
}
