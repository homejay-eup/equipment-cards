// ERP 庫存「匯出盤點表」（需 view_erp_inventory ＋ export_stocktake）
// GET  回傳倉別（跟 CRM 盤點表共用 stocktake_locations，依品號）＋檔名／分頁名
// POST { scope: none|serial|all, zero } 依最新一批 ERP 庫存建立 Google 試算表，回傳 { url, name, rows }
// 不寫 stocktake_exports、不讀回試算表的倉別：避免干擾 CRM 盤點表的「讀回上一份」。倉別只在網站視窗改（PUT 沿用 /api/inventory/stocktake）。
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getServiceClient } from '@/lib/departments'
import { forbidden } from '@/lib/inventory'
import { createStocktakeSheet, getLocations, stocktakeNames } from '@/lib/stocktake'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function allowed() {
  const { data: { user } } = await createSupabaseServerClient().auth.getUser()
  if (!user?.email) return false
  const { permissions } = await getUserRoleWithPermissions(user.email)
  return permissions.includes('view_erp_inventory') && permissions.includes('export_stocktake')
}
// 檔名刻意不含「庫存明細表」：CRM 盤點表建檔時用「名稱包含 庫存明細表…」判斷同日重複，含的話會誤把自己改成 (2)
function erpNames() {
  const n = stocktakeNames()
  return { file: n.file.replace('庫存明細表', 'ERP庫存盤點表'), tab: `${n.ymd}ERP盤點表` }
}

export async function GET() {
  if (!(await allowed())) return forbidden()
  const locs = await getLocations()
  return NextResponse.json({ locations: Object.fromEntries(Array.from(locs.entries()).filter(([, v]) => v.location).map(([k, v]) => [k, v.location])), names: erpNames() })
}

export async function POST(req: NextRequest) {
  if (!(await allowed())) return forbidden()
  const b = await req.json().catch(() => null) as { scope?: string; zero?: boolean } | null
  const scope = b?.scope === 'serial' ? 'serial' : b?.scope === 'all' ? 'all' : 'none'
  try {
    const db = getServiceClient()
    const { data: run } = await db.from('erp_stock_runs').select('id').eq('status', 'ok').order('exported_at', { ascending: false }).limit(1).maybeSingle()
    if (!run) return NextResponse.json({ error: '還沒有 ERP 庫存資料' }, { status: 400 })
    const pages = await Promise.all([0, 1, 2, 3].map(i => db.from('erp_stock_items').select('product_id, name, qty, has_serial').eq('run_id', run.id).order('product_id').range(i * 1000, i * 1000 + 999)))
    const bad = pages.find(p => p.error)
    if (bad?.error) throw new Error(bad.error.message)
    const items = pages.flatMap(p => (p.data ?? []) as { product_id: string; name: string; qty: number; has_serial: boolean }[])
    const locs = await getLocations()
    const rows = items
      .filter(i => (scope === 'all' || (scope === 'serial') === i.has_serial) && (b?.zero || Number(i.qty) !== 0))
      .sort((a, c) => a.product_id.localeCompare(c.product_id, 'zh-Hant', { numeric: true }))
      .map(i => [i.product_id, i.name, locs.get(i.product_id)?.location ?? '', Number(i.qty)] as [string, string, string, number])
    if (!rows.length) return NextResponse.json({ error: '沒有符合的品項' }, { status: 400 })
    const n = erpNames()
    const sheet = await createStocktakeSheet([{ title: n.tab, rows }], n.file)
    return NextResponse.json({ url: sheet.url, name: sheet.name, rows: rows.length })
  } catch (e) {
    return NextResponse.json({ error: `建立盤點表失敗：${(e as Error).message}` }, { status: 500 })
  }
}
