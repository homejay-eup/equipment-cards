export interface DetailPhoto {
  public_id: string
  url: string
}

export interface EquipmentCard {
  equipment_id: string
  name: string
  category: string | null
  vendor: string | null
  status: 'active' | 'discontinued'
  tags: string[]
  notes: string | null
  main_photo: string | null
  main_photo_public_id: string | null
  detail_photos: DetailPhoto[]
  created_at: string
  updated_at: string
}
