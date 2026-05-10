import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface BatchRow {
  equipment_id: string
  name: string
  category?: string
  vendor?: string
  status?: string
  tags?: string[]
  notes?: string
}

// ── POST /api/cards/batch ─────────────────────────────────────
// 批次新增料卡（管理員）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rows: BatchRow[]
  try {
    const body = await req.json()
    rows = body.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '無有效資料' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }

  const supabase = getSupabase()
  const inserted: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  for (const row of rows) {
    const { error } = await supabase
      .from('equipment_cards')
      .insert({
        equipment_id: row.equipment_id.trim(),
        name: row.name.trim(),
        category: row.category?.trim() || null,
        vendor: row.vendor?.trim() || null,
        status: row.status?.trim() || '現役',
        tags: Array.isArray(row.tags) ? row.tags : [],
        notes: row.notes?.trim() || null,
        detail_photos: [],
      })

    if (error) {
      if (error.code === '23505') {
        skipped.push(row.equipment_id)
      } else {
        errors.push(`${row.equipment_id}：${error.message}`)
      }
    } else {
      inserted.push(row.equipment_id)
    }
  }

  return NextResponse.json({ inserted: inserted.length, skipped, errors })
}
