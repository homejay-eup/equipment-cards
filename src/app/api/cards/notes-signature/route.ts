import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return cloudinary
}

// ── POST /api/cards/notes-signature ───────────────────────────
// 料卡「備註」欄位貼圖用的 Cloudinary 簽名端點。
// 比照 /api/issues/description-signature 的「向自己 API 拿簽名 → 前端直傳 Cloudinary」模式，
// 不綁 equipment_id：新增料卡（CardFormDialog 新增模式）當下還沒有 equipment_id，
// 編輯料卡雖然有 equipment_id 但為了讓兩種模式共用同一個簽名端點與同一個 upload hook，
// 一律不要求存在的 equipment_id。
// equipment_cards 不像 issues 是部門隔離資料，全公司共用一個 folder，不需要查呼叫者部門。
// 權限：比照 PATCH /api/cards/[id] 對 notes 欄位的權限判斷（create_delete_cards 或 edit_card_notes）。
export async function POST() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('create_delete_cards') && !permissions.includes('edit_card_notes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const folder    = 'equipment-cards/card-notes'
    const timestamp = Math.floor(Date.now() / 1000)
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    // public_id 帶時間戳+隨機字串避免衝突（新增料卡當下沒有 equipment_id 可用來分隔）
    const public_id = `${folder}/${timestamp}_${randomSuffix}`

    const paramsToSign = { folder, public_id, timestamp }
    const signature = getCloudinary().utils.api_sign_request(
      paramsToSign,
      process.env.CLOUDINARY_API_SECRET!,
    )

    return NextResponse.json({
      signature,
      timestamp,
      public_id,
      folder,
      api_key:    process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    })
  } catch (err) {
    console.error('[cards/notes-signature] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}
