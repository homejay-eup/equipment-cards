import { NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { requirePermission } from '@/lib/admin'
import { MAINTENANCE_RULE_IMAGE_FOLDER } from '@/lib/maintenanceCloudinary'

// ── POST /api/maintenance/rules/content-signature ──────────────
// 維修資訊規則「內容」貼圖用的 Cloudinary 簽名端點（比照 /api/standard-prices/notes-signature）。
// 不綁規則 id：新增規則當下沒有 id。維修資訊為全公司共用資料，全部放同一個 folder。
// 權限：manage_maintenance_info（未登入或無權限回 403）。
export async function POST() {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })

    const folder = MAINTENANCE_RULE_IMAGE_FOLDER
    const timestamp = Math.floor(Date.now() / 1000)
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    const public_id = `${folder}/${timestamp}_${randomSuffix}`

    const signature = cloudinary.utils.api_sign_request(
      { folder, public_id, timestamp },
      process.env.CLOUDINARY_API_SECRET!,
    )

    return NextResponse.json({
      signature,
      timestamp,
      public_id,
      folder,
      api_key: process.env.CLOUDINARY_API_KEY,
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    })
  } catch (err) {
    console.error('[maintenance/rules/content-signature] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}
