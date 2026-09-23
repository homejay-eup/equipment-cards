// Step 46：標準售價（主機／設備整機銷售方案）型別
// 對應資料表 standard_price_items（見 _開發檔案/sql/step46-standard-prices.sql）。
// 同一 name 可有多個版本（effective_date 不同），「現行版本」＝同 name 中 effective_date 最大者，由前端計算。
import type { RichContentImage, RichContentTable } from '@/lib/richContentValidation'

/** 其他費用（自由列），例：{ name: '加裝4G模組', amount: 4500, unit: '台' } */
export interface StandardPriceExtraFee {
  name: string
  /** 金額可省略（只列項目名稱、價格另議） */
  amount: number | null
  /** 單位（例：台、次、月），可為空字串 */
  unit: string
}

/** 資料表一列（某產品的某一個版本） */
export interface StandardPriceItem {
  id: string
  name: string
  category: string
  plan_name: string | null
  /** YYYY-MM-DD */
  effective_date: string
  buyout_list_price: number | null
  buyout_sales_price: number | null
  buyout_manager_price: number | null
  warranty: string | null
  rent_monthly: number | null
  rent_contract: string | null
  platform_fee_buyout: number | null
  platform_fee_rent: number | null
  install_fee: number | null
  extra_fees: StandardPriceExtraFee[]
  notes: string | null
  notes_image_urls: RichContentImage[]
  notes_table_data: RichContentTable | null
  points_buyout: number | null
  points_rent: number | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

/** 數字欄位 key（空值＝null，不可為負） */
export type StandardPriceNumberField =
  | 'buyout_list_price'
  | 'buyout_sales_price'
  | 'buyout_manager_price'
  | 'rent_monthly'
  | 'platform_fee_buyout'
  | 'platform_fee_rent'
  | 'install_fee'
  | 'points_buyout'
  | 'points_rent'

/** 選填文字欄位 key（空字串＝null） */
export type StandardPriceTextField = 'plan_name' | 'warranty' | 'rent_contract'

/**
 * POST /api/standard-prices 與 PATCH /api/standard-prices/[id] 的 request body。
 * - POST：name / category / effective_date 必填，其餘選填
 * - PATCH：全部選填，只更新有送到（!== undefined）的欄位
 * 數字欄位可傳 number、數字字串或 ''/null（→ null）；effective_date 接受 YYYY-MM-DD 或 YYYY/MM/DD。
 */
export interface StandardPriceInput {
  name?: string
  category?: string
  plan_name?: string | null
  effective_date?: string
  buyout_list_price?: number | string | null
  buyout_sales_price?: number | string | null
  buyout_manager_price?: number | string | null
  warranty?: string | null
  rent_monthly?: number | string | null
  rent_contract?: string | null
  platform_fee_buyout?: number | string | null
  platform_fee_rent?: number | string | null
  install_fee?: number | string | null
  extra_fees?: StandardPriceExtraFee[]
  notes?: string | null
  notes_image_urls?: RichContentImage[]
  notes_table_data?: RichContentTable | null
  points_buyout?: number | string | null
  points_rent?: number | string | null
}

/**
 * POST /api/standard-prices/import 的單列資料（前端已把 CSV 解析成英文欄位 key，
 * extra_fees 已用 parseExtraFeesText() 轉成陣列）。不含備註圖片/表格（CSV 無此欄位，匯入時保留既有值）。
 * notes 空字串/null：新增時＝null；覆蓋既有版本時＝保留既有備註（不清空）。
 */
export type StandardPriceImportRow = Omit<StandardPriceInput, 'notes_image_urls' | 'notes_table_data'> & {
  name: string
  category: string
  effective_date: string
}

/** POST /api/standard-prices/import 成功回應 */
export interface StandardPriceImportResult {
  inserted: number
  updated: number
  items: StandardPriceItem[]
}

/** POST /api/standard-prices/import 驗證失敗（400）時的逐列錯誤；index 為 rows 陣列的 0-based 索引 */
export interface StandardPriceImportRowError {
  index: number
  message: string
}
