import { NextRequest, NextResponse } from 'next/server'
import { Readable } from 'stream'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { getDriveClient, DRIVE_FOLDER_ID } from '@/lib/googleDrive'
import { recomputeCardDocumentsCache } from '@/lib/documents'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── POST /api/documents/upload ──────────────────────────────────
// FormData:
//   file           必填，實際檔案
//   type           必填，文件類型（如「規格書」「證明文件」）
//   name           選填，顯示名稱，預設用檔名（去副檔名）
//   equipment_ids  必填，JSON 陣列字串，可一次綁定多個料號，如 '["1000003","1000004"]'
//
// 流程：上傳到 Drive（Service Account）→ 建立 documents 列 → 建立 card_documents 關聯
//       → 重算受影響卡片的 documents 快取欄位
export async function POST(req: NextRequest) {
  const user = await requirePermission('edit_card_documents')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (!DRIVE_FOLDER_ID) {
    console.error('[documents/upload] GOOGLE_DRIVE_FOLDER_ID 未設定')
    return NextResponse.json(
      { error: '伺服器尚未設定 Google Drive 上傳資料夾，請聯絡管理員' },
      { status: 500 },
    )
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const type = formData.get('type')
    const nameField = formData.get('name')
    const equipmentIdsRaw = formData.get('equipment_ids')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file 為必填' }, { status: 400 })
    }
    if (typeof type !== 'string' || !type.trim()) {
      return NextResponse.json({ error: 'type 為必填' }, { status: 400 })
    }
    if (typeof equipmentIdsRaw !== 'string') {
      return NextResponse.json({ error: 'equipment_ids 為必填（JSON 陣列字串）' }, { status: 400 })
    }

    let equipmentIds: unknown
    try {
      equipmentIds = JSON.parse(equipmentIdsRaw)
    } catch {
      return NextResponse.json({ error: 'equipment_ids 格式錯誤，需為 JSON 陣列字串' }, { status: 400 })
    }
    if (
      !Array.isArray(equipmentIds) ||
      equipmentIds.length === 0 ||
      !equipmentIds.every((id) => typeof id === 'string' && id.trim())
    ) {
      return NextResponse.json({ error: 'equipment_ids 需為至少一筆非空字串的陣列' }, { status: 400 })
    }
    const ids = equipmentIds as string[]

    const displayName =
      typeof nameField === 'string' && nameField.trim()
        ? nameField.trim()
        : file.name.replace(/\.[^./]+$/, '')

    const supabase = getSupabase()

    // 上傳前先確認所有料號存在，避免傳到 Drive 之後才發現料號無效
    const { data: existingCards, error: cardsError } = await supabase
      .from('equipment_cards')
      .select('equipment_id')
      .in('equipment_id', ids)

    if (cardsError) throw cardsError
    const existingIds = new Set((existingCards ?? []).map((c) => c.equipment_id as string))
    const missingIds = ids.filter((id) => !existingIds.has(id))
    if (missingIds.length > 0) {
      return NextResponse.json({ error: `找不到料號：${missingIds.join('、')}` }, { status: 404 })
    }

    // 1. 上傳到 Google Drive
    const buffer = Buffer.from(await file.arrayBuffer())
    const drive = await getDriveClient()
    let driveFileId: string | null | undefined
    let webViewLink: string | null | undefined
    try {
      const driveRes = await drive.files.create({
        requestBody: {
          name: file.name,
          parents: [DRIVE_FOLDER_ID],
        },
        media: {
          mimeType: file.type || 'application/octet-stream',
          body: Readable.from(buffer),
        },
        fields: 'id, webViewLink',
        supportsAllDrives: true,
      })
      driveFileId = driveRes.data.id
      webViewLink = driveRes.data.webViewLink
    } catch (driveErr) {
      console.error('[documents/upload] Drive upload error', driveErr)
      return NextResponse.json({ error: 'Google Drive 上傳失敗' }, { status: 502 })
    }

    if (!driveFileId || !webViewLink) {
      return NextResponse.json({ error: 'Drive 上傳未回傳有效檔案資訊' }, { status: 502 })
    }

    // 2. 建立 documents 列
    const { data: docRow, error: docError } = await supabase
      .from('documents')
      .insert({
        name: displayName,
        type: type.trim(),
        drive_file_id: driveFileId,
        url: webViewLink,
        uploaded_by: user.email ?? null,
      })
      .select()
      .single()

    if (docError) {
      // DB 寫入失敗，清理已上傳的 Drive 檔案避免孤兒檔案
      await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(() => {})
      throw docError
    }

    // 3. 建立 card_documents 關聯
    const { error: linkError } = await supabase
      .from('card_documents')
      .insert(ids.map((equipment_id) => ({ equipment_id, document_id: docRow.id })))

    if (linkError) {
      // 關聯建立失敗，回滾 documents 列與 Drive 檔案
      await supabase.from('documents').delete().eq('id', docRow.id)
      await drive.files.delete({ fileId: driveFileId, supportsAllDrives: true }).catch(() => {})
      throw linkError
    }

    // 4. 重算受影響卡片的快取（核心資料已寫入成功，快取失敗不應讓整個上傳回報失敗）
    try {
      await Promise.all(ids.map((id) => recomputeCardDocumentsCache(id)))
    } catch (cacheErr) {
      console.error('[documents/upload] recomputeCardDocumentsCache error', cacheErr)
    }

    return NextResponse.json({ document: docRow, linked_equipment_ids: ids }, { status: 201 })
  } catch (err) {
    console.error('[documents/upload] error', err)
    return NextResponse.json({ error: '文件上傳失敗' }, { status: 500 })
  }
}
