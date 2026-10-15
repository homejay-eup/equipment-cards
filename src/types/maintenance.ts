// Step 38：維修資訊管理 型別定義

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

// Step 49：流程區塊（常數見 src/lib/maintenanceFormat.ts 的 MAINTENANCE_STAGES）
export type MaintenanceStage = '回廠' | '檢測' | '送修' | '報廢' | '待歸類'

export type MaintenanceSubCategory = '特殊情境' | '年限判斷' | '是否檢測' | '廠商送修' | '報廢規則'

export interface MaintenanceExitOption {
  id: string
  label: string
  sort_order: number
}

export interface MaintenanceRule {
  id: string
  vendor_id: string | null
  item: string
  // Step 49 起為棄用欄位（新規則為 null，舊資料保留供遷移回溯），新 UI 不讀寫
  rule_type?: string | null
  stage: MaintenanceStage
  sub_category: MaintenanceSubCategory | null
  exit_option: string | null
  age_limit_months: number | null
  age_limit_basis: string | null
  // 由 GET /api/maintenance/rules 未帶 vendor_id 時填入
  vendor_name?: string | null
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
