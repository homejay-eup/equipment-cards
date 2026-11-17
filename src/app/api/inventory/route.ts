// GET /api/inventory — 庫存頁主資料：產品 × 倉庫 的可使用／不可使用數量（只回傳角色看得到的倉）
// 回傳：{ products, warehouses, batches, prefs, can }
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, forbidden, tableMissing, MISSING_MSG, BATCH_LABELS, loadProducts } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

export async function GET() {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const db = getServiceClient()

  // 主資料（最慢）、每批資料時間、個人設定三件事同時進行
  const metaP = (async () => {
    const { data: cur } = await db.from('inventory_batch_current').select('batch_key, snapshot_id')
    const snapIds = (cur ?? []).map((c: { snapshot_id: number }) => c.snapshot_id)
    const { data: snaps } = snapIds.length
      ? await db.from('inventory_snapshots').select('id, batch_key, exported_at').in('id', snapIds)
      : { data: [] }
    return snaps
  })()
  const prefP = db.from('user_inventory_prefs').select('prefs').eq('user_email', access.email).maybeSingle()
  let loaded
  try { loaded = await loadProducts(access) } catch (e) {
    const err = e as { code?: string; message: string }
    return NextResponse.json({ error: tableMissing(err.code) ? MISSING_MSG : err.message }, { status: 500 })
  }
  const { products, warehouses } = loaded
  const [snaps, { data: pref }] = await Promise.all([metaP, prefP])

  const batches: Record<string, { label: string; exportedAt: string | null }> = {}
  for (const k of Object.keys(BATCH_LABELS)) batches[k] = { label: BATCH_LABELS[k], exportedAt: null }
  for (const s of snaps ?? []) if (batches[s.batch_key]) batches[s.batch_key].exportedAt = s.exported_at

  return NextResponse.json({
    products,
    warehouses,
    batches,
    prefs: pref?.prefs ?? null,
    can: {
      barcodes: access.permissions.includes('view_inventory_barcodes'),
      refresh: access.permissions.includes('refresh_inventory'),
      stocktake: access.permissions.includes('export_stocktake'),
      transfers: access.permissions.includes('view_inventory_transfers'),
      idle: access.permissions.includes('view_inventory_idle_tech'),
    },
  })
}
