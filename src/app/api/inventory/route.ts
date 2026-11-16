// GET /api/inventory — 庫存頁主資料：產品 × 倉庫 的可使用／不可使用數量（只回傳角色看得到的倉）
// 回傳：{ products, warehouses, batches, prefs, can }
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, canSee, forbidden, tableMissing, MISSING_MSG, BATCH_LABELS } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

interface SummaryRow {
  product_id: string | null; category: string | null; name: string; warehouse: string; region: string | null
  batch_key: string; ok_count: number; bad_count: number; exported_at: string | null
}

export async function GET() {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const db = getServiceClient()

  const rows: SummaryRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('inventory_summary')
      .select('product_id, category, name, warehouse, region, batch_key, ok_count, bad_count, exported_at')
      .range(from, from + 999)
    if (error) {
      if (tableMissing(error.code)) return NextResponse.json({ error: MISSING_MSG }, { status: 500 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    rows.push(...(data as SummaryRow[]))
    if (!data || data.length < 1000) break
  }

  // 料卡名稱（有對到料卡就用料卡名稱顯示）
  const pids = Array.from(new Set(rows.map(r => r.product_id).filter(Boolean))) as string[]
  const cardName = new Map<string, string>()
  for (let i = 0; i < pids.length; i += 300) {
    const { data } = await db.from('equipment_cards').select('equipment_id, name').in('equipment_id', pids.slice(i, i + 300))
    for (const c of data ?? []) cardName.set(c.equipment_id, c.name)
  }

  type Product = { key: string; pid: string | null; name: string; crmNames: string[]; type: string; onCard: boolean; cells: Record<string, [number, number]> }
  const products = new Map<string, Product>()
  const whs = new Map<string, string>()   // 倉 → 區域
  for (const r of rows) {
    if (!canSee(access, r.warehouse)) continue
    whs.set(r.warehouse, r.region ?? '')
    const type = r.category || '其他'
    const key = r.product_id ? r.product_id : `name:${type}|${r.name}`
    let p = products.get(key)
    if (!p) {
      const onCard = !!(r.product_id && cardName.has(r.product_id))
      p = { key, pid: r.product_id, name: onCard ? cardName.get(r.product_id!)! : (r.name || type), crmNames: [], type, onCard, cells: {} }
      products.set(key, p)
    }
    if (r.name && !p.crmNames.includes(r.name)) p.crmNames.push(r.name)
    const c = p.cells[r.warehouse] ?? [0, 0]
    p.cells[r.warehouse] = [c[0] + Number(r.ok_count), c[1] + Number(r.bad_count)]
  }

  // 每批的資料時間
  const { data: cur } = await db.from('inventory_batch_current').select('batch_key, snapshot_id')
  const snapIds = (cur ?? []).map((c: { snapshot_id: number }) => c.snapshot_id)
  const { data: snaps } = snapIds.length
    ? await db.from('inventory_snapshots').select('id, batch_key, exported_at').in('id', snapIds)
    : { data: [] }
  const batches: Record<string, { label: string; exportedAt: string | null }> = {}
  for (const k of Object.keys(BATCH_LABELS)) batches[k] = { label: BATCH_LABELS[k], exportedAt: null }
  for (const s of snaps ?? []) if (batches[s.batch_key]) batches[s.batch_key].exportedAt = s.exported_at

  const { data: pref } = await db.from('user_inventory_prefs').select('prefs').eq('user_email', access.email).maybeSingle()

  return NextResponse.json({
    products: Array.from(products.values()),
    warehouses: Array.from(whs.entries()).map(([name, region]) => ({ name, region })),
    batches,
    prefs: pref?.prefs ?? null,
    can: {
      barcodes: access.permissions.includes('view_inventory_barcodes'),
      refresh: access.permissions.includes('refresh_inventory'),
      stocktake: access.permissions.includes('export_stocktake'),
    },
  })
}
