import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { getDriveClient } from '@/lib/googleDrive'
import { recomputeCardDocumentsCache } from '@/lib/documents'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/documents/[id]/link ───────────────────────────────
// Body: { equipment_id: string }
// 把既有文件掛到另一個料號（純建立關聯，不重新上傳）→ 重算該卡片快取
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('edit_card_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const equipment_id = body?.equipment_id
    if (typeof equipment_id !== 'string' || !equipment_id.trim()) {
      return NextResponse.json({ error: 'equipment_id 為必填' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (docError) throw docError
    if (!doc) return NextResponse.json({ error: '找不到文件' }, { status: 404 })

    const { data: card, error: cardError } = await supabase
      .from('equipment_cards')
      .select('equipment_id')
      .eq('equipment_id', equipment_id)
      .maybeSingle()
    if (cardError) throw cardError
    if (!card) return NextResponse.json({ error: '找不到料號' }, { status: 404 })

    const { error: linkError } = await supabase
      .from('card_documents')
      .insert({ equipment_id, document_id: params.id })

    if (linkError) {
      if (linkError.code === '23505') {
        return NextResponse.json({ error: '此文件已掛載於該料號' }, { status: 409 })
      }
      throw linkError
    }

    await recomputeCardDocumentsCache(equipment_id)

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[documents/link] link error', err)
    return NextResponse.json({ error: '掛載失敗' }, { status: 500 })
  }
}

// ── DELETE /api/documents/[id]/link?equipment_id= ───────────────
// 只解除該卡片與文件的關聯；若這是該文件最後一個關聯，才真的刪除文件本體
// （Drive 檔案 + documents 列）→ 重算該卡片快取
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('edit_card_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const equipment_id = req.nextUrl.searchParams.get('equipment_id')
  if (!equipment_id) {
    return NextResponse.json({ error: 'equipment_id 為必填查詢參數' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()

    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, drive_file_id')
      .eq('id', params.id)
      .maybeSingle()
    if (docError) throw docError
    if (!doc) return NextResponse.json({ error: '找不到文件' }, { status: 404 })

    const { error: deleteLinkError, count: deletedCount } = await supabase
      .from('card_documents')
      .delete({ count: 'exact' })
      .eq('equipment_id', equipment_id)
      .eq('document_id', params.id)
    if (deleteLinkError) throw deleteLinkError
    if (!deletedCount) {
      return NextResponse.json({ error: '此文件未掛載於該料號' }, { status: 404 })
    }

    await recomputeCardDocumentsCache(equipment_id)

    // 檢查文件是否還有其他關聯
    const { count, error: countError } = await supabase
      .from('card_documents')
      .select('equipment_id', { count: 'exact', head: true })
      .eq('document_id', params.id)
    if (countError) throw countError

    if ((count ?? 0) === 0) {
      // 最後一個關聯：連同刪除文件本體
      const drive = await getDriveClient()
      await drive.files
        .delete({ fileId: doc.drive_file_id, supportsAllDrives: true })
        .catch((driveErr) => {
          console.error('[documents/link] Drive delete failed', driveErr)
        })

      const { error: deleteDocError } = await supabase
        .from('documents')
        .delete()
        .eq('id', params.id)
      if (deleteDocError) throw deleteDocError

      return NextResponse.json({ ok: true, document_deleted: true })
    }

    return NextResponse.json({ ok: true, document_deleted: false })
  } catch (err) {
    console.error('[documents/link] unlink error', err)
    return NextResponse.json({ error: '解除掛載失敗' }, { status: 500 })
  }
}
