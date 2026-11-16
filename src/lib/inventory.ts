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
