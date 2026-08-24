import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

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
    const { content, image_urls, table_data } = body

    // ── content 驗證 ──────────────────────────────────────────
    if (content !== undefined && content !== null && typeof content !== 'string') {
      return NextResponse.json({ error: '更新內容格式錯誤' }, { status: 400 })
    }
    const trimmedContent: string | null = typeof content === 'string' && content.trim() ? content.trim() : null
    if (trimmedContent && trimmedContent.length > 5000) {
      return NextResponse.json({ error: '文字內容最多 5000 字' }, { status: 400 })
    }

    // ── image_urls 驗證 ────────────────────────────────────────
    // 每個元素必須是 { public_id: string, url: string }，且 url 必須是本專案 Cloudinary
    // 帳號下的網址，不接受任意外部網址（避免外洩隱私、避免前端渲染時因型別不符整頁壞掉）
    if (image_urls !== undefined && !Array.isArray(image_urls)) {
      return NextResponse.json({ error: '圖片資料格式錯誤' }, { status: 400 })
    }
    const images: { public_id: string; url: string }[] = Array.isArray(image_urls) ? image_urls : []
    if (images.length > 10) {
      return NextResponse.json({ error: '圖片最多 10 張' }, { status: 400 })
    }
    const cloudName = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME
    const cloudinaryPrefix = `https://res.cloudinary.com/${cloudName}/`
    for (const img of images) {
      if (
        !img ||
        typeof img !== 'object' ||
        typeof img.public_id !== 'string' ||
        typeof img.url !== 'string' ||
        !img.url.startsWith(cloudinaryPrefix)
      ) {
        return NextResponse.json({ error: '圖片資料格式錯誤' }, { status: 400 })
      }
    }

    // ── table_data 驗證 ────────────────────────────────────────
    // rows 每一列必須是 string[]，不符合直接拒絕（不嘗試自動轉型修正）
    if (table_data !== undefined && table_data !== null) {
      if (typeof table_data !== 'object' || !Array.isArray(table_data.rows)) {
        return NextResponse.json({ error: '表格資料格式錯誤' }, { status: 400 })
      }
      if (table_data.rows.length > 500) {
        return NextResponse.json({ error: '表格最多 500 列' }, { status: 400 })
      }
      for (const row of table_data.rows) {
        if (!Array.isArray(row) || row.length > 50 || row.some((cell: unknown) => typeof cell !== 'string')) {
          return NextResponse.json({ error: '表格資料格式錯誤' }, { status: 400 })
        }
      }
    }
    const table: { rows: string[][]; hasHeader: boolean } | null =
      table_data && Array.isArray(table_data.rows) && table_data.rows.length > 0 ? table_data : null

    // 複合留言：文字/圖片/表格三者至少要有一項，才視為有效更新
    if (!trimmedContent && images.length === 0 && !table) {
      return NextResponse.json({ error: '更新內容為必填（文字／圖片／表格至少一項）' }, { status: 400 })
    }

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
