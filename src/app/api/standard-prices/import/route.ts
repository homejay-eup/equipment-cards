import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { validateStandardPriceInput } from '@/lib/standardPriceValidation'
import { STANDARD_PRICE_CSV_COLUMNS, STANDARD_PRICE_LIMITS } from '@/lib/standardPriceFormat'
import type { StandardPriceImportRowError } from '@/types/standardPrice'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 依名稱查既有版本時每批幾個名稱（避免 .in() 的 GET URL 過長，中文名稱 URL encode 後很長）
const NAME_CHUNK_SIZE = 50

// CSV 涵蓋、但「匯入列沒帶這個 key」時要沿用既有值的欄位（name/category/effective_date 為必填，不在此列）
const CSV_OPTIONAL_KEYS = STANDARD_PRICE_CSV_COLUMNS
  .map((c) => c.key)
  .filter((k) => !['name', 'category', 'effective_date'].includes(k))

const versionKey = (name: string, effectiveDate: string) => `${name}\u0000${effectiveDate}`

// ── POST /api/standard-prices/import ──────────────────────────
// 批次匯入（前端已把 CSV 解析成英文欄位 key 的物件陣列，extra_fees 已轉成陣列）
// body: { rows: StandardPriceImportRow[] }
// 規則：
//   - 最多 500 列；任何一列驗證失敗 → 400 + 逐列錯誤，整批都不寫入（要「只匯入正確列」由前端先濾掉錯誤列再送）
//   - 依 (name, effective_date) upsert：不存在 → 新增；已存在 → 覆蓋 CSV 欄位
//   - 覆蓋時一律保留既有 notes_image_urls / notes_table_data（CSV 沒有這兩欄）
//   - 覆蓋時 notes 為空 → 保留既有備註（不清空）；列物件沒帶某個 key → 該欄位沿用既有值
// 回傳：{ inserted, updated, items }
// 權限：edit_standard_prices
export async function POST(req: NextRequest) {
  const supabaseAuth = createSupabaseServerClient()
  const { data: { user } } = await supabaseAuth.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('edit_standard_prices')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json().catch(() => null)
  const rows: unknown = body?.rows
  if (!Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json({ error: '沒有要匯入的資料' }, { status: 400 })
  }
  if (rows.length > STANDARD_PRICE_LIMITS.importRowsMax) {
    return NextResponse.json(
      { error: `一次最多匯入 ${STANDARD_PRICE_LIMITS.importRowsMax} 列（目前 ${rows.length} 列），請分批匯入` },
      { status: 400 },
    )
  }

  // ── 1. 逐列驗證（全部驗完才回，讓前端一次看到所有錯誤） ───────────
  const rowErrors: StandardPriceImportRowError[] = []
  const validRows: { raw: Record<string, unknown>; data: Record<string, unknown> }[] = []
  const seenInBatch = new Map<string, number>()

  rows.forEach((row, index) => {
    const v = validateStandardPriceInput(row, { includeRichNotes: false })
    if (!v.ok) {
      rowErrors.push({ index, message: v.error })
      return
    }
    const key = versionKey(v.data.name as string, v.data.effective_date as string)
    const firstIndex = seenInBatch.get(key)
    if (firstIndex !== undefined) {
      rowErrors.push({
        index,
        message: `與第 ${firstIndex + 1} 筆資料的產品名稱＋生效日期重複（${v.data.name}／${v.data.effective_date}）`,
      })
      return
    }
    seenInBatch.set(key, index)
    validRows.push({ raw: row as Record<string, unknown>, data: v.data })
  })

  if (rowErrors.length > 0) {
    return NextResponse.json(
      { error: `有 ${rowErrors.length} 筆資料錯誤，未匯入任何資料`, row_errors: rowErrors },
      { status: 400 },
    )
  }

  try {
    const supabase = getSupabase()

    // ── 2. 依名稱分批撈出既有版本（一次 query 一批名稱，不逐列查） ─────
    const names = Array.from(new Set(validRows.map((r) => r.data.name as string)))
    const existingMap = new Map<string, Record<string, unknown>>()
    for (let i = 0; i < names.length; i += NAME_CHUNK_SIZE) {
      const chunk = names.slice(i, i + NAME_CHUNK_SIZE)
      const { data, error } = await supabase
        .from('standard_price_items')
        .select('*')
        .in('name', chunk)
      if (error) throw error
      for (const row of data ?? []) {
        existingMap.set(versionKey(row.name as string, row.effective_date as string), row)
      }
    }

    // ── 3. 組 upsert 資料：每列 key 集合一致（避免 PostgREST 對缺漏欄位補 NULL） ──
    // 不帶 notes_image_urls / notes_table_data / created_at：
    //   新增時走 DB 預設值，覆蓋時 ON CONFLICT DO UPDATE 不會動到這些欄位 → 保留既有圖片/表格
    const now = new Date().toISOString()
    let inserted = 0
    let updated = 0
    const upsertRows = validRows.map(({ raw, data }) => {
      const existing = existingMap.get(versionKey(data.name as string, data.effective_date as string))
      const row: Record<string, unknown> = { ...data, updated_at: now, updated_by: user.email }
      if (existing) {
        updated++
        for (const key of CSV_OPTIONAL_KEYS) {
          if (raw[key] === undefined) row[key] = existing[key]
        }
        // CSV 備註空白 → 保留既有備註文字（不清空）
        if (row.notes === null) row.notes = existing.notes ?? null
      } else {
        inserted++
      }
      return row
    })

    const { data: items, error: upsertError } = await supabase
      .from('standard_price_items')
      .upsert(upsertRows, { onConflict: 'name,effective_date' })
      .select()

    if (upsertError) throw upsertError

    return NextResponse.json({ inserted, updated, items: items ?? [] })
  } catch (err) {
    console.error('[standard-prices/import] error', err)
    return NextResponse.json({ error: '匯入失敗，未寫入任何資料' }, { status: 500 })
  }
}
