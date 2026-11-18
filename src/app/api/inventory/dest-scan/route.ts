// 待接收頁「補查接收倉」：公司電腦常駐程式用「補查專用」CRM 逐顆明細查詢，補上資料庫備份之後新移交的接收倉。
// 沿用 inventory_refresh_requests（不新增資料表）：batch_keys = ['dest'] 當記號，常駐程式看到就只跑補查，不跑庫存刷新。
// POST 送出請求（需 refresh_inventory）；已有排隊中／執行中的補查就直接回傳那一個。 GET ?id=N 查進度（status：queued／running／done／failed）。
import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { getInventoryAccess, forbidden } from '@/lib/inventory'

export const dynamic = 'force-dynamic'
const COLS = 'id, status, step, error, created_at, started_at, finished_at'

export async function POST() {
  const access = await getInventoryAccess()
  if (!access || !access.permissions.includes('refresh_inventory')) return forbidden()
  const db = getServiceClient()
  const { data: live } = await db.from('inventory_refresh_requests').select(COLS)
    .contains('batch_keys', ['dest']).in('status', ['queued', 'running']).order('created_at', { ascending: false }).limit(1)
  // 排隊超過 30 分鐘沒人接手（公司電腦關機）的不算，照樣新排一個
  const fresh = live?.[0] && Date.now() - new Date(live[0].created_at).getTime() < 30 * 60 * 1000
  if (fresh) return NextResponse.json({ request: live![0], joined: true })
  const { data, error } = await db.from('inventory_refresh_requests')
    .insert({ requested_by: access.email, batch_keys: ['dest'] }).select(COLS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ request: data, joined: false })
}

export async function GET(req: NextRequest) {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const id = Number(req.nextUrl.searchParams.get('id'))
  if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 })
  const { data, error } = await getServiceClient().from('inventory_refresh_requests').select(COLS).eq('id', id).contains('batch_keys', ['dest']).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: '找不到這個請求' }, { status: 404 })
  return NextResponse.json({ request: data })
}
