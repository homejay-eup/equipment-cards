import { NextRequest, NextResponse } from 'next/server'
import { v2 as cloudinary } from 'cloudinary'
import { createClient } from '@supabase/supabase-js'
import { requireAdmin } from '@/lib/admin'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function getCloudinary() {
  cloudinary.config({
    cloud_name: process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  })
  return cloudinary
}

// ── PATCH /api/cards/[id] ─────────────────────────────────────
// 更新料卡文字欄位（管理員）
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { equipment_id: newId, name, category, vendor, status, tags, notes, is_new } = body

    const supabase = getSupabase()

    // 若料號有變動，先確認新料號不重複
    if (newId && newId.trim() !== params.id) {
      const { data: existing } = await supabase
        .from('equipment_cards')
        .select('equipment_id')
        .eq('equipment_id', newId.trim())
        .maybeSingle()
      if (existing) {
        return NextResponse.json({ error: '料號已存在' }, { status: 409 })
      }
    }

    const { data, error } = await supabase
      .from('equipment_cards')
      .update({
        ...(newId && newId.trim() !== params.id ? { equipment_id: newId.trim() } : {}),
        name: name?.trim(),
        category: category || null,
        vendor: vendor?.trim() || null,
        status,
        tags: Array.isArray(tags) ? tags : [],
        notes: notes?.trim() || null,
        ...(typeof is_new === 'boolean' ? { is_new } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('equipment_id', params.id)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (err) {
    console.error('[cards] update error', err)
    return NextResponse.json({ error: '更新失敗' }, { status: 500 })
  }
}

// ── DELETE /api/cards/[id] ────────────────────────────────────
// 刪除料卡（管理員）：同時清除 Cloudinary 所有照片
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!await requireAdmin()) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const supabase = getSupabase()
    const cdn = getCloudinary()

    // 1. 取得料卡（需要照片 public_id）
    const { data: card, error: fetchError } = await supabase
      .from('equipment_cards')
      .select('main_photo_public_id, detail_photos')
      .eq('equipment_id', params.id)
      .single()

    if (fetchError) throw fetchError

    // 2. 刪除 Cloudinary 照片（parallel）
    const publicIds: string[] = []
    if (card?.main_photo_public_id) publicIds.push(card.main_photo_public_id)
    const details: { public_id: string }[] = card?.detail_photos ?? []
    details.forEach(p => publicIds.push(p.public_id))

    await Promise.allSettled(
      publicIds.map(id => cdn.uploader.destroy(id))
    )

    // 3. 刪除 Supabase 資料
    const { error: deleteError } = await supabase
      .from('equipment_cards')
      .delete()
      .eq('equipment_id', params.id)

    if (deleteError) throw deleteError

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[cards] delete error', err)
    return NextResponse.json({ error: '刪除失敗' }, { status: 500 })
  }
}
