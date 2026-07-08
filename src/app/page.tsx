export const dynamic = 'force-dynamic'

import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { EquipmentCard } from '@/types/equipment'
import type { UserGroup } from '@/types/equipment'
import PhotoWall from '@/components/PhotoWall'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { assertStillAuthorized, getUserRoleWithPermissions } from '@/lib/admin'
import { getSettings } from '@/lib/settings'
import type { Issue } from '@/app/tracker/page'

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

async function getSubfilterConfig(): Promise<Record<string, string[]>> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  const { data } = await supabase
    .from('category_subfilter_tags')
    .select('category, tag, sort_order')
    .order('sort_order', { ascending: true })

  const result: Record<string, string[]> = {}
  for (const row of (data ?? []) as { category: string; tag: string; sort_order: number }[]) {
    if (!result[row.category]) result[row.category] = []
    result[row.category].push(row.tag)
  }
  return result
}

async function getTrackerData(userEmail: string): Promise<{
  initialIssues: Issue[]
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  userDepartmentId: string | null
}> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )

  // 第一批：平行取得當前使用者角色、全部使用者清單
  const [userRoleResult, allUsersResult] = await Promise.allSettled([
    supabase.from('allowed_emails').select('role').eq('email', userEmail).single(),
    supabase.from('allowed_emails').select('email, role').order('created_at', { ascending: true }),
  ])

  // 第二批：依使用者角色查部門
  const userRoleName = userRoleResult.status === 'fulfilled'
    ? (userRoleResult.value.data as { role: string } | null)?.role ?? null
    : null

  const roleInfoResult = userRoleName
    ? await supabase.from('roles').select('department_id').eq('name', userRoleName).single()
    : null
  const userDepartmentId = (roleInfoResult?.data as { department_id: string | null } | null)?.department_id ?? null

  if (!userDepartmentId) {
    return { initialIssues: [], allowedEmails: [], issueTypes: [], issueTags: [], userDepartmentId: null }
  }

  // 第三批：依 department_id 平行取議題 + 同部門角色名稱 + 部門任務類型
  const [issuesResult, deptRolesResult, deptIssueTypesResult] = await Promise.allSettled([
    supabase
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at, sort_order, is_pinned,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .eq('department_id', userDepartmentId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.from('roles').select('name').eq('department_id', userDepartmentId),
    supabase.from('department_issue_types').select('types, tags').eq('department_id', userDepartmentId).single(),
  ])

  const issuesData = issuesResult.status === 'fulfilled' ? (issuesResult.value.data ?? []) : []
  const initialIssues: Issue[] = issuesData.map((issue) => {
    const emails: string[] = ((issue.issue_assignees ?? []) as { user_email: string }[]).map(
      (a) => a.user_email,
    )
    return {
      ...issue,
      issue_assignees: undefined,
      assignee_emails: emails,
      assignees: emails.map((e) => e.split('@')[0]),
      sort_order: issue.sort_order ?? undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      is_pinned: (issue as any).is_pinned ?? false,
      issue_updates: (issue.issue_updates ?? []) as Issue['issue_updates'],
    }
  })

  const deptRoleNames = deptRolesResult.status === 'fulfilled'
    ? ((deptRolesResult.value.data ?? []) as { name: string }[]).map((r) => r.name)
    : []
  const allUsers = allUsersResult.status === 'fulfilled'
    ? ((allUsersResult.value.data ?? []) as { email: string; role: string }[])
    : []
  const allowedEmails = allUsers.filter((u) => deptRoleNames.includes(u.role)).map((u) => u.email)

  type DeptIssueTypes = { types: string[]; tags: string[] }
  const deptIssueTypesData = deptIssueTypesResult.status === 'fulfilled'
    ? (deptIssueTypesResult.value.data as DeptIssueTypes | null)
    : null
  const issueTypes: string[] = Array.isArray(deptIssueTypesData?.types) ? deptIssueTypesData!.types : []
  const issueTags: string[] = Array.isArray(deptIssueTypesData?.tags) ? deptIssueTypesData!.tags : []

  return { initialIssues, allowedEmails, issueTypes, issueTags, userDepartmentId }
}

export default async function HomePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')
  await assertStillAuthorized(supabase, user.email)

  const [cards, roleData, settings, initialGroups, initialBookmarkNotes, subfilterConfig] = await Promise.all([
    getEquipmentCards(),
    getUserRoleWithPermissions(),
    getSettings(),
    getUserGroups(user.id),
    getUserBookmarkNotes(user.id),
    getSubfilterConfig(),
  ])

  const { permissions, roleName } = roleData
  const isAdmin = permissions.includes('create_delete_cards') || permissions.includes('crud_cards')

  // 伺服器端依權限過濾料卡（read_active_only → 只回現役）
  const activeStatus = settings.statuses[0] ?? '現役'
  const filteredCards = permissions.includes('read_all_cards')
    ? cards
    : cards.filter(c => c.status === activeStatus)

  const hasTrackerPermission = permissions.includes('view_tracker')
  const trackerData = hasTrackerPermission ? await getTrackerData(user.email ?? '') : undefined

  return (
    <main className="min-h-screen bg-[#faf6f0]">
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
          trackerData={trackerData ?? undefined}
          subfilterConfig={subfilterConfig}
        />
      </Suspense>
    </main>
  )
}
