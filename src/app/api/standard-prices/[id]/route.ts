import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { v2 as cloudinary } from 'cloudinary'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { validateStandardPriceInput, DUPLICATE_VERSION_MESSAGE } from '@/lib/standardPriceValidation'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
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

async function checkEditQuotes() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { permissions } = await getUserRoleWithPermissions(user.email)
  return permissions.includes('edit_quotes') ? user : null
}

type NotesImage = { public_id: string; url: string }

// 與 /api/standard-prices/notes-signature 的 folder 一致
const NOTES_FOLDER_PREFIX = 'equipment-cards/standard-prices/'

// 22P02：id 不是合法 UUID（invalid_text_representation），視同找不到
const INVALID_UUID_CODE = '22P02'

/**
 * best effort：清除 Cloudinary 上「已經沒有任何版本在用」的備註圖片。
 * 前端「另存為新版本」會把舊版本的備註圖片原封不動帶到新版本（同一個 public_id 被多列共用），
 * 所以刪除/修改某一版本時，不能直接刪掉它的圖片——要先確認其他版本都沒有引用才刪。
 * 必須在 DB 寫入（刪除列／更新列）完成之後呼叫。失敗不擋住主要操作，只回傳警告訊息。
 */
async function destroyUnreferencedImages(
  supabase: SupabaseClient,
  candidates: NotesImage[],
  actionLabel: string,
): Promise<string | null> {
  // 只清本功能 folder 下的圖片：public_id 由前端送來（validateRichContent 只檢查 url 前綴），
  // 不加這道限制的話，有 edit_quotes 的人可以把任意 public_id（例如料卡主照片）寫進備註再移除，
  // 藉此刪掉 Cloudinary 上不屬於標準售價的圖片。
  const ownImages = candidates.filter(
    (img) => typeof img?.public_id === 'string' && img.public_id.startsWith(NOTES_FOLDER_PREFIX),
  )
  if (ownImages.length === 0) return null

  const { data: rows, error } = await supabase
    .from('standard_price_items')
    .select('notes_image_urls')
  if (error) {
    // 查不到引用狀況就不刪（寧可留孤兒圖片，也不要誤刪其他版本還在用的圖片）
    console.error('[standard-prices/[id]] 查詢圖片引用失敗，略過 Cloudinary 清除', error)
    return `${actionLabel}，但無法確認備註圖片是否仍被其他版本使用，未清除 Cloudinary 圖片`
  }
  const stillUsed = new Set<string>()
  for (const row of rows ?? []) {
    for (const img of (row.notes_image_urls ?? []) as NotesImage[]) {
      if (img?.public_id) stillUsed.add(img.public_id)
    }
  }
  const toDestroy = Array.from(new Set(ownImages.map((img) => img.public_id)))
    .filter((id) => !stillUsed.has(id))
  if (toDestroy.length === 0) return null

  const results = await Promise.allSettled(
    toDestroy.map((publicId) => getCloudinary().uploader.destroy(publicId)),
  )
  const failedCount = results.filter((r) => r.status === 'rejected').length
  if (failedCount > 0) {
    console.error(`[standard-prices/[id]] Cloudinary 刪除失敗 ${failedCount}/${toDestroy.length} 張`, results)
    return `${actionLabel}，但有 ${failedCount} 張備註圖片未能從 Cloudinary 清除`
  }
  return null
}

// ── PATCH /api/standard-prices/[id] ───────────────────────────
// 修改該版本（部分更新：只寫入有送到的欄位）；改 name/effective_date 撞到既有版本回 409
// 權限：edit_quotes
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await checkEditQuotes()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const body = await req.json().catch(() => null)
    const validation = validateStandardPriceInput(body, { partial: true })
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: validation.status })
    }

    const supabase = getSupabase()

    // 先取既有資料：確認存在（404），並保留舊圖片清單供事後比對「被移除的圖片」
    const { data: existing, error: fetchError } = await supabase
      .from('standard_price_items')
      .select('id, notes_image_urls')
      .eq('id', params.id)
      .maybeSingle()
    if (fetchError && fetchError.code !== INVALID_UUID_CODE) throw fetchError
    if (!existing) {
      return NextResponse.json({ error: '找不到此標準售價版本' }, { status: 404 })
    }

    const { data: updated, error } = await supabase
      .from('standard_price_items')
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
        updated_by: user.email,
      })
      .eq('id', params.id)
      .select()
      .maybeSingle()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: DUPLICATE_VERSION_MESSAGE }, { status: 409 })
      }
      throw error
    }
    if (!updated) {
      // 取資料與更新之間被其他人刪掉
      return NextResponse.json({ error: '找不到此標準售價版本' }, { status: 404 })
    }

    // 有送 notes_image_urls 才比對：舊資料有、新資料沒有的圖片 → best effort 清除（仍被其他版本引用的不刪）
    let warning: string | null = null
    if (validation.data.notes_image_urls !== undefined) {
      const keptIds = new Set(((updated.notes_image_urls ?? []) as NotesImage[]).map((img) => img.public_id))
      const removed = ((existing.notes_image_urls ?? []) as NotesImage[]).filter((img) => !keptIds.has(img.public_id))
      warning = await destroyUnreferencedImages(supabase, removed, '已儲存修改')
    }

    return NextResponse.json({ item: updated, warning })
  } catch (err) {
    console.error('[standard-prices/[id]] update error', err)
    return NextResponse.json({ error: '修改標準售價失敗' }, { status: 500 })
  }
}

// ── DELETE /api/standard-prices/[id] ──────────────────────────
// 刪除該版本（只刪這一個版本，同名其他版本不受影響），並 best effort 清除 Cloudinary 備註圖片
// 權限：edit_quotes
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await checkEditQuotes()
  if (!user) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const supabase = getSupabase()

    const { data: deleted, error } = await supabase
      .from('standard_price_items')
      .delete()
      .eq('id', params.id)
      .select('id, notes_image_urls')
      .maybeSingle()

    if (error && error.code !== INVALID_UUID_CODE) throw error
    if (!deleted) {
      return NextResponse.json({ error: '找不到此標準售價版本' }, { status: 404 })
    }

    // 列已刪除，接著清圖片；Cloudinary 失敗不影響刪除結果，只回傳 warning
    const warning = await destroyUnreferencedImages(
      supabase,
      (deleted.notes_image_urls ?? []) as NotesImage[],
      '已刪除',
    )

    return NextResponse.json({ success: true, warning })
  } catch (err) {
    console.error('[standard-prices/[id]] delete error', err)
    return NextResponse.json({ error: '刪除標準售價失敗' }, { status: 500 })
  }
}
