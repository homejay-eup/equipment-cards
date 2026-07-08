import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { getDriveClient } from '@/lib/googleDrive'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── PATCH /api/documents/[id] ───────────────────────────────────
// FormData: file（必填，新版本內容）
// 用 Drive files.update 對同一個 drive_file_id 上傳新版本內容，
// 檔案 ID 與 webViewLink 都不變 → 不需要重算任何卡片的 documents 快取，
// 所有引用這份文件的料號透過既有 url 自動看到新內容。
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('edit_card_documents')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file 為必填' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data: doc, error: docError } = await supabase
      .from('documents')
      .select('id, drive_file_id')
      .eq('id', params.id)
      .maybeSingle()
    if (docError) throw docError
    if (!doc) return NextResponse.json({ error: '找不到文件' }, { status: 404 })

    const buffer = Buffer.from(await file.arrayBuffer())
    const drive = await getDriveClient()

    try {
      await drive.files.update({
        fileId: doc.drive_file_id,
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: Readable.from(buffer),
        },
        supportsAllDrives: true,
      })
    } catch (driveErr) {
      console.error('[documents/patch] Drive update error', driveErr)
      return NextResponse.json({ error: 'Google Drive 更新版本失敗' }, { status: 502 })
    }

    const { error: touchError } = await supabase
      .from('documents')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', params.id)
    if (touchError) throw touchError

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[documents/patch] error', err)
    return NextResponse.json({ error: '更新版本失敗' }, { status: 500 })
  }
}
