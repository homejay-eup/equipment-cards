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

// ── GET /api/documents?equipment_id= ────────────────────────────
// 依料號查詢已掛載的文件清單（取代前端用名稱模糊搜尋反查的方式，
// 避免同一張卡片掛載兩份「名稱恰好相同」的文件時被誤判成同一份）
// 回傳格式比照 /api/documents/search：{ documents: DocumentSearchResult[] }
export async function GET(req: NextRequest) {
  if (!await requirePermission('edit_card_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const equipment_id = req.nextUrl.searchParams.get('equipment_id')?.trim()
  if (!equipment_id) {
    return NextResponse.json({ error: 'equipment_id 為必填查詢參數' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()

    // Step 1：先查這張卡片掛載了哪些文件 id
    const { data: links, error: linkError } = await supabase
      .from('card_documents')
      .select('document_id')
      .eq('equipment_id', equipment_id)
    if (linkError) throw linkError

    const documentIds = (links ?? []).map((l) => l.document_id)
    if (documentIds.length === 0) {
      return NextResponse.json({ documents: [] })
    }

    // Step 2：查文件本體，並一併帶出每份文件完整的關聯料號清單
    const { data, error } = await supabase
      .from('documents')
      .select('id, name, type, url, drive_file_id, created_at, updated_at, card_documents(equipment_id)')
      .in('id', documentIds)
      .order('created_at', { ascending: false })

    if (error) throw error

    const results = (data ?? []).map((doc) => {
      const linkRows = (doc.card_documents ?? []) as CardDocumentLinkRow[]
      return {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        url: doc.url,
        drive_file_id: doc.drive_file_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        equipment_ids: linkRows.map((c) => c.equipment_id),
      }
    })

    return NextResponse.json({ documents: results })
  } catch (err) {
    console.error('[documents] list-by-equipment error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
