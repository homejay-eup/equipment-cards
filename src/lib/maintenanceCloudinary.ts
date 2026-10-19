// Step 50：維修資訊規則內容圖片的 Cloudinary 清除工具
//
// 僅限 server 端（API routes）import，不得被 client component 直接或間接 import：
// 依賴 cloudinary SDK 與 CLOUDINARY_API_SECRET。拆分理由比照 maintenance.ts／maintenanceFormat.ts。

import { v2 as cloudinary } from 'cloudinary'
import type { RichContentImage } from '@/lib/richContentValidation'

// 與 /api/maintenance/rules/content-signature 的 folder 一致
export const MAINTENANCE_RULE_IMAGE_FOLDER = 'equipment-cards/maintenance-rules'
const FOLDER_PREFIX = `${MAINTENANCE_RULE_IMAGE_FOLDER}/`

/**
 * best effort：清除規則內容圖片。必須在 DB 寫入完成之後呼叫。
 * - 只處理 public_id 以本功能 folder 開頭者，其餘忽略（public_id 由前端送來，
 *   不加限制會讓有權限者藉「寫入再移除」刪掉其他功能的圖片）。
 * - 規則之間不共用圖片，不需查詢其他規則引用。
 * - 失敗不拋例外，回傳警告字串（無事回 null）。
 */
export async function destroyOwnImages(
  images: Array<Partial<RichContentImage> | null | undefined>,
  actionLabel: string,
): Promise<string | null> {
  const ids = Array.from(new Set(
    images
      .map((img) => img?.public_id)
      .filter((id): id is string => typeof id === 'string' && id.startsWith(FOLDER_PREFIX)),
  ))
  if (ids.length === 0) return null

  try {
    cloudinary.config({
      cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    })
    const results = await Promise.allSettled(ids.map((id) => cloudinary.uploader.destroy(id)))
    const failedCount = results.filter((r) => r.status === 'rejected').length
    if (failedCount > 0) {
      console.error('[maintenanceCloudinary] destroy failed', results.filter((r) => r.status === 'rejected'))
      return `${actionLabel}，但有 ${failedCount} 張圖片未能從 Cloudinary 清除`
    }
    return null
  } catch (err) {
    console.error('[maintenanceCloudinary] destroy error', err)
    return `${actionLabel}，但 Cloudinary 圖片清除失敗`
  }
}
