import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { EquipmentCard } from '@/types/equipment'
import type { UserGroup } from '@/types/equipment'
import PhotoWall from '@/components/PhotoWall'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import TrackerBanner from '@/components/TrackerBanner'

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

async function getUserBookmarkNotes(userId: string): Promise<Record<string, string>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  const { data } = await supabase
    .from('user_bookmarks')
    .select('equipment_id, notes')
    .eq('user_id', userId)
    .not('notes', 'is', null)
  const result: Record<string, string> = {}
  ;(data ?? []).forEach((b: { equipment_id: string; notes: string | null }) => {
    if (b.notes) result[b.equipment_id] = b.notes
  })
  return result
}

async function getUserGroups(userId: string): Promise<UserGroup[]> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  let { data: groups } = await supabase
    .from('user_groups')
    .select('*, group_items(equipment_id, added_at)')
    .eq('user_id', userId)
    .order('is_default', { ascending: false })
    .order('sort_order')

  // 懶遷移：若完全沒有群組，從 user_bookmarks 建立預設群組並遷移
  if (!groups || groups.length === 0) {
    const { data: bookmarks } = await supabase
      .from('user_bookmarks')
      .select('equipment_id, created_at')
      .eq('user_id', userId)

    const { data: newGroup } = await supabase
      .from('user_groups')
      .insert({ user_id: userId, name: '我的關注', is_default: true })
      .select()
      .single()

    if (newGroup && bookmarks && bookmarks.length > 0) {
      await supabase.from('group_items').insert(
        bookmarks.map((b: { equipment_id: string; created_at: string }) => ({
          group_id: newGroup.id,
          equipment_id: b.equipment_id,
          added_at: b.created_at,
        }))
      )
    }

    const { data: fresh } = await supabase
      .from('user_groups')
      .select('*, group_items(equipment_id, added_at)')
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .order('sort_order')
    groups = fresh
  }

  return (groups ?? []) as UserGroup[]
}

async function getMyPendingIssueCount(userEmail: string): Promise<number> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data } = await supabase
      .from('issue_assignees')
      .select('issue_id, issues!inner(status)')
      .eq('user_email', userEmail)
    if (!data) return 0
    return (data as unknown as { issues: { status: string }[] }[]).filter(
      (r) => (r.issues ?? []).some((i) => i.status !== '已完成'),
    ).length
  } catch {
    return 0
  }
}

export default async function HomePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const [cards, roleData, settings, initialGroups, initialBookmarkNotes] = await Promise.all([
    getEquipmentCards(),
    getUserRoleWithPermissions(),
    getSettings(),
    getUserGroups(user.id),
    getUserBookmarkNotes(user.id),
  ])

  const { permissions, roleName } = roleData
  const isAdmin = permissions.includes('add_delete_cards') || permissions.includes('edit_cards')

  // 伺服器端依權限過濾料卡（read_active_only → 只回現役）
  const activeStatus = settings.statuses[0] ?? '現役'
  const filteredCards = permissions.includes('read_all_cards')
    ? cards
    : cards.filter(c => c.status === activeStatus)

  // 取得待處理議題數（僅 show_login_banner 權限者需要）
  const showBanner = permissions.includes('show_login_banner')
  const pendingCount = showBanner ? await getMyPendingIssueCount(user.email ?? '') : 0

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      {showBanner && pendingCount > 0 && (
        <TrackerBanner pendingCount={pendingCount} />
      )}
      <Suspense fallback={
        <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
          載入中…
        </div>
      }>
        <PhotoWall
          initialCards={filteredCards}
          isAdmin={isAdmin}
          settings={settings}
          userEmail={user?.email ?? ''}
          initialGroups={initialGroups}
          initialBookmarkNotes={initialBookmarkNotes}
          permissions={permissions}
          userRole={roleName}
        />
      </Suspense>
    </main>
  )
}
