// Step 55：移交出去／待接收／持有過久（資料由庫存同步寫入 inventory_items；接收倉另存 inventory_transfer_dest）
import { getServiceClient } from '@/lib/departments'
import { canSee, tableMissing, type InventoryAccess } from '@/lib/inventory'

/** 最後操作＝這些，設備就一定是「移交中」（2026-11-17 用資料庫抽樣確認：移交／寄出 100% 在移交中） */
export const TRANSIT_OPS = ['CRM_配件移交', 'CRM_車機移交', 'APP_寄出']
/** 出貨平台轉移：多數在移交中（抽樣 11/12），但有少數已被接收；只有接收倉表裡也有它才算移交中 */
export const TRANSIT_OPS_MAYBE = ['CRM_出貨平台轉移']

export const IDLE_DAYS = 30

export interface TransferItem {
  barcode: string; from: string; to: string | null; category: string | null; name: string
  product_id: string | null; at: string | null; op: string | null; who: string | null
}

interface Raw {
  barcode: string | null; warehouse: string; region: string | null; category: string | null; name: string
  product_id: string | null; crm_updated: string | null; op: string | null; who: string | null
}
const COLS = 'barcode, warehouse, region, category, name, product_id, crm_updated, op, who'

async function pageAll<T>(fetchPage: (from: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>): Promise<T[]> {
  // 每輪同時抓 4 頁（呼叫端的排序是穩定的，頁與頁接得起來），不足一頁就停：比一頁一頁等快很多
  const out: T[] = []
  for (let from = 0; ; from += 4000) {
    const chunk = await Promise.all([0, 1, 2, 3].map(i => fetchPage(from + i * 1000)))
    for (const { data, error } of chunk) { if (error) throw error; out.push(...(data ?? [])) }
    if ((chunk[3].data?.length ?? 0) < 1000) break
  }
  return out
}

const toItem = (r: Raw, to: string | null): TransferItem => ({
  barcode: r.barcode ?? '', from: r.warehouse, to, category: r.category, name: r.name,
  product_id: r.product_id, at: r.crm_updated, op: r.op, who: r.who,
})

/** 移交中的設備（含接收倉；接收倉可能是 null＝資料庫前一日備份裡還沒有這顆）。只回傳角色看得到的（送出倉或接收倉任一在範圍內） */
export async function loadTransit(access: InventoryAccess) {
  const db = getServiceClient()
  const ops = [...TRANSIT_OPS, ...TRANSIT_OPS_MAYBE]
  const rawP = pageAll<Raw>(from => db.from('inventory_current_items').select(COLS).in('op', ops).order('barcode').range(from, from + 999))
  // 接收倉表還沒建／還沒載入時照樣能用（接收倉顯示「未知」）
  const destP = pageAll<{ barcode: string; dest_warehouse: string; source_date: string; loaded_at: string | null }>(
    from => db.from('inventory_transfer_dest').select('barcode, dest_warehouse, source_date, loaded_at').order('barcode').range(from, from + 999))
    .catch((e: { code?: string }) => { if (tableMissing(e.code)) return []; throw e })
  const [raw, destRows] = await Promise.all([rawP, destP])
  const dest = new Map(destRows.map(d => [d.barcode, d]))
  const destAsOf = destRows.reduce<string | null>((m, d) => (!m || d.source_date > m ? d.source_date : m), null)
  const destAt = destRows.reduce<string | null>((m, d) => (d.loaded_at && (!m || d.loaded_at > m) ? d.loaded_at : m), null)   // 接收倉資料最後寫入時間（備份載入或畫面補查）
  const items: TransferItem[] = []
  for (const r of raw) {
    const d = r.barcode ? dest.get(r.barcode) : undefined
    if (TRANSIT_OPS_MAYBE.includes(r.op ?? '') && !d) continue
    // 接收倉資料日（備份日／補查日）早於這顆最後一次移交的日期＝那筆接收倉是上一次移交的，已過期 → 當作「接收倉未同步」，不顯示可能是錯的接收倉（2026-11-19 對資料庫實測有 214 顆）
    const stale = !!d && !!r.crm_updated && r.crm_updated.slice(0, 10) > d.source_date
    const to = d && !stale ? d.dest_warehouse : null
    if (!canSee(access, r.warehouse) && !(to && canSee(access, to))) continue
    items.push(toItem(r, to))
  }
  return { items, destAsOf, destAt }
}

/** 技師手上超過 30 天沒有任何異動的設備 */
export async function loadIdle(access: InventoryAccess) {
  const db = getServiceClient()
  const cutoff = new Date(Date.now() + 8 * 3600_000 - IDLE_DAYS * 86400_000).toISOString().slice(0, 19).replace('T', ' ')
  const raw = await pageAll<Raw>(from => db.from('inventory_current_items').select(COLS)
    .like('region', '%技師%').lt('crm_updated', cutoff).order('barcode').range(from, from + 999))
  return { items: raw.filter(r => canSee(access, r.warehouse)).map(r => toItem(r, null)) }
}
