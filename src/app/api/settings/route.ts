import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// GET /api/settings — 公開，任何登入者可讀
export async function GET() {
  const settings = await getSettings()
  return NextResponse.json(settings)
}

// PATCH /api/settings — 僅管理員
export async function PATCH(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { key, value } = await req.json()
  if (!['categories', 'statuses', 'documentTypes', 'issueTypes', 'issueTags'].includes(key) || !Array.isArray(value)) {
    return NextResponse.json({ error: '參數錯誤' }, { status: 400 })
  }

  const { error } = await getSupabase()
    .from('app_settings')
    .upsert({ key, value }, { onConflict: 'key' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
