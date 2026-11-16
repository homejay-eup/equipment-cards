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
export async function getInventoryAccess(): Promise<InventoryAccess | null> {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return null
  const { roleName, permissions } = await getUserRoleWithPermissions(user.email)
  if (!permissions.includes('view_inventory')) return null
  const db = getServiceClient()
  let warehouses: Set<string> | null = null
  const { data: role } = await db.from('roles').select('id').eq('name', roleName).maybeSingle()
  if (role?.id) {
    const { data: rows } = await db.from('role_inventory_warehouses').select('warehouse').eq('role_id', role.id)
    if (rows && rows.length) warehouses = new Set(rows.map((r: { warehouse: string }) => r.warehouse))
  }
  return { email: user.email, roleName, permissions, warehouses }
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
  const rows: SummaryRow[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('inventory_summary')
      .select('product_id, category, name, warehouse, region, ok_count, bad_count').range(from, from + 999)
    if (error) throw error
    rows.push(...(data as SummaryRow[]))
    if (!data || data.length < 1000) break
  }
  // 料卡名稱（有對到料卡就用料卡名稱顯示）
  const pids = Array.from(new Set(rows.map(r => r.product_id).filter(Boolean))) as string[]
  const cardName = new Map<string, string>()
  for (let i = 0; i < pids.length; i += 300) {
    const { data } = await db.from('equipment_cards').select('equipment_id, name').in('equipment_id', pids.slice(i, i + 300))
    for (const c of data ?? []) cardName.set(c.equipment_id, c.name)
  }
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
    products: Array.from(products.values()),
    warehouses: Array.from(whs.entries()).map(([name, region]) => ({ name, region })),
  }
}

/** 盤點表「倉別」（儲位）的記憶 key：有料號用料號，沒有用「名稱:<品名>」 */
export const locKey = (p: { pid: string | null; name: string }) => p.pid ?? `名稱:${p.name}`
