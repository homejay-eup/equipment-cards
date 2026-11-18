// Step 54：CRM 庫存（資料由公司電腦的同步程式寫入 Supabase；網站只讀與送刷新請求）
// 所有庫存表都開 RLS、不開 policy → 一律經 API Route 用 service_role 存取，權限在這裡把關。
import { NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/departments'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'

export const BATCH_LABELS: Record<string, string> = {
  'company-main': '公司-總倉',
  'company-rest': '公司-其餘',
  'tech-north': '北區技師',
  'tech-hsinchu': '竹區技師',
  'tech-central': '中區技師',
  'tech-south': '南區技師',
  repair: '送修',
}
export const ALL_BATCHES = Object.keys(BATCH_LABELS)

export interface InventoryAccess {
  email: string
  roleName: string
  permissions: string[]
  /** null＝角色沒設倉庫範圍＝全部可看（仍需 view_inventory） */
  warehouses: Set<string> | null
}

const TABLE_MISSING = new Set(['PGRST205', '42P01'])
export function tableMissing(code?: string) {
  return !!code && TABLE_MISSING.has(code)
}
export const MISSING_MSG = '資料表尚未建立，請先執行 _開發檔案/sql/step54-crm-inventory.sql'

/** 取得目前使用者的庫存權限；沒有 view_inventory 回傳 null */
// 權限／倉庫範圍短暫記憶 30 秒（每個 API 呼叫都要查，進度輪詢每 1.5 秒一次，不記的話每次都連跑好幾趟資料庫）。
// 身分驗證（auth.getUser）每次都照做；改了角色權限最多 30 秒後生效。
const ACCESS_TTL = 30_000
const accessCache = new Map<string, { at: number; v: Omit<InventoryAccess, 'email'> | null }>()

export function clearInventoryAccessCache() { accessCache.clear() }

export async function getInventoryAccess(): Promise<InventoryAccess | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const email = user.email
  const hit = accessCache.get(email)
  if (hit && Date.now() - hit.at < ACCESS_TTL) return hit.v ? { email, ...hit.v } : null
  const { roleName, permissions } = await getUserRoleWithPermissions(email)
  if (!permissions.includes('view_inventory')) { accessCache.set(email, { at: Date.now(), v: null }); return null }
  const db = getServiceClient()
  let warehouses: Set<string> | null = null
  const { data: role } = await db.from('roles').select('id').eq('name', roleName).maybeSingle()
  if (role?.id) {
    const { data: rows } = await db.from('role_inventory_warehouses').select('warehouse').eq('role_id', role.id)
    if (rows && rows.length) warehouses = new Set(rows.map((r: { warehouse: string }) => r.warehouse))
  }
  const v = { roleName, permissions, warehouses }
  accessCache.set(email, { at: Date.now(), v })
  return { email, ...v }
}

export function canSee(access: InventoryAccess, warehouse: string) {
  return !access.warehouses || access.warehouses.has(warehouse)
}

export const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 })

export interface InvProductRow {
  key: string; pid: string | null; name: string; crmNames: string[]; type: string; onCard: boolean
  cells: Record<string, [number, number]>
}
interface SummaryRow {
  product_id: string | null; category: string | null; name: string; warehouse: string; region: string | null
  ok_count: number; bad_count: number
}

