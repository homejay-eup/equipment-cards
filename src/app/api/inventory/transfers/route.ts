// GET /api/inventory/transfers?kind=transit|idle
//   transit：移交中的設備（移交出去／待接收共用同一份，畫面上依送出倉或接收倉分組）。需 view_inventory_transfers。
//   idle：技師持有超過 30 天沒異動的設備。需 view_inventory_idle_tech。
// 都另外受角色的倉庫範圍限制（role_inventory_warehouses）。
import { NextRequest, NextResponse } from 'next/server'
import { getInventoryAccess, forbidden, tableMissing } from '@/lib/inventory'
import { loadIdle, loadTransit } from '@/lib/inventoryTransfers'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const access = await getInventoryAccess()
  if (!access) return forbidden()
  const kind = req.nextUrl.searchParams.get('kind')
  try {
    if (kind === 'idle') {
      if (!access.permissions.includes('view_inventory_idle_tech')) return forbidden()
      return NextResponse.json(await loadIdle(access))
    }
    if (kind === 'transit') {
      if (!access.permissions.includes('view_inventory_transfers')) return forbidden()
      return NextResponse.json(await loadTransit(access))
    }
    return NextResponse.json({ error: '缺少 kind' }, { status: 400 })
  } catch (e) {
    const err = e as { code?: string; message: string }
    return NextResponse.json({ error: tableMissing(err.code) ? '資料表尚未建立，請先執行 _開發檔案/sql/step55-inventory-transfers.sql' : err.message }, { status: 500 })
  }
}
