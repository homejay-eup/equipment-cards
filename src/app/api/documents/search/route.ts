import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface CardDocumentLinkRow {
  equipment_id: string
}

// ── GET /api/documents/search?name= ─────────────────────────────
// 依名稱模糊查詢既有文件，回傳文件資訊 + 目前掛載的料號清單
// 用途：前端「挑選既有文件」流程，避免同一份文件被重複上傳；
//       也用於顯示「此文件目前用於：料號A、料號B」
export async function GET(req: NextRequest) {
  if (!await requirePermission('edit_card_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const name = req.nextUrl.searchParams.get('name')?.trim()
  if (!name) {
    return NextResponse.json({ error: 'name 為必填查詢參數' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, type, url, drive_file_id, created_at, updated_at, card_documents(equipment_id)')
      .ilike('name', `%${name}%`)
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw error

    const results = (data ?? []).map((doc) => {
      const links = (doc.card_documents ?? []) as CardDocumentLinkRow[]
      return {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        url: doc.url,
        drive_file_id: doc.drive_file_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        equipment_ids: links.map((c) => c.equipment_id),
      }
    })

    return NextResponse.json({ documents: results })
  } catch (err) {
    console.error('[documents/search] error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
