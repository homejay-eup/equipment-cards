// POST /api/inventory/refresh — 送出「刷新庫存」請求（一律全部 7 批；公司電腦常駐程式每 3 秒來拿）
//   已有排隊中／執行中的請求就直接回傳那一個（多人同時按＝一起等同一輪）。需 refresh_inventory。
// GET  /api/inventory/refresh?id=N — 查進度：status（queued/running/done/failed）、step（start/export/upload/done）、progress（每批狀態）
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, forbidden, ALL_BATCHES } from '@/lib/inventory'

export const dynamic = 'force-dynamic'
const COLS = 'id, status, step, progress, error, created_at, started_at, finished_at'

export async function POST() {
  const access = await getInventoryAccess()
  if (!access || !access.permissions.includes('refresh_inventory')) return forbidden()
  const db = getServiceClient()
  const { data: live } = await db.from('inventory_refresh_requests').select(COLS)
    .not('batch_keys', 'cs', '{dest}')   // 補查接收倉的請求（batch_keys=['dest']）不算刷新，不能被刷新按鈕「一起等」
    .in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1)
  // 卡住超過 10 分鐘的不算（公司電腦可能關機），照樣新排一個
  const fresh = live?.[0] && Date.now() - new Date(live[0].created_at).getTime() < 10 * 60 * 1000
  if (fresh) return NextResponse.json({ request: live![0], joined: true })
  const { data, error } = await db.from('inventory_refresh_requests')
    .insert({ requested_by: access.email, batch_keys: ALL_BATCHES }).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data, joined: false })
}

export async function GET(req: NextRequest) {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const { data, error } = await getServiceClient().from('inventory_refresh_requests').select(COLS).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到這個請求' }, { status: 404 })
  return NextResponse.json({ request: data })
}
