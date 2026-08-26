import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { validateRichContent } from '@/lib/richContentValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// ── POST /api/issues/[id]/updates ────────────────────────────
// 新增更新紀錄
// 權限：view_tracker（任何可看追蹤板的人都能留更新）
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requirePermission('view_tracker')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()

    // 共用驗證（文字長度上限、圖片張數上限＋Cloudinary URL 前綴檢查、表格列數/欄數上限），
    // 跟 PATCH .../updates/[updateId]、POST/PATCH /api/issues 的 description 欄位共用同一套規則。
    const validation = validateRichContent(body, { requireNonEmpty: true })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }
    const { content: trimmedContent, images, table } = validation

    const supabase = getSupabase()

    // 確認議題存在
    const { data: issue, error: fetchError } = await supabase
      .from('issues')
      .select('id')
      .eq('id', params.id)
      .single()

    if (fetchError || !issue) {
      return NextResponse.json({ error: '找不到議題' }, { status: 404 })
    }

    const { data, error } = await supabase
      .from('issue_updates')
      .insert({
        issue_id: params.id,
        content: trimmedContent,
        image_urls: images,
        table_data: table,
        created_by: user.email!,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data, { status: 201 })
  } catch (err) {
    console.error('[issues/updates] create error', err)
    return NextResponse.json({ error: '新增更新紀錄失敗' }, { status: 500 })
  }
}
