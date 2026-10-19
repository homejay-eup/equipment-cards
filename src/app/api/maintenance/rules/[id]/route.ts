import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { validateRichContent } from '@/lib/richContentValidation'
import { destroyOwnImages } from '@/lib/maintenanceCloudinary'
import {
  MAX_WARRANTY_PERIOD_MONTHS, MAX_AGE_LIMIT_BASIS_LENGTH, isValidStage, checkStageSubCategory, clearInapplicableFields,
} from '@/lib/maintenance'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── PATCH /api/maintenance/rules/[id] ───────────────────────────
// 編輯規則（Step 49：區塊/子類/去向/年限/廠商），需 manage_maintenance_info；更新 last_updated_at/by
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

    const supabase = getSupabase()
    const updates: Record<string, unknown> = {}
    if ('item' in body) {
      const item = typeof body.item === 'string' ? body.item.trim() : ''
      if (!item) return NextResponse.json({ error: 'item 不可為空' }, { status: 400 })
      updates.item = item
    }
    // Step 49：rule_type 為棄用欄位，不再接受更新（忽略）
    if ('stage' in body) {
      const stage = typeof body.stage === 'string' ? body.stage.trim() : ''
      if (!isValidStage(stage)) {
        return NextResponse.json({ error: checkStageSubCategory(stage, null) }, { status: 400 })
      }
      updates.stage = stage
    }
    if ('sub_category' in body) {
      updates.sub_category = typeof body.sub_category === 'string' && body.sub_category.trim() ? body.sub_category.trim() : null
    }
    if ('exit_option' in body) {
      updates.exit_option = typeof body.exit_option === 'string' && body.exit_option.trim() ? body.exit_option.trim() : null
    }
    if ('age_limit_months' in body) {
      if (body.age_limit_months === null) {
        updates.age_limit_months = null
      } else {
        const n = Number(body.age_limit_months)
        if (!Number.isInteger(n) || n < 0 || n > MAX_WARRANTY_PERIOD_MONTHS) {
          return NextResponse.json(
            { error: `age_limit_months 必須為 0～${MAX_WARRANTY_PERIOD_MONTHS} 之間的整數` },
            { status: 400 },
          )
        }
        updates.age_limit_months = n
      }
    }
    if ('age_limit_basis' in body) {
      const basis = typeof body.age_limit_basis === 'string' && body.age_limit_basis.trim() ? body.age_limit_basis.trim() : null
      if (basis !== null && basis.length > MAX_AGE_LIMIT_BASIS_LENGTH) {
        return NextResponse.json({ error: `age_limit_basis 不可超過 ${MAX_AGE_LIMIT_BASIS_LENGTH} 字` }, { status: 400 })
      }
      updates.age_limit_basis = basis
    }
    if ('vendor_id' in body) {
      updates.vendor_id = typeof body.vendor_id === 'string' && body.vendor_id.trim() ? body.vendor_id.trim() : null
    }
    // Step 50：三個內容欄位任一有送到就整批驗證後寫入；沒送到的欄位沿用資料庫現值，
    // 避免只改文字時把既有圖片／表格清空。
    const contentTouched = 'content' in body || 'content_image_urls' in body || 'content_table_data' in body
    let removedImages: Array<{ public_id?: string }> = []
    if (contentTouched) {
      const { data: cur, error: curError } = await supabase
        .from('maintenance_rules')
        .select('content, content_image_urls, content_table_data')
        .eq('id', params.id)
        .maybeSingle()
      if (curError) throw curError
      if (!cur) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

      const rich = validateRichContent(
        {
          content: 'content' in body ? body.content : cur.content,
          image_urls: 'content_image_urls' in body ? body.content_image_urls : cur.content_image_urls,
          table_data: 'content_table_data' in body ? body.content_table_data : cur.content_table_data,
        },
        { requireNonEmpty: true, emptyErrorMessage: '內容為必填（文字／圖片／表格至少一項）' },
      )
      if (!rich.ok) return NextResponse.json({ error: rich.error }, { status: rich.status })

      updates.content = rich.content ?? ''
      updates.content_image_urls = rich.images
      updates.content_table_data = rich.table

      const keep = new Set(rich.images.map((i) => i.public_id))
      removedImages = ((cur.content_image_urls ?? []) as Array<{ public_id?: string }>)
        .filter((i) => i?.public_id && !keep.has(i.public_id))
    }
    if ('warranty_start_date' in body) {
      updates.warranty_start_date = typeof body.warranty_start_date === 'string' && body.warranty_start_date.trim()
        ? body.warranty_start_date.trim()
        : null
    }
    if ('sort_order' in body && typeof body.sort_order === 'number') {
      updates.sort_order = body.sort_order
    }
    if ('warranty_period_months' in body) {
      if (body.warranty_period_months === null) {
        updates.warranty_period_months = null
      } else {
        const n = Number(body.warranty_period_months)
        if (!Number.isInteger(n) || n < 0 || n > MAX_WARRANTY_PERIOD_MONTHS) {
          return NextResponse.json(
            { error: `warranty_period_months 必須為 0～${MAX_WARRANTY_PERIOD_MONTHS} 之間的整數` },
            { status: 400 },
          )
        }
        updates.warranty_period_months = n
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
    }

    // stage / sub_category / exit_option 相容性：需合併現有資料判斷有效值
    if ('stage' in updates || 'sub_category' in updates || 'exit_option' in updates) {
      const { data: existing, error: existingError } = await supabase
        .from('maintenance_rules')
        .select('stage, sub_category, exit_option')
        .eq('id', params.id)
        .maybeSingle()
      if (existingError) throw existingError
      if (!existing) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

      const effStage = ('stage' in updates ? updates.stage : existing.stage) as string
      let effSub = ('sub_category' in updates ? updates.sub_category : existing.sub_category) as string | null
      // 改區塊但沒指定子類，且舊子類與新區塊不相容 → 子類清空（由前端/使用者之後再補）
      if ('stage' in updates && !('sub_category' in updates) && checkStageSubCategory(effStage, effSub)) {
        effSub = null
        updates.sub_category = null
      }
      const subError = checkStageSubCategory(effStage, effSub)
      if (subError) return NextResponse.json({ error: subError }, { status: 400 })

      // 區塊／子類實際改變時，清除在新位置不適用的保固／年限欄位（呼叫端明確帶值者優先）
      const cleared = clearInapplicableFields(
        { stage: existing.stage as string, sub_category: existing.sub_category as string | null },
        { stage: effStage, sub_category: effSub },
      )
      for (const [k, v] of Object.entries(cleared)) if (!(k in updates)) updates[k] = v

      if ('exit_option' in updates && updates.exit_option !== null && effStage !== '回廠') {
        return NextResponse.json({ error: 'exit_option 僅限回廠區塊使用' }, { status: 400 })
      }
      // 離開回廠區塊時，未明確指定 exit_option 則一併清空，避免殘留不適用資料
      if (effStage !== '回廠' && !('exit_option' in updates)) {
        updates.exit_option = null
      }
    }

    if ('vendor_id' in updates && updates.vendor_id !== null) {
      const { data: vendor, error: vendorError } = await supabase
        .from('maintenance_vendors')
        .select('id')
        .eq('id', updates.vendor_id as string)
        .maybeSingle()
      if (vendorError) throw vendorError
      if (!vendor) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })
    }

    // 使用者身份從 session 取得，不信任 request body
    const sessionSupabase = createSupabaseServerClient()
    const { data: { user } } = await sessionSupabase.auth.getUser()
    updates.last_updated_at = new Date().toISOString()
    updates.last_updated_by = user?.email ?? null

    const { data, error } = await supabase
      .from('maintenance_rules')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    // DB 已更新成功才清 Cloudinary（best effort，失敗只回警告）
    const warning = removedImages.length > 0
      ? await destroyOwnImages(removedImages, '規則已儲存')
      : null

    return NextResponse.json(warning ? { rule: data, warning } : { rule: data })
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
      .select('id, content_image_urls')
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到規則' }, { status: 404 })

    // 刪除成功後 best-effort 清除該規則圖片
    const warning = await destroyOwnImages(
      (data.content_image_urls ?? []) as Array<{ public_id?: string }>,
      '規則已刪除',
    )
    return NextResponse.json(warning ? { ok: true, warning } : { ok: true })
  } catch (err) {
    console.error('[maintenance/rules/id] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
