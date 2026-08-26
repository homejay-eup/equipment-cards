import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { v2 as cloudinary } from 'cloudinary'
import { requirePermission } from '@/lib/admin'

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

// ── POST /api/issues/description-signature ───────────────────
// 任務「說明」欄位貼圖用的 Cloudinary 簽名端點。
// 跟 /api/issues/[id]/updates/signature 同一種「向自己 API 拿簽名 → 前端直傳 Cloudinary」模式，
// 差異是這裡不綁 issue id：新增任務（NewIssueDialog）當下還沒有 issue id，
// 編輯任務（EditIssueDialog）雖然有 issue id 但為了讓兩個 dialog 共用同一個簽名端點與同一個
// upload hook，一律只依賴「呼叫者的部門」核發簽名，不要求存在的 issue id。
// 權限：view_tracker（跟其他任務板貼圖端點一致），且必須查得到呼叫者的 department_id
// （沒有部門歸屬 → 沒有可歸屬的資料夾，直接拒絕，避免產生無部門歸屬的孤兒圖片）。
export async function POST() {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    let callerDepartmentId: string | null = null
    const { data: emailRow } = await supabase
      .from('allowed_emails')
      .select('role')
      .eq('email', user.email!)
      .single()
    if (emailRow?.role) {
      const { data: roleRow } = await supabase
        .from('roles')
        .select('department_id')
        .eq('name', emailRow.role)
        .single()
      callerDepartmentId = (roleRow as { department_id: string | null } | null)?.department_id ?? null
    }

    if (!callerDepartmentId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const folder    = `equipment-cards/tracker-issues/description/${callerDepartmentId}`
    const timestamp = Math.floor(Date.now() / 1000)
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    // public_id 帶時間戳+隨機字串避免同一部門內多張圖片衝突（沒有 issue id 可用來分隔）
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
    console.error('[issues/description-signature] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}
