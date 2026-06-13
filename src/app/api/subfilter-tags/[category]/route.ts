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

// PUT /api/subfilter-tags/[category]
// 覆寫指定分類的次級標籤清單
// body: { tags: string[] }
export async function PUT(
  req: NextRequest,
  { params }: { params: { category: string } },
) {
  const user = await requirePermission('manage_subfilter_tags')
  if (!user) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { category } = params
  if (!category || category.trim() === '') {
    return NextResponse.json({ error: 'category 不得為空' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON 格式錯誤' }, { status: 400 })
  }

  if (
    typeof body !== 'object' ||
    body === null ||
    !Array.isArray((body as Record<string, unknown>).tags)
  ) {
    return NextResponse.json({ error: 'body 須包含 tags 陣列' }, { status: 400 })
  }

  const tags = (body as { tags: unknown[] }).tags
  const invalidTag = tags.find((t) => typeof t !== 'string')
  if (invalidTag !== undefined) {
    return NextResponse.json({ error: 'tags 陣列內所有元素須為字串' }, { status: 400 })
  }

  const tagStrings = tags as string[]
  const supabase = getSupabase()

  // 先刪除該 category 的現有標籤
  const { error: deleteError } = await supabase
    .from('category_subfilter_tags')
    .delete()
    .eq('category', category)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  // 插入新標籤（帶 sort_order）
  if (tagStrings.length > 0) {
    const rows = tagStrings.map((tag, index) => ({
      category,
      tag,
      sort_order: index,
    }))

    const { error: insertError } = await supabase
      .from('category_subfilter_tags')
      .insert(rows)

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ success: true, category, tags: tagStrings })
}