/** 產品 × 倉庫 數量（只含角色看得到的倉）；庫存頁與盤點表共用。錯誤會丟出 { code, message } */
export async function loadProducts(access: InventoryAccess) {
  const db = getServiceClient()
  const T0 = Date.now(); const timing: Record<string, number> = {}   // 分段計時（回應標頭 Server-Timing 看得到）
  const SEL = 'product_id, category, name, warehouse, region, ok_count, bad_count'
  // 彙總來源：預先算好的快取表（inventory_summary_cache，Step 56）只要「是以目前生效資料算的」就用它（快）；
  // 沒建、沒更新到、或比目前生效資料舊 → 一律改讀原本的檢視 inventory_summary（慢一點，但一定是最新）。
  let packed: SummaryRow[] | null = null   // 整份彙總打包成一筆（Step 57）：一次來回就拿完
  const useCache = await (async () => {
    try {
      const [{ data: meta, error: e1 }, { data: cur, error: e2 }] = await Promise.all([
        db.from('inventory_summary_meta').select('src_updated_at, payload').eq('id', 1).maybeSingle(),
        db.from('inventory_batch_current').select('updated_at').order('updated_at', { ascending: false }).limit(1),
      ])
      if (e1 || e2 || !meta?.src_updated_at || !cur?.[0]?.updated_at) return false
      const fresh = new Date(meta.src_updated_at).getTime() >= new Date(cur[0].updated_at).getTime()
      if (fresh && Array.isArray(meta.payload)) {
        packed = (meta.payload as unknown[][]).map(a => ({ product_id: a[0] as string | null, category: a[1] as string | null, name: a[2] as string, warehouse: a[3] as string, region: a[4] as string | null, ok_count: Number(a[5]), bad_count: Number(a[6]) }))
      }
      return fresh
    } catch { return false }
  })()
  timing.cacheCheck = Date.now() - T0; timing.useCache = useCache ? (packed ? 2 : 1) : 0
  const page = async (from: number) => {
    // 分頁一定要有穩定排序，否則每頁之間順序可能不同，會重複或漏列
    const q = useCache
      ? db.from('inventory_summary_cache').select(SEL).order('id')
      : db.from('inventory_summary').select(SEL).order('product_id', { nullsFirst: true }).order('category').order('name').order('warehouse').order('region').order('batch_key')
    const { data, error } = await q.range(from, from + 999)
    if (error) throw error
    return (data ?? []) as SummaryRow[]
  }
  // 料卡名稱（有對到料卡就用料卡名稱顯示）：一次全抓，跟庫存彙總同時進行
  const cardsP = (async () => {
    const m = new Map<string, string>()
    // 每輪同時抓 4 頁（穩定排序，頁與頁接得起來），不足一頁就停
    for (let from = 0; ; from += 4000) {
      const chunk = await Promise.all([0, 1, 2, 3].map(i => db.from('equipment_cards').select('equipment_id, name').order('equipment_id').range(from + i * 1000, from + i * 1000 + 999)))
      for (const { data } of chunk) for (const c of data ?? []) m.set(c.equipment_id, c.name)
      if ((chunk[3].data?.length ?? 0) < 1000) break
    }
    return m
  })()
  // 庫存彙總分頁：先抓第一頁，滿頁就一次並行抓後面幾頁（每輪 4 頁，不足一頁就停）
  const rows: SummaryRow[] = packed ?? await page(0)
  for (let from = 1000; !packed && rows.length >= from; from += 4000) {
    const chunk = await Promise.all([0, 1, 2, 3].map(i => page(from + i * 1000)))
    for (const c of chunk) rows.push(...c)
    if (chunk[3].length < 1000) break
  }
  timing.summary = Date.now() - T0
  const cardName = await cardsP
  timing.cards = Date.now() - T0
  const products = new Map<string, InvProductRow>()
  const whs = new Map<string, string>()   // 倉 → 區域
  for (const r of rows) {
    if (!canSee(access, r.warehouse)) continue
    whs.set(r.warehouse, r.region ?? '')
    const type = r.category || '其他'
    const key = r.product_id ? r.product_id : `name:${type}|${r.name}`
    let p = products.get(key)
    if (!p) {
      const onCard = !!(r.product_id && cardName.has(r.product_id))
      p = { key, pid: r.product_id, name: onCard ? cardName.get(r.product_id!)! : (r.name || type), crmNames: [], type, onCard, cells: {} }
      products.set(key, p)
    }
    if (r.name && !p.crmNames.includes(r.name)) p.crmNames.push(r.name)
    const c = p.cells[r.warehouse] ?? [0, 0]
    p.cells[r.warehouse] = [c[0] + Number(r.ok_count), c[1] + Number(r.bad_count)]
  }
  return {
    timing,
    products: Array.from(products.values()),
    warehouses: Array.from(whs.entries()).map(([name, region]) => ({ name, region })),
  }
}

/** 盤點表「倉別」（儲位）的記憶 key：有料號用料號，沒有用「名稱:<品名>」 */
export const locKey = (p: { pid: string | null; name: string }) => p.pid ?? `名稱:${p.name}`
