import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { computeNeedsReview, isLoggedIn } from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface RuleAggregateRow {
  vendor_id: string
  last_updated_at: string
  confirmed_at: string | null
  maintenance_rule_equipment: { equipment_id: string }[] | null
}

// ── GET /api/maintenance/vendors ────────────────────────────────
// 回傳全部廠商，含每家的料號數／規則數／待覆核筆數（供頁籤首頁列表使用）。
// 讀取類 API，所有登入使用者皆可呼叫（一般人員唯讀瀏覽）。
export async function GET() {
  if (!(await isLoggedIn())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = getSupabase()

    const { data: vendors, error: vendorError } = await supabase
      .from('maintenance_vendors')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true })
    if (vendorError) throw vendorError

    const { data: rules, error: rulesError } = await supabase
      .from('maintenance_rules')
      .select('vendor_id, last_updated_at, confirmed_at, maintenance_rule_equipment(equipment_id)')
    if (rulesError) throw rulesError

    const ruleRows = (rules ?? []) as unknown as RuleAggregateRow[]

    const statsByVendor = new Map<string, { ruleCount: number; needsReviewCount: number; equipmentIds: Set<string> }>()
    for (const row of ruleRows) {
      let stats = statsByVendor.get(row.vendor_id)
      if (!stats) {
        stats = { ruleCount: 0, needsReviewCount: 0, equipmentIds: new Set() }
        statsByVendor.set(row.vendor_id, stats)
      }
      stats.ruleCount += 1
      if (computeNeedsReview(row.last_updated_at, row.confirmed_at)) {
        stats.needsReviewCount += 1
      }
      for (const link of row.maintenance_rule_equipment ?? []) {
        stats.equipmentIds.add(link.equipment_id)
      }
    }

    const results = (vendors ?? []).map((vendor) => {
      const stats = statsByVendor.get(vendor.id)
      return {
        ...vendor,
        rule_count: stats?.ruleCount ?? 0,
        needs_review_count: stats?.needsReviewCount ?? 0,
        equipment_count: stats?.equipmentIds.size ?? 0,
      }
    })

    return NextResponse.json({ vendors: results })
  } catch (err) {
    console.error('[maintenance/vendors] list error', err)
    return NextResponse.json({ error: '查詢失敗' }, { status: 500 })
  }
}

// ── POST /api/maintenance/vendors ───────────────────────────────
// 新增廠商，需 manage_maintenance_info
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) {
      return NextResponse.json({ error: 'name 為必填' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_vendors')
      .insert({
        name,
        vendor_code: typeof body?.vendor_code === 'string' ? body.vendor_code.trim() || null : null,
        address: typeof body?.address === 'string' ? body.address.trim() || null : null,
        contact_name: typeof body?.contact_name === 'string' ? body.contact_name.trim() || null : null,
        contact_phone: typeof body?.contact_phone === 'string' ? body.contact_phone.trim() || null : null,
        sort_order: typeof body?.sort_order === 'number' ? body.sort_order : 0,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ vendor: data }, { status: 201 })
  } catch (err) {
    console.error('[maintenance/vendors] create error', err)
    return NextResponse.json({ error: '新增失敗' }, { status: 500 })
  }
}
