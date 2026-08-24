import { NextRequest, NextResponse } from 'next/server'
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

// ── POST /api/issues/[id]/updates/signature ───────────────────
// 更新紀錄貼圖用的 Cloudinary 簽名端點。
// 跟 /api/upload 的「向自己 API 拿簽名 → 前端直傳 Cloudinary」模式一樣，
// 但這裡不需要 PATCH 寫回資料庫的第三步——圖片的 public_id/url 會跟文字/表格
// 一起包在最後送出的 POST /api/issues/[id]/updates body 裡，一次寫入。
// 權限：view_tracker（跟 POST /api/issues/[id]/updates 一致，任何看得到追蹤板的人都能貼圖）
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    // 確認議題存在，並確認屬於呼叫者的部門（否則等於任何 view_tracker 使用者都能
    // 對別部門甚至不存在的 issue_id 拿到有效簽名，繞過部門隔離設計意圖）
    const { data: issue, error: fetchError } = await supabase
      .from('issues')
      .select('id, department_id')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: '找不到議題' }, { status: 404 })
    }

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

    if (!callerDepartmentId || callerDepartmentId !== issue.department_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const folder    = `equipment-cards/tracker-updates/${params.id}`
    const timestamp = Math.floor(Date.now() / 1000)
    const randomSuffix = Math.random().toString(36).slice(2, 10)
    // public_id 帶時間戳+隨機字串避免同一 issue 內多張圖片衝突
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
    console.error('[issues/updates/signature] sign error', err)
    return NextResponse.json({ error: 'Failed to generate signature' }, { status: 500 })
  }
}
