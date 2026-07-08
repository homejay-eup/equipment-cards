import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

// 與 src/types/equipment.ts 的 Document 型別保持一致（該檔案禁止觸碰，故這裡另外宣告同形狀）
export interface DocumentCacheEntry {
  name: string
  url: string
  type: string
}

/**
 * 重算並寫回單一料卡的 equipment_cards.documents 快取欄位。
 *
 * equipment_cards.documents 現在的角色是「唯讀快取」，真正的資料來源是
 * documents 主檔 + card_documents 對照表。任何會改變某張卡片文件關聯的操作
 * （新增上傳、掛載既有文件、解除關聯）之後都必須呼叫這個函式，讓快取跟資料來源同步，
 * 這樣既有讀取端（CardDetailDialog.tsx / PhotoWall.tsx / GET /api/cards）才不用改。
 *
 * 例外：PATCH /api/documents/[id]（更新文件版本）不需要呼叫——因為只是覆蓋
 * 同一個 drive_file_id 的內容，url 不變，快取內容不需要變動。
 */
export async function recomputeCardDocumentsCache(equipmentId: string): Promise<void> {
  const supabase = getSupabase()

  const { data, error } = await supabase
    .from('card_documents')
    .select('documents(name, url, type)')
    .eq('equipment_id', equipmentId)

  if (error) throw error

  type JoinedRow = { documents: DocumentCacheEntry | DocumentCacheEntry[] | null }

  const cache: DocumentCacheEntry[] = ((data ?? []) as JoinedRow[])
    .flatMap((row) => {
      const doc = row.documents
      if (!doc) return []
      return Array.isArray(doc) ? doc : [doc]
    })
    .map(({ name, url, type }) => ({ name, url, type }))

  const { error: updateError } = await supabase
    .from('equipment_cards')
    .update({ documents: cache })
    .eq('equipment_id', equipmentId)

  if (updateError) throw updateError
}
