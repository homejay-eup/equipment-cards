// GET /api/inventory/barcodes?key=<產品key>&warehouse=<倉，可省略＝全部有權限的倉>&offset=0&focus=<條碼>
//   條碼明細（需 view_inventory_barcodes）。一次 200 筆；focus＝搜尋到的那顆條碼，另外回傳它的完整資料（畫面上方卡片用）。
// GET /api/inventory/barcodes?q=<部分條碼>   主搜尋：料號品名找不到時改找條碼（最多 30 筆）
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, canSee, forbidden } from '@/lib/inventory'

export const dynamic = 'force-dynamic'
const COLS = 'barcode, warehouse, region, category, name, product_id, car, crm_updated, op, who, unusable, note'
const PAGE = 200

/** 產品 key → 篩選欄位：料號，或「name:類型|名稱」（沒對到料號的品項） */
function keyFilter(key: string): Record<string, string> {
  if (!key.startsWith('name:')) return { product_id: key }
  const [type, ...rest] = key.slice(5).split('|')
  return { category: type, name: rest.join('|') }
}

export async function GET(req: NextRequest) {
  const access = await getInventoryAccess()
  if (!access || !access.permissions.includes('view_inventory_barcodes')) return forbidden()
  const db = getServiceClient()
  const sp = req.nextUrl.searchParams
  const allowed = access.warehouses ? Array.from(access.warehouses) : null

  const q = (sp.get('q') ?? '').trim()
  if (q) {
    if (q.length < 4) return NextResponse.json({ hits: [] })
    let query = db.from('inventory_current_items').select(COLS).ilike('barcode', `%${q.replace(/[%_]/g, '')}%`).limit(30)
    if (allowed) query = query.in('warehouse', allowed)
    const { data, error } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ hits: data ?? [] })
  }

  const key = sp.get('key') ?? ''
  if (!key) return NextResponse.json({ error: '缺少 key' }, { status: 400 })
  const wh = sp.get('warehouse')
  if (wh && !canSee(access, wh)) return forbidden()
  const offset = Math.max(0, Number(sp.get('offset') ?? 0) || 0)

  const kf = keyFilter(key)
  let query = db.from('inventory_current_items').select(COLS, { count: 'exact' }).match(kf)
  if (wh) query = query.eq('warehouse', wh)
  else if (allowed) query = query.in('warehouse', allowed)
  const { data, count, error } = await query.order('warehouse').order('unusable').order('barcode').range(offset, offset + PAGE - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let focusRow = null
  const focus = sp.get('focus')
  if (focus) {
    const { data: f } = await db.from('inventory_current_items').select(COLS).match({ ...kf, barcode: focus }).limit(1)
    if (f?.[0] && canSee(access, f[0].warehouse)) focusRow = f[0]
  }
  return NextResponse.json({ rows: data ?? [], total: count ?? 0, offset, pageSize: PAGE, focusRow })
}
