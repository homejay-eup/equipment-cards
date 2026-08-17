import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function parseEquipmentIds(body: unknown): string[] | null {
  const ids = (body as { equipment_ids?: unknown } | null)?.equipment_ids
  if (!Array.isArray(ids)) return null
  const cleaned = ids.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
  return cleaned.length > 0 ? cleaned : null
}

// ── POST /api/maintenance/rules/[id]/link ───────────────────────
// Body: { equipment_ids: string[] }。事後新增掛載，需 manage_maintenance_info
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const equipment_ids = parseEquipmentIds(body)
    if (!equipment_ids) {
      return NextResponse.json({ error: 'equipment_ids 為必填且不可為空陣列' }, { status: 400 })
    }

    const supabase = getSupabase()

    const { data: rule, error: ruleError } = await supabase
      .from('maintenance_rules')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (ruleError) throw ruleError
    if (!rule) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    const { data: cards, error: cardsError } = await supabase
      .from('equipment_cards')
      .select('equipment_id')
      .in('equipment_id', equipment_ids)
    if (cardsError) throw cardsError

    const validIds = (cards ?? []).map((c) => c.equipment_id)
    if (validIds.length === 0) {
      return NextResponse.json({ error: '找不到任何有效料號' }, { status: 404 })
    }

    const rows = validIds.map((equipment_id) => ({ rule_id: params.id, equipment_id }))
    const { error: linkError } = await supabase
      .from('maintenance_rule_equipment')
      .upsert(rows, { onConflict: 'rule_id,equipment_id', ignoreDuplicates: true })

    if (linkError) throw linkError

    return NextResponse.json({ ok: true, linked: validIds })
  } catch (err) {
    console.error('[maintenance/rules/link] link error', err)
    return NextResponse.json({ error: '掛載失敗' }, { status: 500 })
  }
}

// ── DELETE /api/maintenance/rules/[id]/link ─────────────────────
// Body: { equipment_ids: string[] }。移除掛載，不影響規則本身，需 manage_maintenance_info
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    const equipment_ids = parseEquipmentIds(body)
    if (!equipment_ids) {
      return NextResponse.json({ error: 'equipment_ids 為必填且不可為空陣列' }, { status: 400 })
    }

    const supabase = getSupabase()
    const { error, count } = await supabase
      .from('maintenance_rule_equipment')
      .delete({ count: 'exact' })
      .eq('rule_id', params.id)
      .in('equipment_id', equipment_ids)

    if (error) throw error

    return NextResponse.json({ ok: true, unlinked_count: count ?? 0 })
  } catch (err) {
    console.error('[maintenance/rules/link] unlink error', err)
    return NextResponse.json({ error: '移除掛載失敗' }, { status: 500 })
  }
}
