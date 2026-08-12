export interface BookmarkRecord {
  id: string
  equipment_id: string
  notes: string | null
  created_at: string
}

export interface Document {
  name: string
  url: string
  type: string  // 改為 string（原本是 'spec' | 'contract' | 'other'）
}

export interface DetailPhoto {
  public_id: string
  url: string
  caption?: string
}

export interface EquipmentCard {
  equipment_id: string
  name: string
  category: string | null
  vendor: string | null
  status: string
  tags: string[]
  notes: string | null
  main_photo: string | null
  main_photo_public_id: string | null
  detail_photos: DetailPhoto[]
  net_weight: number | null
  weight_photos: DetailPhoto[] | null  // 多張淨重照片；SQL migration 執行前舊資料為 null，程式碼一律用 `?? []`
  weight_photo: string | null         // 保留：DB 舊欄位向下相容
  weight_photo_public_id: string | null  // 保留：DB 舊欄位向下相容
  documents: Document[]
  is_new: boolean
  created_at: string
  updated_at: string
  updated_by: string | null
  updated_fields?: string[] | null
}

export interface AppSettings {
  categories: string[]
  statuses: string[]        // 第一個為預設「現役」狀態
  documentTypes: string[]   // 文件連結類型清單
  issueTypes: string[]      // 追蹤板議題類型
  issueTags: string[]       // 追蹤板議題標籤
  quoteCategories: string[] // 報價查詢分類清單
}

export const DEFAULT_SETTINGS: AppSettings = {
  categories: ['主機', '鏡頭', '螢幕', '天線', '儲存媒體', '線材', '配件', '耗材', '工具', '國外設備'],
  statuses: ['現役', '停產'],
  documentTypes: ['規格書', '合約書', '其他'],
  issueTypes: ['設備異常', '維修需求', '庫存問題', '其他'],
  issueTags: [],
  quoteCategories: ['影像配件', '溫控配件', '純定位配件', '數位大餅配件', '環保車機配件', '整新費用', '其他配件'],
}

export interface QuoteItem {
  id: string
  category: string
  name: string
  standard_price: number
  manager_price: number | null
  sort_order: number | null
  created_at: string
  updated_at: string
  updated_by: string | null
}

export interface GroupItem {
  equipment_id: string
  added_at: string
  quantity: number
  sort_order: number
}

export interface UserGroup {
  id: string
  name: string
  is_default: boolean
  sort_order: number
  created_at: string
  updated_at?: string  // Step 34：供「設備套餐」來源對齊機制比對，SQL migration 執行前可能為 undefined
  group_items: GroupItem[]
}

export interface Role {
  id: string
  name: string
  is_system: boolean
  created_at: string
  permissions: string[]  // 由 API JOIN 填入
}
