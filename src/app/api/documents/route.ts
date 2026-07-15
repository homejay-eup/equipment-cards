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

interface CardDocumentLinkWithCardRow {
  equipment_id: string
  equipment_cards: { equipment_id: string; name: string } | { equipment_id: string; name: string }[] | null
}

// ── GET /api/documents?equipment_id= ────────────────────────────
// 依料號查詢已掛載的文件清單（取代前端用名稱模糊搜尋反查的方式，
// 避免同一張卡片掛載兩份「名稱恰好相同」的文件時被誤判成同一份）
// 回傳格式比照 /api/documents/search：{ documents: DocumentSearchResult[] }
//
// 省略 equipment_id、改帶 document_id 時（CardFormDialog「先刪除舊的再上傳」二次確認用）：
// 反查這一筆文件目前掛載的所有料卡，只需要 edit_card_documents 權限（不需要 manage_documents，
// 一般編輯者也看得到完整受影響料卡清單，避免誤刪別人在用的文件）。
// 回傳格式：{ document: { id, name, type, url, drive_file_id, created_at, updated_at, linked_cards } }
// linked_cards 形狀比照「列出全部」模式，方便前端共用同一份 render 邏輯。
//
// 兩者都省略時（文件管理頁面用）：改查全部文件，需要 manage_documents 權限，
// 每筆額外帶出 linked_cards（掛載料卡的 equipment_id + name），供文件管理頁面顯示
// 掛載張數／批次刪除前列出受影響料卡清單。⚠️ equipment_id 分支的回傳格式
// （equipment_ids: string[]）維持不變，useDocumentUpload.ts 的 listByEquipment() 依賴這個格式。
export async function GET(req: NextRequest) {
  const equipment_id = req.nextUrl.searchParams.get('equipment_id')?.trim()
  const document_id = req.nextUrl.searchParams.get('document_id')?.trim()

  if (equipment_id) {
    if (!await requirePermission('edit_card_documents')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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

  // ── 沒帶 equipment_id，改帶 document_id：反查單一文件的掛載料卡清單 ─
  if (document_id) {
    if (!await requirePermission('edit_card_documents')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    try {
      const supabase = getSupabase()

      const { data, error } = await supabase
        .from('documents')
        .select(
          'id, name, type, url, drive_file_id, created_at, updated_at, ' +
          'card_documents(equipment_id, equipment_cards(equipment_id, name))',
        )
        .eq('id', document_id)
        .maybeSingle()

      if (error) throw error
      if (!data) {
        return NextResponse.json({ error: '找不到文件' }, { status: 404 })
      }

      const doc = data as unknown as {
        id: string; name: string; type: string; url: string; drive_file_id: string
        created_at: string; updated_at: string
        card_documents: CardDocumentLinkWithCardRow[] | null
      }

      const linkRows = doc.card_documents ?? []
      const linkedCards = linkRows
        .map((row) => {
          const card = Array.isArray(row.equipment_cards) ? row.equipment_cards[0] : row.equipment_cards
          return card ? { equipment_id: card.equipment_id, name: card.name } : null
        })
        .filter((c): c is { equipment_id: string; name: string } => c !== null)

      return NextResponse.json({
        document: {
          id: doc.id,
          name: doc.name,
          type: doc.type,
          url: doc.url,
          drive_file_id: doc.drive_file_id,
          created_at: doc.created_at,
          updated_at: doc.updated_at,
          linked_cards: linkedCards,
        },
      })
    } catch (err) {
      console.error('[documents] find-by-id error', err)
      return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
    }
  }

  // ── 沒帶 equipment_id：文件管理頁面用，查全部文件 ─────────────
  if (!await requirePermission('manage_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    const { data, error } = await supabase
      .from('documents')
      .select(
        'id, name, type, url, drive_file_id, created_at, updated_at, ' +
        'card_documents(equipment_id, equipment_cards(equipment_id, name))',
      )
      .order('created_at', { ascending: false })

    if (error) throw error

    // Supabase 型別推論在多層 embed（card_documents → equipment_cards）超過一層時
    // 會退化成 GenericStringError，這裡另外宣告正確形狀後手動 cast
    interface DocumentAllRow {
      id: string
      name: string
      type: string
      url: string
      drive_file_id: string
      created_at: string
      updated_at: string
      card_documents: CardDocumentLinkWithCardRow[] | null
    }
    const rows = (data ?? []) as unknown as DocumentAllRow[]

    const results = rows.map((doc) => {
      const linkRows = doc.card_documents ?? []
      const linkedCards = linkRows
        .map((row) => {
          const card = Array.isArray(row.equipment_cards) ? row.equipment_cards[0] : row.equipment_cards
          return card ? { equipment_id: card.equipment_id, name: card.name } : null
        })
        .filter((c): c is { equipment_id: string; name: string } => c !== null)

      return {
        id: doc.id,
        name: doc.name,
        type: doc.type,
        url: doc.url,
        drive_file_id: doc.drive_file_id,
        created_at: doc.created_at,
        updated_at: doc.updated_at,
        linked_cards: linkedCards,
      }
    })

    return NextResponse.json({ documents: results })
  } catch (err) {
    console.error('[documents] list-all error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
