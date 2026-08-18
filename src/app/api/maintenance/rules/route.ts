import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { computeNeedsReview, isLoggedIn, VALID_MAINTENANCE_RULE_TYPES, MAX_WARRANTY_PERIOD_MONTHS } from '@/lib/maintenance'

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
  vendor_id: string
  item: string
  rule_type: string
  content: string
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
    rule_type: row.rule_type,
    content: row.content,
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

// ── GET /api/maintenance/rules?vendor_id= ───────────────────────
// 回傳該廠商底下所有規則，每筆帶出掛載的料號清單（含名稱）。讀取類 API，所有登入使用者皆可呼叫。
export async function GET(req: NextRequest) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const vendor_id = req.nextUrl.searchParams.get('vendor_id')?.trim()
  if (!vendor_id) {
    return NextResponse.json({ error: 'vendor_id 為必填查詢參數' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_rules')
      .select(
        'id, vendor_id, item, rule_type, content, warranty_start_date, warranty_period_months, ' +
        'last_updated_at, last_updated_by, ' +
        'confirmed_at, confirmed_by, sort_order, created_at, ' +
        'maintenance_rule_equipment(equipment_id, equipment_cards(equipment_id, name))',
      )
      .eq('vendor_id', vendor_id)
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
    const rule_type = typeof body?.rule_type === 'string' ? body.rule_type.trim() : ''
    const content = typeof body?.content === 'string' ? body.content.trim() : ''

    if (!vendor_id) return NextResponse.json({ error: 'vendor_id 為必填' }, { status: 400 })
    if (!item) return NextResponse.json({ error: 'item 為必填' }, { status: 400 })
    if (!content) return NextResponse.json({ error: 'content 為必填' }, { status: 400 })
    if (!VALID_MAINTENANCE_RULE_TYPES.includes(rule_type as typeof VALID_MAINTENANCE_RULE_TYPES[number])) {
      return NextResponse.json(
        { error: `rule_type 必須為以下其中之一：${VALID_MAINTENANCE_RULE_TYPES.join('、')}` },
        { status: 400 },
      )
    }

    const equipment_ids: string[] = Array.isArray(body?.equipment_ids)
      ? body.equipment_ids.filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
      : []

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

    const { data: vendor, error: vendorError } = await supabase
      .from('maintenance_vendors')
      .select('id')
      .eq('id', vendor_id)
      .maybeSingle()
    if (vendorError) throw vendorError
    if (!vendor) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })

    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()
    const actorEmail = user?.email ?? null

    const now = new Date().toISOString()
    const { data: rule, error: ruleError } = await supabase
      .from('maintenance_rules')
      .insert({
        vendor_id,
        item,
        rule_type,
        content,
        warranty_start_date,
        warranty_period_months,
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
