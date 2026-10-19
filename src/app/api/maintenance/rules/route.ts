import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { validateRichContent } from '@/lib/richContentValidation'
import {
  computeNeedsReview, isLoggedIn, MAX_WARRANTY_PERIOD_MONTHS, MAX_AGE_LIMIT_BASIS_LENGTH,
  isValidStage, checkStageSubCategory, clearInapplicableFields,
} from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface RuleEquipmentLinkRow {
  equipment_id: string
  equipment_cards: { equipment_id: string; name: string } | { equipment_id: string; name: string }[] | null
}

interface RuleRow {
  id: string
  vendor_id: string | null
  item: string
  rule_type: string | null
  stage: string
  sub_category: string | null
  exit_option: string | null
  age_limit_months: number | null
  age_limit_basis: string | null
  maintenance_vendors?: { name: string } | { name: string }[] | null
  content: string
  content_image_urls: unknown
  content_table_data: unknown
  warranty_start_date: string | null
  warranty_period_months: number | null
  last_updated_at: string
  last_updated_by: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  sort_order: number
  created_at: string
  maintenance_rule_equipment: RuleEquipmentLinkRow[] | null
}

function formatRule(row: RuleRow) {
  const linkRows = row.maintenance_rule_equipment ?? []
  const equipment_ids = linkRows
    .map((link) => {
      const card = Array.isArray(link.equipment_cards) ? link.equipment_cards[0] : link.equipment_cards
      return card ? { equipment_id: card.equipment_id, name: card.name } : null
    })
    .filter((c): c is { equipment_id: string; name: string } => c !== null)

  return {
    id: row.id,
    vendor_id: row.vendor_id,
    item: row.item,
    vendor_name: Array.isArray(row.maintenance_vendors)
      ? (row.maintenance_vendors[0]?.name ?? null)
      : (row.maintenance_vendors?.name ?? null),
    rule_type: row.rule_type,
    stage: row.stage,
    sub_category: row.sub_category,
    exit_option: row.exit_option,
    age_limit_months: row.age_limit_months,
    age_limit_basis: row.age_limit_basis,
    content: row.content,
    content_image_urls: row.content_image_urls ?? [],
    content_table_data: row.content_table_data ?? null,
    warranty_start_date: row.warranty_start_date,
    warranty_period_months: row.warranty_period_months,
    last_updated_at: row.last_updated_at,
    last_updated_by: row.last_updated_by,
    confirmed_at: row.confirmed_at,
    confirmed_by: row.confirmed_by,
    sort_order: row.sort_order,
    created_at: row.created_at,
    equipment_ids,
    needs_review: computeNeedsReview(row.last_updated_at, row.confirmed_at),
  }
}

