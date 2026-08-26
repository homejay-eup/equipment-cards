import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

const SETTINGS_KEY = 'analytics_visible_columns'

// GET /api/admin/analytics/columns — 使用統計欄位顯示設定（全域，不分部門），需 view_analytics
// 沒有資料時回傳空陣列（代表預設全部欄位都不顯示，走 opt-in）
export async function GET() {
  if (!await requirePermission('view_analytics')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { data, error } = await getSupabase()
      .from('app_settings')
      .select('value')
      .eq('key', SETTINGS_KEY)
      .maybeSingle()

    if (error) throw error

    const columns = Array.isArray(data?.value) ? data.value : []
    return NextResponse.json({ columns })
  } catch (err) {
    console.error('[admin/analytics/columns] GET error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// PATCH /api/admin/analytics/columns — 更新使用統計欄位顯示設定，需 view_analytics
// body: { columns: string[] }
export async function PATCH(req: NextRequest) {
  if (!await requirePermission('view_analytics')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const columns = body?.columns
    if (!Array.isArray(columns) || !columns.every((c) => typeof c === 'string')) {
      return NextResponse.json({ error: 'columns 必須為字串陣列' }, { status: 400 })
    }

    const { error } = await getSupabase()
      .from('app_settings')
      .upsert({ key: SETTINGS_KEY, value: columns }, { onConflict: 'key' })

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[admin/analytics/columns] PATCH error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}
