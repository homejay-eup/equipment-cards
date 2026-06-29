import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// POST /api/cards/lookup
// 批次查詢料卡現有欄位值（供批次匯入預覽比對用）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json([])
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('equipment_cards')
      .select('equipment_id, category, vendor, notes, tags, net_weight')
      .in('equipment_id', ids)

    if (error) throw error
    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('[cards/lookup] error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
