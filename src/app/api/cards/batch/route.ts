import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

interface BatchRow {
  equipment_id: string
  name: string
  category?: string | null
  vendor?: string | null
  status?: string
  tags?: string[] | null
  notes?: string | null
  net_weight?: number | null
  is_new?: boolean
}

// ── POST /api/cards/batch ─────────────────────────────────────
// 批次新增料卡（管理員）
export async function POST(req: NextRequest) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let rows: BatchRow[]
  try {
    const body = await req.json()
    rows = body.rows
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: '無有效資料' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: '格式錯誤' }, { status: 400 })
  }

  const supabase = getSupabase()
  const inserted: string[] = []
  const updated: string[] = []
  const unchanged: string[] = []
  const skipped: string[] = []
  const errors: string[] = []

  const processRow = async (row: BatchRow) => {
    if (!row?.equipment_id?.trim() || !row?.name?.trim()) {
      errors.push(`${row?.equipment_id?.trim() || '(無料號)'}：缺少必填欄位（料號或名稱）`)
      return
    }

    const { error } = await supabase
      .from('equipment_cards')
      .insert({
        equipment_id: row.equipment_id.trim(),
        name: row.name.trim(),
        category: row.category != null ? row.category.trim() || null : null,
        vendor: row.vendor != null ? row.vendor.trim() || null : null,
        status: row.status?.trim() || '現役',
        tags: Array.isArray(row.tags) ? row.tags : [],
        notes: row.notes != null ? row.notes.trim() || null : null,
        detail_photos: [],
        net_weight: (typeof row.net_weight === 'number' && !isNaN(row.net_weight)) ? row.net_weight : null,
        is_new: typeof row.is_new === 'boolean' ? row.is_new : true,
      })

    if (error) {
      if (error.code === '23505') {
        // SELECT 現有資料，比對後只更新有差異的欄位
        const { data: existing, error: selectError } = await supabase
          .from('equipment_cards')
          .select('name, category, vendor, status, tags, notes, net_weight, is_new')
          .eq('equipment_id', row.equipment_id.trim())
          .single()

        if (selectError || !existing) {
          errors.push(`${row.equipment_id}：無法讀取現有資料`)
          return
        }

        const updatePayload: Record<string, unknown> = {}

        // name（必填，直接比對）
        const newName = row.name.trim()
        if (newName !== existing.name) updatePayload.name = newName

        // category（undefined = 保留，null = 清空，string = 更新）
        if (row.category !== undefined) {
          const newCat = row.category != null ? row.category.trim() || null : null
          if (newCat !== existing.category) updatePayload.category = newCat
        }

        // vendor
        if (row.vendor !== undefined) {
          const newVendor = row.vendor != null ? row.vendor.trim() || null : null
          if (newVendor !== existing.vendor) updatePayload.vendor = newVendor
        }

        // status
        if (row.status !== undefined) {
          const newStatus = row.status.trim() || '現役'
          if (newStatus !== existing.status) updatePayload.status = newStatus
        }

        // tags（陣列比對用 JSON.stringify）
        if (row.tags !== undefined) {
          const newTags = Array.isArray(row.tags) ? row.tags : []
          const existingTags = Array.isArray(existing.tags) ? existing.tags : []
          if (JSON.stringify(newTags) !== JSON.stringify(existingTags)) updatePayload.tags = newTags
        }

        // notes
        if (row.notes !== undefined) {
          const newNotes = row.notes != null ? row.notes.trim() || null : null
          if (newNotes !== existing.notes) updatePayload.notes = newNotes
        }

        // net_weight
        if (row.net_weight !== undefined) {
          const newWeight = (typeof row.net_weight === 'number' && !isNaN(row.net_weight)) ? row.net_weight : null
          if (newWeight !== existing.net_weight) updatePayload.net_weight = newWeight
        }

        // is_new
        if (typeof row.is_new === 'boolean') {
          if (row.is_new !== existing.is_new) updatePayload.is_new = row.is_new
        }

        if (Object.keys(updatePayload).length === 0) {
          unchanged.push(row.equipment_id)
          return
        }

        updatePayload.updated_at = new Date().toISOString()

        const { error: updateError } = await supabase
          .from('equipment_cards')
          .update(updatePayload)
          .eq('equipment_id', row.equipment_id.trim())

        if (updateError) {
          errors.push(`${row.equipment_id}：${updateError.message}`)
        } else {
          updated.push(row.equipment_id)
        }
      } else {
        errors.push(`${row.equipment_id}：${error.message}`)
      }
    } else {
      inserted.push(row.equipment_id)
    }
  }

  // 並行處理，每批 50 筆
  const CHUNK = 50
  for (let i = 0; i < rows.length; i += CHUNK) {
    await Promise.all(rows.slice(i, i + CHUNK).map(processRow))
  }

  return NextResponse.json({ inserted: inserted.length, updated: updated.length, unchanged: unchanged.length, skipped, errors })
}
