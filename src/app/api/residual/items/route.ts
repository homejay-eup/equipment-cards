import { NextRequest, NextResponse } from 'next/server'
import {
  authorizeResidual, getResidualDb, residualServerError, RESIDUAL_ITEM_COLUMNS,
} from '@/lib/residual'
import { validateResidualInput } from '@/lib/residualValidation'
import type { ResidualItem, ResidualListResponse } from '@/types/residual'

// GET /api/residual/items — 需 view_residual 或 edit_residual
// 回傳 { items, version }；version＝價格版本（最後一次異動時間，DB trigger 維護）
export async function GET() {
  const auth = await authorizeResidual('view')
  if (!auth.ok) return auth.response

  const db = getResidualDb()
  const [itemsRes, metaRes] = await Promise.all([
    db.from('residual_items').select(RESIDUAL_ITEM_COLUMNS)
      .order('sort_order', { ascending: true }).order('code', { ascending: true }).limit(5000),
    db.from('residual_meta').select('updated_at').eq('id', 1).maybeSingle(),
  ])
  if (itemsRes.error) return residualServerError('items GET', itemsRes.error)
  if (metaRes.error) return residualServerError('items GET meta', metaRes.error)

  const body: ResidualListResponse = {
    items: (itemsRes.data ?? []) as ResidualItem[],
    version: (metaRes.data?.updated_at as string | undefined) ?? null,
  }
  return NextResponse.json(body)
}

// POST /api/residual/items — 需 edit_residual；新增一筆（排在最後）
// body: { code, name, price, years }（price／years 都留空＝報價無資料）；品號重複回 409；回 201 { item }
export async function POST(req: NextRequest) {
  const auth = await authorizeResidual('edit')
  if (!auth.ok) return auth.response

  const parsed = validateResidualInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = getResidualDb()
  const { data: last, error: lastErr } = await db
    .from('residual_items').select('sort_order')
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  if (lastErr) return residualServerError('items POST max', lastErr)

  const { data, error } = await db
    .from('residual_items')
    .insert({
      ...parsed.value,
      sort_order: ((last?.sort_order as number | undefined) ?? 0) + 10,
      updated_by: auth.email,
    })
    .select(RESIDUAL_ITEM_COLUMNS)
    .single()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `品號 ${parsed.value.code} 已存在` }, { status: 409 })
    return residualServerError('items POST', error)
  }
  return NextResponse.json({ item: data as ResidualItem }, { status: 201 })
}
