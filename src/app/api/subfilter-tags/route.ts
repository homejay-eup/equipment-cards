import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/subfilter-tags
// 回傳所有分類的次級標籤：{ [category: string]: string[] }
export async function GET() {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('category_subfilter_tags')
    .select('category, tag, sort_order')
    .order('sort_order', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const result: Record<string, string[]> = {}
  for (const row of (data ?? []) as { category: string; tag: string; sort_order: number }[]) {
    if (!result[row.category]) result[row.category] = []
    result[row.category].push(row.tag)
  }

  return NextResponse.json(result)
}
