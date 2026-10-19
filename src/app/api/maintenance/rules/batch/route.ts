import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { destroyOwnImages } from '@/lib/maintenanceCloudinary'
import {
  MAX_WARRANTY_PERIOD_MONTHS, MAX_AGE_LIMIT_BASIS_LENGTH, STAGE_SUBCATEGORIES,
  isValidStage, checkStageSubCategory, clearInapplicableFields,
} from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

const MAX_BATCH_SIZE = 200
const CHUNK = 50
const ACTIONS = ['confirm', 'move_stage', 'link', 'unlink', 'set_vendor', 'set_fields', 'delete'] as const
type Action = (typeof ACTIONS)[number]

interface Failure { id: string; reason: string }

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// 全成功 200；部分失敗 207（Multi-Status）；全失敗 422。前端依 status 與 body.failed 分辨，不得靜默。
function respond(requested: number, succeeded: string[], failed: Failure[], extra: Record<string, unknown> = {}) {
  const status = failed.length === 0 ? 200 : succeeded.length === 0 ? 422 : 207
  return NextResponse.json(
    { ok: failed.length === 0, requested, succeeded_count: succeeded.length, succeeded, failed, ...extra },
    { status },
  )
}

// ── POST /api/maintenance/rules/batch ───────────────────────────
// Body: { ids: string[], action, payload }。需 manage_maintenance_info。
export async function POST(req: NextRequest) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json().catch(() => null)
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: '請求格式錯誤' }, { status: 400 })
    }

    const action = body.action as Action
    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: `action 必須為以下其中之一：${ACTIONS.join('、')}` }, { status: 400 })
    }
    if (!Array.isArray(body.ids)) {
      return NextResponse.json({ error: 'ids 必須為陣列' }, { status: 400 })
    }
    const ids: string[] = Array.from(new Set(
      body.ids
        .filter((v: unknown): v is string => typeof v === 'string' && v.trim().length > 0)
        .map((v: string) => v.trim()),
    ))
    if (ids.length === 0) return NextResponse.json({ error: 'ids 至少需要 1 筆' }, { status: 400 })
    if (ids.length > MAX_BATCH_SIZE) {
      return NextResponse.json({ error: `單次批次上限 ${MAX_BATCH_SIZE} 筆` }, { status: 400 })
    }
    const payload: Record<string, unknown> = body.payload && typeof body.payload === 'object' ? body.payload : {}

    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()
    const actorEmail = user?.email ?? null
    const now = new Date().toISOString()
    const touch = { last_updated_at: now, last_updated_by: actorEmail }

    const supabase = getSupabase()

    // 先確認哪些規則存在，不存在的列為失敗
    const { data: existingRows, error: existingError } = await supabase
      .from('maintenance_rules')
      .select('id, stage, sub_category, exit_option')
      .in('id', ids)
    if (existingError) throw existingError
    const existing = new Map((existingRows ?? []).map((r) => [r.id as string, r]))
    const failed: Failure[] = ids.filter((id) => !existing.has(id)).map((id) => ({ id, reason: '找不到規則' }))
    const foundIds = ids.filter((id) => existing.has(id))
    const succeeded: string[] = []

    // 對一批 id 執行 bulk 動作，失敗時把該批全部列入 failed
    const runBulk = async (targetIds: string[], fn: (batch: string[]) => Promise<void>) => {
      for (const batch of chunk(targetIds, CHUNK)) {
        try {
          await fn(batch)
          succeeded.push(...batch)
        } catch (err) {
          console.error(`[maintenance/rules/batch] ${action} chunk error`, err)
          for (const id of batch) failed.push({ id, reason: '資料庫寫入失敗' })
        }
      }
    }

    if (action === 'confirm') {
      await runBulk(foundIds, async (batch) => {
        const { error } = await supabase
          .from('maintenance_rules')
          .update({ confirmed_at: now, confirmed_by: actorEmail })
          .in('id', batch)
        if (error) throw error
      })
    } else if (action === 'move_stage') {
      const stage = typeof payload.stage === 'string' ? payload.stage.trim() : ''
      if (!isValidStage(stage)) {
        return NextResponse.json({ error: checkStageSubCategory(stage, null) }, { status: 400 })
      }
      const explicitSub = typeof payload.sub_category === 'string' && payload.sub_category.trim()
        ? payload.sub_category.trim()
        : null
      const subError = checkStageSubCategory(stage, explicitSub)
      if (subError) return NextResponse.json({ error: subError }, { status: 400 })

      for (const id of foundIds) {
        const row = existing.get(id)!
        // 子類：明確指定 > 舊子類仍相容則保留 > 該區塊只有一個子類則採用 > null
        let sub: string | null = explicitSub
        if (sub === null && row.sub_category && !checkStageSubCategory(stage, row.sub_category)) {
          sub = row.sub_category
        }
        if (sub === null && STAGE_SUBCATEGORIES[stage].length === 1) sub = STAGE_SUBCATEGORIES[stage][0]
        const update: Record<string, unknown> = {
          stage, sub_category: sub, ...touch,
          ...clearInapplicableFields({ stage: row.stage as string, sub_category: row.sub_category as string | null }, { stage, sub_category: sub }),
        }
        // 離開回廠區塊時清除去向，避免殘留不適用資料
        if (stage !== '回廠') update.exit_option = null
        const { error } = await supabase.from('maintenance_rules').update(update).eq('id', id)
        if (error) {
          console.error('[maintenance/rules/batch] move_stage error', error)
          failed.push({ id, reason: '資料庫寫入失敗' })
        } else {
          succeeded.push(id)
        }
      }
    } else if (action === 'link' || action === 'unlink') {
      const equipmentIds: string[] = Array.from(new Set(
        (Array.isArray(payload.equipment_ids) ? payload.equipment_ids : [])
          .filter((e: unknown): e is string => typeof e === 'string' && e.trim().length > 0)
          .map((e: string) => e.trim()),
      ))
      if (equipmentIds.length === 0) {
        return NextResponse.json({ error: 'payload.equipment_ids 為必填且不可為空陣列' }, { status: 400 })
      }

      if (equipmentIds.length > MAX_BATCH_SIZE) {
        return NextResponse.json({ error: `單次料號上限 ${MAX_BATCH_SIZE} 筆` }, { status: 400 })
      }

      let validEquipmentIds = equipmentIds
      let invalidEquipmentIds: string[] = []
      if (action === 'link') {
        const { data: cards, error: cardsError } = await supabase
          .from('equipment_cards')
          .select('equipment_id')
          .in('equipment_id', equipmentIds)
        if (cardsError) throw cardsError
        const validSet = new Set((cards ?? []).map((c) => c.equipment_id as string))
        validEquipmentIds = equipmentIds.filter((e) => validSet.has(e))
        invalidEquipmentIds = equipmentIds.filter((e) => !validSet.has(e))
        if (validEquipmentIds.length === 0) {
          return NextResponse.json({ error: '找不到任何有效料號' }, { status: 404 })
        }
      }

      await runBulk(foundIds, async (batch) => {
        if (action === 'link') {
          const rows = batch.flatMap((rule_id) => validEquipmentIds.map((equipment_id) => ({ rule_id, equipment_id })))
          const { error } = await supabase
            .from('maintenance_rule_equipment')
            .upsert(rows, { onConflict: 'rule_id,equipment_id', ignoreDuplicates: true })
          if (error) throw error
        } else {
          const { error } = await supabase
            .from('maintenance_rule_equipment')
            .delete()
            .in('rule_id', batch)
            .in('equipment_id', validEquipmentIds)
          if (error) throw error
        }
        const { error: touchError } = await supabase.from('maintenance_rules').update(touch).in('id', batch)
        if (touchError) throw touchError
      })
      return respond(ids.length, succeeded, failed, { invalid_equipment_ids: invalidEquipmentIds })
    } else if (action === 'set_vendor') {
      if (!('vendor_id' in payload)) {
        return NextResponse.json({ error: 'payload.vendor_id 為必填（可為 null 表示清除廠商）' }, { status: 400 })
      }
      const vendor_id = typeof payload.vendor_id === 'string' && payload.vendor_id.trim() ? payload.vendor_id.trim() : null
      if (vendor_id !== null) {
        const { data: vendor, error: vendorError } = await supabase
          .from('maintenance_vendors').select('id').eq('id', vendor_id).maybeSingle()
        if (vendorError) throw vendorError
        if (!vendor) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })
      }
      await runBulk(foundIds, async (batch) => {
        const { error } = await supabase.from('maintenance_rules').update({ vendor_id, ...touch }).in('id', batch)
        if (error) throw error
      })
    } else if (action === 'set_fields') {
      const ALLOWED = ['warranty_period_months', 'age_limit_months', 'age_limit_basis']
      const keys = Object.keys(payload)
      if (keys.length === 0) return NextResponse.json({ error: 'payload 不可為空' }, { status: 400 })
      const illegal = keys.filter((k) => !ALLOWED.includes(k))
      if (illegal.length > 0) {
        return NextResponse.json({ error: `不允許批次修改的欄位：${illegal.join('、')}` }, { status: 400 })
      }
      const updates: Record<string, unknown> = {}
      for (const key of ['warranty_period_months', 'age_limit_months'] as const) {
        if (!(key in payload)) continue
        const v = payload[key]
        if (v === null) { updates[key] = null; continue }
        const n = Number(v)
        if (!Number.isInteger(n) || n < 0 || n > MAX_WARRANTY_PERIOD_MONTHS) {
          return NextResponse.json({ error: `${key} 必須為 0～${MAX_WARRANTY_PERIOD_MONTHS} 之間的整數` }, { status: 400 })
        }
        updates[key] = n
      }
      if ('age_limit_basis' in payload) {
        const basis = typeof payload.age_limit_basis === 'string' && payload.age_limit_basis.trim()
          ? payload.age_limit_basis.trim()
          : null
        if (basis !== null && basis.length > MAX_AGE_LIMIT_BASIS_LENGTH) {
          return NextResponse.json({ error: `age_limit_basis 不可超過 ${MAX_AGE_LIMIT_BASIS_LENGTH} 字` }, { status: 400 })
        }
        updates.age_limit_basis = basis
      }
      // Step 50：不適用的規則拒絕並列入 failed，不靜默寫入（也不靜默忽略）。
      // 適用性：warranty_period_months 僅送修；age_limit_* 僅 檢測／年限判斷。規則需對 payload 所有欄位皆適用。
      const applicable = (row: { stage: unknown; sub_category: unknown }, key: string) => {
        if (key === 'warranty_period_months') return row.stage === '送修'
        return row.stage === '檢測' && row.sub_category === '年限判斷'
      }
      const applicableIds: string[] = []
      for (const id of foundIds) {
        const row = existing.get(id)!
        if (Object.keys(updates).every((k) => applicable(row, k))) applicableIds.push(id)
        else failed.push({ id, reason: '此規則不適用該欄位' })
      }
      await runBulk(applicableIds, async (batch) => {
        const { error } = await supabase.from('maintenance_rules').update({ ...updates, ...touch }).in('id', batch)
        if (error) throw error
      })
    } else if (action === 'delete') {
      // ON DELETE CASCADE 連動清掉 maintenance_rule_equipment
      const imagesToDestroy: Array<{ public_id?: string }> = []
      for (const batch of chunk(foundIds, CHUNK)) {
        const { data, error } = await supabase
          .from('maintenance_rules')
          .delete()
          .in('id', batch)
          .select('id, content_image_urls')
        if (error) {
          console.error('[maintenance/rules/batch] delete chunk error', error)
          for (const id of batch) failed.push({ id, reason: '資料庫寫入失敗' })
          continue
        }
        const deleted = new Set((data ?? []).map((r) => r.id as string))
        for (const r of data ?? []) {
          imagesToDestroy.push(...((r.content_image_urls ?? []) as Array<{ public_id?: string }>))
        }
        for (const id of batch) {
          if (deleted.has(id)) succeeded.push(id)
          else failed.push({ id, reason: '刪除未生效（可能已被他人刪除）' })
        }
      }
      // 刪除完成後 best-effort 清圖片，失敗只附 warning
      const warning = await destroyOwnImages(imagesToDestroy, '規則已刪除')
      return respond(ids.length, succeeded, failed, warning ? { warning } : {})
    }

    return respond(ids.length, succeeded, failed)
  } catch (err) {
    console.error('[maintenance/rules/batch] error', err)
    return NextResponse.json({ error: '批次操作失敗' }, { status: 500 })
  }
}
