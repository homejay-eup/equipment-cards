import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { VALID_MAINTENANCE_RULE_TYPES } from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── PATCH /api/maintenance/rules/[id] ───────────────────────────
// 編輯規則內容/類型/保固起始日，需 manage_maintenance_info；更新 last_updated_at/by
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if ('item' in body) {
      const item = typeof body.item === 'string' ? body.item.trim() : ''
      if (!item) return NextResponse.json({ error: 'item 不可為空' }, { status: 400 })
      updates.item = item
    }
    if ('rule_type' in body) {
      const rule_type = typeof body.rule_type === 'string' ? body.rule_type.trim() : ''
      if (!VALID_MAINTENANCE_RULE_TYPES.includes(rule_type as typeof VALID_MAINTENANCE_RULE_TYPES[number])) {
        return NextResponse.json(
          { error: `rule_type 必須為以下其中之一：${VALID_MAINTENANCE_RULE_TYPES.join('、')}` },
          { status: 400 },
        )
      }
      updates.rule_type = rule_type
    }
    if ('content' in body) {
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      if (!content) return NextResponse.json({ error: 'content 不可為空' }, { status: 400 })
      updates.content = content
    }
    if ('warranty_start_date' in body) {
      updates.warranty_start_date = typeof body.warranty_start_date === 'string' && body.warranty_start_date.trim()
        ? body.warranty_start_date.trim()
        : null
    }
    if ('sort_order' in body && typeof body.sort_order === 'number') {
      updates.sort_order = body.sort_order
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
    }

    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()
    updates.last_updated_at = new Date().toISOString()
    updates.last_updated_by = user?.email ?? null

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_rules')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    return NextResponse.json({ rule: data })
  } catch (err) {
    console.error('[maintenance/rules/id] update error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// ── DELETE /api/maintenance/rules/[id] ──────────────────────────
// 刪除規則（ON DELETE CASCADE 連動清掉 maintenance_rule_equipment），需 manage_maintenance_info
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_rules')
      .delete()
      .eq('id', params.id)
      .select('id')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[maintenance/rules/id] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
