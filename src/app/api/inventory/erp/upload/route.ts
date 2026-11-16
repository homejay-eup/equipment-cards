// POST /api/inventory/erp/upload — 手動上傳 ERP「品號資料建立作業」匯出的 Excel 更新 ERP 庫存（multipart：file、lastModified）。
// 需 upload_erp_inventory（和 view_erp_inventory 分開，不是看得到的人都能覆蓋資料）。
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { forbidden, tableMissing, MISSING_MSG } from '@/lib/inventory'
import { parseErpXlsx, saveErpRun } from '@/lib/erp-stock'

export const dynamic = 'force-dynamic'
const MAX_BYTES = 4 * 1024 * 1024

export async function POST(req: NextRequest) {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  if (!user?.email) return forbidden()
  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('upload_erp_inventory')) return forbidden()
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: '上傳格式不正確' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: '請選擇要上傳的檔案' }, { status: 400 })
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ error: '請上傳 .xlsx 檔（ERP 匯出時「檔案格式」選 Excel 2007 以上）' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: '檔案太大' }, { status: 400 })
  // 資料時間：用檔案最後修改時間（＝匯出完成時間）；不合理（未來、一年以前）就用現在
  const lm = Number(form.get('lastModified'))
  const now = Date.now()
  const exportedAt = new Date(Number.isFinite(lm) && lm > now - 365 * 86400000 && lm <= now + 60000 ? lm : now).toISOString()
  try {
    const items = parseErpXlsx(Buffer.from(await file.arrayBuffer()))
    const r = await saveErpRun(items, exportedAt, 'manual', user.email)
    return NextResponse.json({ ok: true, exportedAt, ...r })
  } catch (e) {
    const m = (e as { code?: string; message?: string })
    if (tableMissing(m.code)) return NextResponse.json({ error: MISSING_MSG }, { status: 500 })
    return NextResponse.json({ error: m.message ?? '上傳失敗' }, { status: 400 })
  }
}
