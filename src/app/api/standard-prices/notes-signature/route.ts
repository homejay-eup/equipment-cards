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

// ── POST /api/standard-prices/notes-signature ─────────────────
// 標準售價「備註」欄位貼圖用的 Cloudinary 簽名端點（比照 /api/cards/notes-signature）。
// 不綁 standard_price_items.id：新增產品/另存新版本當下還沒有 id，新增與編輯共用同一個端點。
// 標準售價是全公司共用資料（非部門隔離），全部放同一個 folder，不需要查呼叫者部門。
// 權限：edit_quotes（跟新增/修改標準售價一致）。
export async function POST() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_quotes')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const folder    = 'equipment-cards/standard-prices'
    const timestamp = Math.floor(Date.now() / 1000)
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    // public_id 帶時間戳+隨機字串避免衝突（新增當下沒有 id 可用來分隔）
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
    console.error('[standard-prices/notes-signature] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}
