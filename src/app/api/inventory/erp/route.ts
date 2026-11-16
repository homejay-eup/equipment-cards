// GET /api/inventory/erp — ERP（鼎新 Cosmos）品號庫存。需 view_erp_inventory（和 CRM 庫存 view_inventory 分開授權）。
// 資料由公司電腦在使用者登入 ERP 後背景匯出上傳，不能即時刷新；回傳目前生效的整批品項＋這批的資料時間。
import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getServiceClient } from '@/lib/departments'
import { tableMissing, MISSING_MSG, forbidden } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

interface Row {
  product_id: string; name: string; qty: number; main_wh: string | null; vendor: string | null
  has_serial: boolean; own_barcode: boolean; serial_prefix: string | null; warranty_months: number | null
}

export async function GET() {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  if (!user?.email) return forbidden()
  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('view_erp_inventory')) return forbidden()
  const db = getServiceClient()
  const { data: run, error: re } = await db.from('erp_stock_runs').select('id, exported_at, uploaded_at, rows')
    .eq('status', 'ok').order('exported_at', { ascending: false }).limit(1).maybeSingle()
  if (re) return NextResponse.json({ error: tableMissing(re.code) ? MISSING_MSG : re.message }, { status: 500 })
  const can = { upload: permissions.includes('upload_erp_inventory') }
  if (!run) return NextResponse.json({ run: null, items: [], can })
  const SEL = 'product_id, name, qty, main_wh, vendor, has_serial, own_barcode, serial_prefix, warranty_months'
  const pages = await Promise.all([0, 1, 2, 3].map(i => db.from('erp_stock_items').select(SEL).eq('run_id', run.id).order('product_id').range(i * 1000, i * 1000 + 999)))
  const bad = pages.find(p => p.error)
  if (bad?.error) return NextResponse.json({ error: bad.error.message }, { status: 500 })
  const items = pages.flatMap(p => (p.data ?? []) as Row[]).map(r => ({
    pid: r.product_id, name: r.name, qty: Number(r.qty), wh: r.main_wh, vendor: r.vendor,
    hasSerial: r.has_serial, ownBarcode: r.own_barcode, prefix: r.serial_prefix, warranty: r.warranty_months,
  }))
  return NextResponse.json({ run: { exportedAt: run.exported_at, uploadedAt: run.uploaded_at, rows: run.rows }, items, can })
}
