// 角色可看的庫存倉庫範圍。GET：目前範圍＋可選的全部倉（依區域）；PUT：覆寫範圍（空陣列＝不限制，看全部）。需 manage_roles 或 manage_users。
import { NextRequest, NextResponse } from 'next/server'
import { requirePermission } from '@/lib/admin'
import { getServiceClient } from '@/lib/departments'
import { clearInventoryAccessCache } from '@/lib/inventory'

export const dynamic = 'force-dynamic'

async function allowed() {
  return (await requirePermission('manage_roles')) || (await requirePermission('manage_users'))
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const db = getServiceClient()
  const { data: cur, error } = await db.from('role_inventory_warehouses').select('warehouse').eq('role_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const seen = new Map<string, string>()
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error: e } = await db.from('inventory_summary').select('warehouse, region').range(from, from + 999)
    if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    for (const r of data ?? []) if (!seen.has(r.warehouse)) seen.set(r.warehouse, r.region || '其他')
    if (!data || data.length < 1000) break
  }
  return NextResponse.json({
    warehouses: (cur ?? []).map((r: { warehouse: string }) => r.warehouse),
    all: Array.from(seen, ([name, region]) => ({ name, region })),
  })
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!(await allowed())) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const body = await req.json().catch(() => null)
  const list: unknown = body?.warehouses
  if (!Array.isArray(list) || list.some(w => typeof w !== 'string' || !w || w.length > 100) || list.length > 500) {
    return NextResponse.json({ error: '格式不正確' }, { status: 400 })
  }
  const names = Array.from(new Set(list as string[]))
  const db = getServiceClient()
  const { error: de } = await db.from('role_inventory_warehouses').delete().eq('role_id', params.id)
  if (de) return NextResponse.json({ error: de.message }, { status: 500 })
  if (names.length) {
    const { error: ie } = await db.from('role_inventory_warehouses').insert(names.map(warehouse => ({ role_id: params.id, warehouse })))
    if (ie) return NextResponse.json({ error: ie.message }, { status: 500 })
  }
  clearInventoryAccessCache()
  return NextResponse.json({ ok: true, count: names.length })
}
