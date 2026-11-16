// PUT /api/inventory/prefs — 存每位使用者自己的庫存頁設定（倉庫欄位與順序、列順序、分組順序、排序、收合、檢視…）
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, forbidden } from '@/lib/inventory'

export async function PUT(req: NextRequest) {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const body = await req.json().catch(() => null)
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  if (JSON.stringify(body).length > 50000) return NextResponse.json({ error: '設定太大' }, { status: 400 })
  const { error } = await getServiceClient().from('user_inventory_prefs')
    .upsert({ user_email: access.email, prefs: body, updated_at: new Date().toISOString() }, { onConflict: 'user_email' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
