import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { EquipmentCard } from '@/types/equipment'
import type { BookmarkRecord } from '@/types/equipment'
import PhotoWall from '@/components/PhotoWall'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRole } from '@/lib/admin'
import { getSettings } from '@/lib/settings'

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

async function getUserBookmarks(userId: string): Promise<BookmarkRecord[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('user_bookmarks')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  return (data ?? []) as BookmarkRecord[]
}

export default async function HomePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [cards, role, settings, initialBookmarks] = await Promise.all([
    getEquipmentCards(),
    getUserRole(),
    getSettings(),
    getUserBookmarks(user.id),
  ])
  const isAdmin = role === 'admin'

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <Suspense fallback={
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          載入中…
        </div>
      }>
        <PhotoWall
          initialCards={cards}
          isAdmin={isAdmin}
          settings={settings}
          userEmail={user?.email ?? ''}
          initialBookmarks={initialBookmarks}
        />
      </Suspense>
    </main>
  )
}
