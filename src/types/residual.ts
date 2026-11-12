// Step 53：設備殘值計算器 型別與常數（client／server 皆可 import，不含任何伺服器專用依賴）

export const RESIDUAL_VIEW_PERMISSION = 'view_residual'
export const RESIDUAL_EDIT_PERMISSION = 'edit_residual'

/** 品項。price／years 都是 null＝「報價無資料」（兩者必須同時有或同時沒有） */
export interface ResidualItem {
  id: string
  code: string          // 品號（同料卡料號），唯一
  name: string          // 品名
  price: number | null  // 金額（元）
  years: number | null  // 年限（單位：月）
  sort_order: number
  updated_at: string
  updated_by: string | null
}

/** 新增／修改／匯入時使用者能填的欄位 */
export interface ResidualItemInput {
  code: string
  name: string
  price: number | null
  years: number | null
}

export interface ResidualListResponse {
  items: ResidualItem[]
  /** 價格版本＝最後一次異動時間（ISO），由資料庫 trigger 維護；資料表尚無資料時可能為 null */
  version: string | null
}
