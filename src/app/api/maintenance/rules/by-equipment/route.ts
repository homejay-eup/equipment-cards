import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isLoggedIn, computeNeedsReview } from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface LinkRow {
  equipment_id: string
  maintenance_rules: {
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
    maintenance_vendors: { id: string; name: string } | { id: string; name: string }[] | null
  } | Array<{
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
    maintenance_vendors: { id: string; name: string } | { id: string; name: string }[] | null
  }> | null
}

// ── GET /api/maintenance/rules/by-equipment?equipment_id= ───────
// 回傳與該料號相關的規則清單，供 CardDetailDialog「查看維修資訊」入口使用。
// 讀取類 API，所有登入使用者皆可呼叫。
export async function GET(req: NextRequest) {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const equipment_id = req.nextUrl.searchParams.get('equipment_id')?.trim()
  if (!equipment_id) {
    return NextResponse.json({ error: 'equipment_id 為必填查詢參數' }, { status: 400 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_rule_equipment')
      .select(
        'equipment_id, maintenance_rules(id, vendor_id, item, rule_type, content, warranty_start_date, ' +
        'warranty_period_months, last_updated_at, last_updated_by, confirmed_at, confirmed_by, sort_order, created_at, ' +
        'maintenance_vendors(id, name))',
      )
      .eq('equipment_id', equipment_id)

    if (error) throw error

    const rows = (data ?? []) as unknown as LinkRow[]
    const rules = rows
      .map((row) => {
        const rule = Array.isArray(row.maintenance_rules) ? row.maintenance_rules[0] : row.maintenance_rules
        if (!rule) return null
        const vendor = Array.isArray(rule.maintenance_vendors) ? rule.maintenance_vendors[0] : rule.maintenance_vendors
        return {
          id: rule.id,
          vendor_id: rule.vendor_id,
          vendor_name: vendor?.name ?? '',
          item: rule.item,
          rule_type: rule.rule_type,
          content: rule.content,
          warranty_start_date: rule.warranty_start_date,
          warranty_period_months: rule.warranty_period_months,
          last_updated_at: rule.last_updated_at,
          last_updated_by: rule.last_updated_by,
          confirmed_at: rule.confirmed_at,
          confirmed_by: rule.confirmed_by,
          needs_review: computeNeedsReview(rule.last_updated_at, rule.confirmed_at),
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)

    return NextResponse.json({ rules })
  } catch (err) {
    console.error('[maintenance/rules/by-equipment] error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}
