import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { isLoggedIn, MAX_EXIT_OPTION_LENGTH, MAX_EXIT_OPTIONS_COUNT } from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── GET /api/maintenance/options ────────────────────────────────
// 處理後去向選項清單（依 sort_order）。所有登入使用者可讀。
export async function GET() {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_exit_options')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json({ options: data ?? [] })
  } catch (err) {
    console.error('[maintenance/options] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── PUT /api/maintenance/options ────────────────────────────────
// Body: { options: string[] } 整批覆蓋，順序即 sort_order。需 manage_maintenance_info。
// 避免「先刪後插」的非原子問題：先 upsert 新清單（label 為唯一鍵），再只刪除不在新清單內的項目，
// 任何一步失敗都不會出現「舊資料已清空、新資料未寫入」的狀態。
export async function PUT(req: NextRequest) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || !Array.isArray(body.options)) {
      return NextResponse.json({ error: 'options 必須為字串陣列' }, { status: 400 })
    }
    const labels: string[] = []
    const seen = new Set<string>()
    for (const raw of body.options) {
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'options 必須為字串陣列' }, { status: 400 })
      }
      const label = raw.trim()
      if (!label || seen.has(label)) continue
      if (label.length > MAX_EXIT_OPTION_LENGTH) {
        return NextResponse.json({ error: `單一選項不可超過 ${MAX_EXIT_OPTION_LENGTH} 字` }, { status: 400 })
      }
      seen.add(label)
      labels.push(label)
    }
    if (labels.length > MAX_EXIT_OPTIONS_COUNT) {
      return NextResponse.json({ error: `選項數量不可超過 ${MAX_EXIT_OPTIONS_COUNT} 個` }, { status: 400 })
    }

    const supabase = getSupabase()

    if (labels.length > 0) {
      const { error: upsertError } = await supabase
        .from('maintenance_exit_options')
        .upsert(labels.map((label, i) => ({ label, sort_order: i })), { onConflict: 'label' })
      if (upsertError) throw upsertError
    }

    const { data: current, error: currentError } = await supabase
      .from('maintenance_exit_options')
      .select('id, label')
    if (currentError) throw currentError
    const staleIds = (current ?? []).filter((o) => !seen.has(o.label as string)).map((o) => o.id as string)
    if (staleIds.length > 0) {
      const { error: deleteError } = await supabase.from('maintenance_exit_options').delete().in('id', staleIds)
      if (deleteError) throw deleteError
    }

    const { data, error } = await supabase
      .from('maintenance_exit_options')
      .select('id, label, sort_order')
      .order('sort_order', { ascending: true })
    if (error) throw error
    return NextResponse.json({ options: data ?? [] })
  } catch (err) {
    console.error('[maintenance/options] save error', err)
    return NextResponse.json({ error: '儲存失敗' }, { status: 500 })
  }
}