// ── GET /api/maintenance/rules[?vendor_id=] ─────────────────────
// Step 49：vendor_id 選填。未帶則回傳全部規則（含 vendor_name），每筆帶出掛載的料號清單（含名稱）。
// 讀取類 API，所有登入使用者皆可呼叫。
export async function GET(req: NextRequest) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor_id = req.nextUrl.searchParams.get('vendor_id')?.trim()

  try {
    const supabase = getSupabase()
    let query = supabase
      .from('maintenance_rules')
      .select(
        'id, vendor_id, item, rule_type, stage, sub_category, exit_option, age_limit_months, age_limit_basis, ' +
        'content, content_image_urls, content_table_data, warranty_start_date, warranty_period_months, ' +
        'last_updated_at, last_updated_by, ' +
        'confirmed_at, confirmed_by, sort_order, created_at, ' +
        'maintenance_vendors(name), ' +
        'maintenance_rule_equipment(equipment_id, equipment_cards(equipment_id, name))',
      )
    if (vendor_id) query = query.eq('vendor_id', vendor_id)
    const { data, error } = await query
      .order('sort_order', { ascending: true })
      .order('item', { ascending: true })

    if (error) throw error

    const rows = (data ?? []) as unknown as RuleRow[]
    return NextResponse.json({ rules: rows.map(formatRule) })
  } catch (err) {
    console.error('[maintenance/rules] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── POST /api/maintenance/rules ──────────────────────────────────
// 新增規則（可一併帶 equipment_ids 掛載料號），需 manage_maintenance_info
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const vendor_id = typeof body?.vendor_id === 'string' ? body.vendor_id.trim() : ''
    const item = typeof body?.item === 'string' ? body.item.trim() : ''
    const stage = typeof body?.stage === 'string' ? body.stage.trim() : ''
    const sub_category = typeof body?.sub_category === 'string' && body.sub_category.trim() ? body.sub_category.trim() : null

    if (!item) return NextResponse.json({ error: 'item 為必填' }, { status: 400 })
    // Step 50：內容為複合內容，文字／圖片／表格至少一項
    const rich = validateRichContent(
      { content: body?.content, image_urls: body?.content_image_urls, table_data: body?.content_table_data },
      { requireNonEmpty: true, emptyErrorMessage: '內容為必填（文字／圖片／表格至少一項）' },
    )
    if (!rich.ok) return NextResponse.json({ error: rich.error }, { status: rich.status })
    if (!stage) return NextResponse.json({ error: 'stage 為必填' }, { status: 400 })
    if (!isValidStage(stage)) {
      return NextResponse.json({ error: checkStageSubCategory(stage, null) }, { status: 400 })
    }
    const subError = checkStageSubCategory(stage, sub_category)
    if (subError) return NextResponse.json({ error: subError }, { status: 400 })

    // exit_option 僅回廠區塊接受；其他區塊帶了值一律拒絕（400），避免靜默吞掉資料
    const exit_option = typeof body?.exit_option === 'string' && body.exit_option.trim() ? body.exit_option.trim() : null
    if (exit_option !== null && stage !== '回廠') {
      return NextResponse.json({ error: 'exit_option 僅限回廠區塊使用' }, { status: 400 })
    }

    let age_limit_months: number | null = null
    if (body?.age_limit_months !== undefined && body?.age_limit_months !== null) {
      const n = Number(body.age_limit_months)
      if (!Number.isInteger(n) || n < 0 || n > MAX_WARRANTY_PERIOD_MONTHS) {
        return NextResponse.json(
          { error: `age_limit_months 必須為 0～${MAX_WARRANTY_PERIOD_MONTHS} 之間的整數` },
          { status: 400 },
        )
      }
      age_limit_months = n
    }
    const age_limit_basis = typeof body?.age_limit_basis === 'string' && body.age_limit_basis.trim()
      ? body.age_limit_basis.trim()
      : null
    if (age_limit_basis !== null && age_limit_basis.length > MAX_AGE_LIMIT_BASIS_LENGTH) {
      return NextResponse.json({ error: `age_limit_basis 不可超過 ${MAX_AGE_LIMIT_BASIS_LENGTH} 字` }, { status: 400 })
    }

    const equipment_ids: string[] = Array.isArray(body?.equipment_ids)
      ? Array.from(new Set<string>(
          body.equipment_ids
            .filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
            .map((e: string) => e.trim()),
        ))
      : []
    if (equipment_ids.length > 200) {
      return NextResponse.json({ error: '單次掛載料號上限 200 筆' }, { status: 400 })
    }

    const warranty_start_date = typeof body?.warranty_start_date === 'string' && body.warranty_start_date.trim()
      ? body.warranty_start_date.trim()
      : null

    let warranty_period_months: number | null = null
    if (body?.warranty_period_months !== undefined && body?.warranty_period_months !== null) {
      const n = Number(body.warranty_period_months)
      if (!Number.isInteger(n) || n < 0 || n > MAX_WARRANTY_PERIOD_MONTHS) {
        return NextResponse.json(
          { error: `warranty_period_months 必須為 0～${MAX_WARRANTY_PERIOD_MONTHS} 之間的整數` },
          { status: 400 },
        )
      }
      warranty_period_months = n
    }

    const supabase = getSupabase()

    if (vendor_id) {
      const { data: vendor, error: vendorError } = await supabase
        .from('maintenance_vendors')
        .select('id')
        .eq('id', vendor_id)
        .maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })
    }

    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()
    const actorEmail = user?.email ?? null

    const now = new Date().toISOString()
    const { data: rule, error: ruleError } = await supabase
      .from('maintenance_rules')
      .insert({
        vendor_id: vendor_id || null,
        item,
        stage,
        sub_category,
        exit_option,
        age_limit_months,
        age_limit_basis,
        content: rich.content ?? '',
        content_image_urls: rich.images,
        content_table_data: rich.table,
        warranty_start_date,
        warranty_period_months,
        // 新增時同樣套用「不適用欄位清除」，與 PATCH／批次改區塊規則一致
        ...clearInapplicableFields(null, { stage, sub_category }),
        last_updated_at: now,
        last_updated_by: actorEmail,
        sort_order: typeof body?.sort_order === 'number' ? body.sort_order : 0,
      })
      .select()
      .single()
    if (ruleError) throw ruleError

    if (equipment_ids.length > 0) {
      const rows = equipment_ids.map((equipment_id) => ({ rule_id: rule.id, equipment_id }))
      const { error: linkError } = await supabase.from('maintenance_rule_equipment').insert(rows)
      if (linkError) {
        console.error('[maintenance/rules] link equipment error (rule already created)', linkError)
        // 規則本體已建立成功，掛載失敗不整筆回滾——回報成功但附帶警示，前端可另行補掛載
        return NextResponse.json(
          { rule, warning: '規則已建立，但部分料號掛載失敗，請重新掛載' },
          { status: 201 },
        )
      }
    }

    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    console.error('[maintenance/rules] create error', err)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }
}
