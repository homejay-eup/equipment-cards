// Step 38：維修資訊管理 型別定義

export type MaintenanceRuleType = '送修規則' | '保固說明' | '報廢條件' | '其他'

export const MAINTENANCE_RULE_TYPES: MaintenanceRuleType[] = ['送修規則', '保固說明', '報廢條件', '其他']

export interface MaintenanceVendor {
  id: string
  vendor_code: string | null
  name: string
  address: string | null
  contact_name: string | null
  contact_phone: string | null
  sort_order: number
  created_at: string
  updated_at: string
  // 以下由 GET /api/maintenance/vendors 額外計算，非 DB 欄位
  equipment_count?: number
  rule_count?: number
  needs_review_count?: number
}

export interface MaintenanceRuleEquipmentRef {
  equipment_id: string
  name: string
}

export interface MaintenanceRule {
  id: string
  vendor_id: string
  item: string
  rule_type: MaintenanceRuleType
  content: string
  warranty_start_date: string | null
  warranty_period_months: number | null
  last_updated_at: string
  last_updated_by: string | null
  confirmed_at: string | null
  confirmed_by: string | null
  sort_order: number
  created_at: string
  // 由 API JOIN 填入
  equipment_ids?: MaintenanceRuleEquipmentRef[]
  // 由 API 計算：last_updated_at 與 confirmed_at 取較新者，超過 6 個月未更新/未確認
  needs_review?: boolean
}
