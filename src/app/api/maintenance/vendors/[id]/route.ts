import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requirePermission } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

// ── PATCH /api/maintenance/vendors/[id] ─────────────────────────
// 編輯廠商基本資料，需 manage_maintenance_info
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
    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : ''
      if (!name) return NextResponse.json({ error: 'name 不可為空' }, { status: 400 })
      updates.name = name
    }
    if ('vendor_code' in body) {
      updates.vendor_code = typeof body.vendor_code === 'string' ? body.vendor_code.trim() || null : null
    }
    if ('address' in body) {
      updates.address = typeof body.address === 'string' ? body.address.trim() || null : null
    }
    if ('contact_name' in body) {
      updates.contact_name = typeof body.contact_name === 'string' ? body.contact_name.trim() || null : null
    }
    if ('contact_phone' in body) {
      updates.contact_phone = typeof body.contact_phone === 'string' ? body.contact_phone.trim() || null : null
    }
    if ('sort_order' in body && typeof body.sort_order === 'number') {
      updates.sort_order = body.sort_order
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: '沒有可更新的欄位' }, { status: 400 })
    }
    updates.updated_at = new Date().toISOString()

    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('maintenance_vendors')
      .update(updates)
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) throw error
    if (!data) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })

    return NextResponse.json({ vendor: data })
  } catch (err) {
    console.error('[maintenance/vendors/id] update error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// ── DELETE /api/maintenance/vendors/[id] ────────────────────────
// 刪除廠商，需 manage_maintenance_info。允許直接整個刪除：底下的 maintenance_rules
// （及規則對料號的掛載 maintenance_rule_equipment）由 DB 端 ON DELETE CASCADE 一併清除
// （見 _開發檔案/sql/step38-maintenance-info.sql），不在應用層另外擋。
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requirePermission('manage_maintenance_info')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()

    const { data: vendor, error: vendorError } = await supabase
      .from('maintenance_vendors')
      .select('id')
      .eq('id', params.id)
      .maybeSingle()
    if (vendorError) throw vendorError
    if (!vendor) return NextResponse.json({ error: '找不到廠商' }, { status: 404 })

    const { error: deleteError } = await supabase
      .from('maintenance_vendors')
      .delete()
      .eq('id', params.id)
    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[maintenance/vendors/id] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
