import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v2 as cloudinary } from 'cloudinary'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { validateRichContent } from '@/lib/richContentValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return cloudinary
}

// ── DELETE /api/issues/[id]/updates/[updateId] ───────────────
// 刪除更新紀錄
// 權限：更新的建立者 OR 擁有 create_issues 權限
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; updateId: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // 取得既有更新紀錄
    const { data: update, error: fetchError } = await supabase
      .from('issue_updates')
      .select('id, created_by, issue_id, image_urls')
      .eq('id', params.updateId)
      .single()

    if (fetchError || !update) {
      return NextResponse.json({ error: '找不到更新紀錄' }, { status: 404 })
    }

    // 確認 updateId 屬於指定 issue
    if (update.issue_id !== params.id) {
      return NextResponse.json({ error: '更新紀錄不屬於此議題' }, { status: 400 })
    }

    // 權限檢查：建立者本人 OR 擁有 create_issues 權限
    const isOwner = update.created_by === user.email
    if (!isOwner) {
      const { permissions } = await getUserRoleWithPermissions()
      if (!permissions.includes('create_issues')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    // best effort：逐一刪除 Cloudinary 圖片。這裡的簽名是本專案自己的 Cloudinary API key，
    // 沒有 Google Drive Service Account 那種權限限制，可以直接刪除（跟 Drive「留給人工」不同）。
    // 即使 Cloudinary 刪除失敗（例如網路問題），也不擋住使用者刪除這筆更新紀錄。
    const images = (update.image_urls ?? []) as { public_id: string; url: string }[]
    let cloudinaryWarning: string | null = null
    if (images.length > 0) {
      const results = await Promise.allSettled(
        images.map((img) => getCloudinary().uploader.destroy(img.public_id)),
      )
      const failedCount = results.filter((r) => r.status === 'rejected').length
      if (failedCount > 0) {
        console.error(`[issues/updates/[updateId]] Cloudinary 刪除失敗 ${failedCount}/${images.length} 張`, results)
        cloudinaryWarning = `更新紀錄已刪除，但有 ${failedCount} 張圖片未能從 Cloudinary 清除`
      }
    }

    const { error } = await supabase
      .from('issue_updates')
      .delete()
      .eq('id', params.updateId)

    if (error) throw error

    return NextResponse.json({ success: true, warning: cloudinaryWarning })
  } catch (err) {
    console.error('[issues/updates/[updateId]] delete error', err)
    return NextResponse.json({ error: '刪除更新紀錄失敗' }, { status: 500 })
  }
}

// ── PATCH /api/issues/[id]/updates/[updateId] ────────────────
// 修改更新紀錄（文字＋圖片＋表格皆可改，跟新增留言功能對等）
// 修改後直接把 updated_at 寫入當下時間，前端顯示時 fallback：updated_at ?? created_at
// 權限：更新的建立者 OR 擁有 create_issues 權限（比照 DELETE）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; updateId: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // 取得既有更新紀錄
    const { data: update, error: fetchError } = await supabase
      .from('issue_updates')
      .select('id, created_by, issue_id, image_urls')
      .eq('id', params.updateId)
      .single()

    if (fetchError || !update) {
      return NextResponse.json({ error: '找不到更新紀錄' }, { status: 404 })
    }

    // 確認 updateId 屬於指定 issue
    if (update.issue_id !== params.id) {
      return NextResponse.json({ error: '更新紀錄不屬於此議題' }, { status: 400 })
    }

    // 權限檢查：建立者本人 OR 擁有 create_issues 權限
    const isOwner = update.created_by === user.email
    if (!isOwner) {
      const { permissions } = await getUserRoleWithPermissions()
      if (!permissions.includes('create_issues')) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
    }

    const body = await req.json()

    // 共用驗證，跟 POST .../updates 一致：文字/圖片/表格三者至少要有一項才視為有效更新
    const validation = validateRichContent(body, { requireNonEmpty: true })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }
    const { content, images, table } = validation

    // best effort：比對移除掉的圖片，逐一呼叫 Cloudinary 刪除（跟 DELETE 的做法一致，
    // 即使 Cloudinary 刪除失敗也不擋住修改本身）。只刪除「舊資料裡有、新資料裡沒有」的圖片，
    // 保留的圖片（原封不動或位置調整）不受影響。
    const oldImages = (update.image_urls ?? []) as { public_id: string; url: string }[]
    const keptPublicIds = new Set(images.map((img) => img.public_id))
    const removedImages = oldImages.filter((img) => !keptPublicIds.has(img.public_id))

    let cloudinaryWarning: string | null = null
    if (removedImages.length > 0) {
      const results = await Promise.allSettled(
        removedImages.map((img) => getCloudinary().uploader.destroy(img.public_id)),
      )
      const failedCount = results.filter((r) => r.status === 'rejected').length
      if (failedCount > 0) {
        console.error(`[issues/updates/[updateId]] PATCH Cloudinary 刪除失敗 ${failedCount}/${removedImages.length} 張`, results)
        cloudinaryWarning = `更新紀錄已修改，但有 ${failedCount} 張圖片未能從 Cloudinary 清除`
      }
    }

    const { data: updated, error } = await supabase
      .from('issue_updates')
      .update({
        content,
        image_urls: images,
        table_data: table,
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.updateId)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ...updated, warning: cloudinaryWarning })
  } catch (err) {
    console.error('[issues/updates/[updateId]] update error', err)
    return NextResponse.json({ error: '修改更新紀錄失敗' }, { status: 500 })
  }
}
