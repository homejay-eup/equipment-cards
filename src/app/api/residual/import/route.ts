import { NextRequest, NextResponse } from 'next/server'
import { authorizeResidual, getResidualDb, residualServerError } from '@/lib/residual'
import { RESIDUAL_LIMITS, validateResidualInput } from '@/lib/residualValidation'
import type { ResidualItemInput } from '@/types/residual'

// POST /api/residual/import — 需 edit_residual；批次新增／更新（以品號比對，已有的更新品名／金額／年限，沒有的新增到最後）
// body: { rows: [{ code, name, price, years }] }，一次最多 1000 筆。
// 全有或全無：只要有一筆驗證失敗，整批都不寫入，回 400 { error, errors: [{ row, message }] }（row 為 1 起算的列號）。
// 成功回 200 { created, updated }
export async function POST(req: NextRequest) {
  const auth = await authorizeResidual('edit')
  if (!auth.ok) return auth.response

  const body = (await req.json().catch(() => null)) as { rows?: unknown } | null
  const rows = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '沒有可匯入的資料' }, { status: 400 })
  }
  if (rows.length > RESIDUAL_LIMITS.importMax) {
    return NextResponse.json({ error: `一次最多匯入 ${RESIDUAL_LIMITS.importMax} 筆` }, { status: 400 })
  }

  const valid: ResidualItemInput[] = []
  const errors: { row: number; message: string }[] = []
  const seen = new Map<string, number>()
  rows.forEach((raw, i) => {
    const parsed = validateResidualInput(raw)
    if (!parsed.ok) { errors.push({ row: i + 1, message: parsed.error }); return }
    const firstRow = seen.get(parsed.value.code)
    if (firstRow !== undefined) {
      errors.push({ row: i + 1, message: `品號 ${parsed.value.code} 與第 ${firstRow} 列重複` })
      return
    }
    seen.set(parsed.value.code, i + 1)
    valid.push(parsed.value)
  })
  if (errors.length > 0) {
    return NextResponse.json({ error: `有 ${errors.length} 列資料有問題，整批未匯入`, errors: errors.slice(0, 50) }, { status: 400 })
  }

  const db = getResidualDb()
  // 現有品項：已存在的保留原排序，新的接在最後
  const { data: existing, error: exErr } = await db
    .from('residual_items').select('code, sort_order').limit(5000)
  if (exErr) return residualServerError('import existing', exErr)
  const existingOrder = new Map((existing ?? []).map((r) => [r.code as string, r.sort_order as number]))
  let nextOrder = Math.max(0, ...Array.from(existingOrder.values())) + 10

  const now = new Date().toISOString()
  let created = 0
  let updated = 0
  const payload = valid.map((v) => {
    const keep = existingOrder.get(v.code)
    if (keep !== undefined) updated++
    else created++
    const sort_order = keep ?? nextOrder
    if (keep === undefined) nextOrder += 10
    return { ...v, sort_order, updated_at: now, updated_by: auth.email }
  })

  const { error } = await db.from('residual_items').upsert(payload, { onConflict: 'code' })
  if (error) return residualServerError('import upsert', error)
  return NextResponse.json({ created, updated })
}
