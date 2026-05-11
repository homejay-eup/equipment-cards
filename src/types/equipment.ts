export interface DetailPhoto {
  public_id: string
  url: string
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
  is_new: boolean
  created_at: string
  updated_at: string
}

export interface AppSettings {
  categories: string[]
  statuses: string[]  // 第一個為預設「現役」狀態
}

export const DEFAULT_SETTINGS: AppSettings = {
  categories: ['主機', '鏡頭', '螢幕', '天線', '儲存媒體', '線材', '配件', '耗材', '工具', '國外設備'],
  statuses: ['現役', '停產'],
}
