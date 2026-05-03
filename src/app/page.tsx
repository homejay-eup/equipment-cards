import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { EquipmentCard } from '@/types/equipment'
import PhotoWall from '@/components/PhotoWall'

async function getEquipmentCards(): Promise<EquipmentCard[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data, error } = await supabase
    .from('equipment_cards')
    .select('*')
    .order('equipment_id')

  if (error) {
    console.error('Supabase error:', error)
    return []
  }
  return data ?? []
}

export default async function HomePage() {
  const cards = await getEquipmentCards()

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">設備料卡管理系統</h1>
            <p className="text-sm text-gray-500 mt-0.5">共 {cards.length} 筆料卡</p>
          </div>
        </div>
      </header>

      {/* useSearchParams() 需要 Suspense 包裝 */}
      <Suspense fallback={
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          載入中…
        </div>
      }>
        <PhotoWall initialCards={cards} />
      </Suspense>
    </main>
  )
}
