import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'
import { validateRichContent } from '@/lib/richContentValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/cards ───────────────────────────────────────────
// 新增料卡（管理員）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { equipment_id, name, category, vendor, status, tags, notes, notes_image_urls, notes_table_data, is_new, net_weight } = body

    if (!equipment_id || !name) {
      return NextResponse.json({ error: '料號和品名為必填' }, { status: 400 })
    }

    const notesValidation = validateRichContent({
      content: notes,
      image_urls: notes_image_urls,
      table_data: notes_table_data,
    })
    if (!notesValidation.ok) {
      return NextResponse.json({ error: notesValidation.error }, { status: notesValidation.status })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('equipment_cards')
      .insert({
        equipment_id: equipment_id.trim(),
        name: name.trim(),
        category: category || null,
        vendor: vendor?.trim() || null,
        status: status ?? 'active',
        tags: Array.isArray(tags) ? tags : [],
        notes: notesValidation.content,
        notes_image_urls: notesValidation.images,
        notes_table_data: notesValidation.table,
        is_new: is_new !== false,
        detail_photos: [],
        net_weight: (typeof net_weight === 'number' && !isNaN(net_weight)) ? net_weight : null,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: '料號已存在' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('[cards] create error', err)
    return NextResponse.json({ error: '建立失敗' }, { status: 500 })
  }
}
