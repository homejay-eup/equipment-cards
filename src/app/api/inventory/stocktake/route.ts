// Step 54 盤點表（需 export_stocktake）
// GET  先讀回上一份盤點表的倉別（試算表改過的存回），再回傳全部倉別：{ locations: {key: 倉別}, synced, last }
// PUT  { key, location } 在網站上改某品項的倉別（空字串＝清掉）
// POST { warehouses, mode: merge|each, qty: all|ok, zero } 建立 Google 試算表，回傳 { url, name }
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, forbidden, loadProducts, canSee } from '@/lib/inventory'
import { buildRows, createStocktakeSheet, getLocations, stocktakeNames, syncLocationsFromLastSheet, type StocktakeOptions } from '@/lib/stocktake'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

async function access() {
  const a = await getInventoryAccess()
  return a && a.permissions.includes('export_stocktake') ? a : null
}

export async function GET() {
  const a = await access()
  if (!a) return forbidden()
  let synced = 0
  try { synced = await syncLocationsFromLastSheet() } catch { /* 讀不到上一份就略過 */ }
  const locs = await getLocations()
  const { data: last } = await getServiceClient().from('stocktake_exports')
    .select('file_name, sheet_url, created_at, created_by').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return NextResponse.json({ locations: Object.fromEntries(Array.from(locs.entries()).filter(([, v]) => v.location).map(([k, v]) => [k, v.location])), synced, last, names: stocktakeNames() })
}

export async function PUT(req: NextRequest) {
  const a = await access()
  if (!a) return forbidden()
  const b = await req.json().catch(() => null) as { key?: string; location?: string } | null
  const key = (b?.key ?? '').trim()
  const loc = (b?.location ?? '').trim().toUpperCase().slice(0, 20)
  if (!key) return NextResponse.json({ error: '缺少 key' }, { status: 400 })
  const db = getServiceClient()
  // 清空也留一筆空字串（記下清空的時間），讀回試算表時才知道「網站在匯出後清掉了」，不會被舊的試算表值蓋回來
  const { error } = await db.from('stocktake_locations')
    .upsert({ product_key: key, location: loc, source: 'web', updated_by: a.email, updated_at: new Date().toISOString() }, { onConflict: 'product_key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, location: loc })
}

export async function POST(req: NextRequest) {
  const a = await access()
  if (!a) return forbidden()
  const b = await req.json().catch(() => null) as Partial<StocktakeOptions> | null
  const whs = (b?.warehouses ?? []).filter(w => typeof w === 'string' && canSee(a, w))
  if (!whs.length) return NextResponse.json({ error: '請至少選一個倉庫' }, { status: 400 })
  const opt: StocktakeOptions = { warehouses: whs, mode: b?.mode === 'each' ? 'each' : 'merge', qty: b?.qty === 'ok' ? 'ok' : 'all', zero: !!b?.zero }
  try {
    try { await syncLocationsFromLastSheet() } catch { /* 略過 */ }
    const { products } = await loadProducts(a)
    const locs = await getLocations()
    const { tab, ymd } = stocktakeNames()
    const tabs = opt.mode === 'each' && whs.length > 1
      ? whs.map(w => ({ title: `${ymd}${w}`.slice(0, 90), rows: buildRows(products, [w], opt, locs) }))
      : [{ title: tab, rows: buildRows(products, whs, opt, locs) }]
    const sheet = await createStocktakeSheet(tabs)
    await getServiceClient().from('stocktake_exports').insert({
      created_by: a.email, warehouses: whs, mode: opt.mode, qty_mode: opt.qty, file_name: sheet.name, sheet_id: sheet.id, sheet_url: sheet.url,
    })
    return NextResponse.json({ url: sheet.url, name: sheet.name, rows: tabs.reduce((s, t) => s + t.rows.length, 0) })
  } catch (e) {
    return NextResponse.json({ error: `建立盤點表失敗：${(e as Error).message}` }, { status: 500 })
  }
}
