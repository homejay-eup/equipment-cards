import { NextRequest, NextResponse } from 'next/server'
import {
  authorizeResidual, getResidualDb, isResidualUuid, residualServerError, RESIDUAL_ITEM_COLUMNS,
} from '@/lib/residual'
import { validateResidualInput } from '@/lib/residualValidation'
import type { ResidualItem } from '@/types/residual'

const NOT_FOUND = '找不到此品項（可能已被刪除，請重新整理）'

// PATCH /api/residual/items/[id] — 需 edit_residual；整筆覆蓋（code/name/price/years 都要帶）
// 品號改成別筆已有的 → 409；找不到 → 404；回 200 { item }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorizeResidual('edit')
  if (!auth.ok) return auth.response
  if (!isResidualUuid(params.id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })

  const parsed = validateResidualInput(await req.json().catch(() => null))
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })

  const db = getResidualDb()
  const { data, error } = await db
    .from('residual_items')
    .update({ ...parsed.value, updated_at: new Date().toISOString(), updated_by: auth.email })
    .eq('id', params.id)
    .select(RESIDUAL_ITEM_COLUMNS)
    .maybeSingle()
  if (error) {
    if (error.code === '23505') return NextResponse.json({ error: `品號 ${parsed.value.code} 已存在` }, { status: 409 })
    return residualServerError('items PATCH', error)
  }
  if (!data) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  return NextResponse.json({ item: data as ResidualItem })
}

// DELETE /api/residual/items/[id] — 需 edit_residual；找不到 → 404；回 200 { success: true }
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const auth = await authorizeResidual('edit')
  if (!auth.ok) return auth.response
  if (!isResidualUuid(params.id)) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })

  const db = getResidualDb()
  const { data, error } = await db.from('residual_items').delete().eq('id', params.id).select('id')
  if (error) return residualServerError('items DELETE', error)
  if (!data || data.length === 0) return NextResponse.json({ error: NOT_FOUND }, { status: 404 })
  return NextResponse.json({ success: true })
}
