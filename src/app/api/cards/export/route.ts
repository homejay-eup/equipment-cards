import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function csvEscape(value: string | null | undefined): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

// ── GET /api/cards/export ─────────────────────────────────────
// 匯出全部料卡為 CSV（管理員）
export async function GET() {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getSupabase()
  const { data: cards, error } = await supabase
    .from('equipment_cards')
    .select('equipment_id, name, category, vendor, status, tags, notes, net_weight, is_new')
    .order('equipment_id', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const headerRow = 'equipment_id,name,category,vendor,status,tags,notes,net_weight,is_new'
  const dataRows = (cards ?? []).map(card => [
    csvEscape(card.equipment_id),
    csvEscape(card.name),
    csvEscape(card.category),
    csvEscape(card.vendor),
    csvEscape(card.status),
    csvEscape((card.tags ?? []).join('|')),
    csvEscape(card.notes),
    card.net_weight != null ? String(card.net_weight) : '',
    card.is_new === true ? 'true' : 'false',
  ].join(','))

  // UTF-8 BOM 讓 Excel 開啟不亂碼
  const csv = '﻿' + headerRow + '\n' + dataRows.join('\n')
  const date = new Date().toISOString().split('T')[0]

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="equipment-cards-${date}.csv"`,
    },
  })
}
