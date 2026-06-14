import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { createClient } from '@supabase/supabase-js'
import { requirePermission, getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
import { getSettings } from '@/lib/settings'
import TrackerClient from './TrackerClient'

export interface Issue {
  id: string
  title: string
  type: string
  priority: 'high' | 'medium' | 'low'
  status: string
  due_date: string | null
  description: string | null
  tags: string[]
  created_by: string
  created_at: string
  updated_at: string
  sort_order?: number
  assignees: string[]         // email 前綴（顯示用）
  assignee_emails: string[]   // 完整 email（篩選用）
  issue_updates?: IssueUpdate[]
}

export interface IssueUpdate {
  id: string
  issue_id?: string
  content: string
  created_by: string
  created_at: string
}

function getServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

export default async function TrackerPage() {
  const user = await requirePermission('view_tracker')
  if (!user) redirect('/')

  const supabase = createSupabaseServerClient()
  const { data: { user: authUser } } = await supabase.auth.getUser()

  const adminClient = getServiceClient()
  const userEmail = authUser?.email ?? ''

  // 第一批：平行取得角色資料、設定、使用者清單
  const [roleData, settings, userRoleResult, usersResult] = await Promise.all([
    getUserRoleWithPermissions(),
    getSettings(),
    userEmail
      ? adminClient.from('allowed_emails').select('role').eq('email', userEmail).single()
      : Promise.resolve({ data: null }),
    adminClient
      .from('allowed_emails')
      .select('email, role')
      .order('created_at', { ascending: true }),
  ])

  const { permissions } = roleData
  const userRoleName = (userRoleResult as { data: { role: string } | null }).data?.role ?? null

  // 第二批：依 role 名稱查 department_id
  const roleInfoResult = userRoleName
    ? await adminClient
        .from('roles')
        .select('department_id')
        .eq('name', userRoleName)
        .single()
    : { data: null }

  type RoleInfo = { department_id: string | null }
  const roleInfoData = (roleInfoResult as { data: RoleInfo | null }).data
  const userDepartmentId = roleInfoData?.department_id ?? null

  // 第三批：依 department_id 篩選 issues
  // 所有角色（含管理員）一律只看自己部門的議題
  // department_id === null → 回空清單（無部門歸屬）
  type RawIssue = {
    id: string
    title: string
    type: string
    priority: 'high' | 'medium' | 'low'
    status: string
    due_date: string | null
    description: string | null
    tags: string[]
    created_by: string
    created_at: string
    updated_at: string
    sort_order: number | null
    issue_assignees: { user_email: string }[]
    issue_updates: { id: string; content: string; created_by: string; created_at: string }[]
  }

  const issueSelectQuery = `
    id, title, type, priority, status, due_date, description, tags,
    created_by, created_at, updated_at, sort_order,
    issue_assignees(user_email),
    issue_updates(id, content, created_by, created_at)
  `

  let rawIssues: RawIssue[] = []
  let deptRoleNames: string[] | null = null
  if (userDepartmentId !== null) {
    // 平行：議題查詢 + 同部門角色名稱（供 allowedEmails 部門過濾）
    const [issuesResult, deptRolesResult] = await Promise.all([
      adminClient
        .from('issues')
        .select(issueSelectQuery)
        .eq('department_id', userDepartmentId)
        .order('sort_order', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'issue_updates', ascending: false }),
      adminClient
        .from('roles')
        .select('name')
        .eq('department_id', userDepartmentId),
    ])
    rawIssues = (issuesResult.data ?? []) as RawIssue[]
    deptRoleNames = (deptRolesResult.data ?? []).map((r: { name: string }) => r.name)
  }
  // userDepartmentId === null → rawIssues = []（無部門歸屬，不可見）

  const issues: Issue[] = rawIssues.map((raw: RawIssue) => {
    const emails = (raw.issue_assignees ?? []).map((a) => a.user_email)
    return {
      id: raw.id,
      title: raw.title,
      type: raw.type,
      priority: raw.priority,
      status: raw.status,
      due_date: raw.due_date,
      description: raw.description,
      tags: raw.tags ?? [],
      created_by: raw.created_by,
      created_at: raw.created_at,
      updated_at: raw.updated_at,
      sort_order: raw.sort_order ?? undefined,
      assignees: emails.map((e) => e.split('@')[0]),
      assignee_emails: emails,
      issue_updates: (raw.issue_updates ?? []) as IssueUpdate[],
    }
  })

  const rawUsers = (usersResult.data ?? []) as { email: string; role: string }[]
  const filteredUsers = deptRoleNames && deptRoleNames.length > 0
    ? rawUsers.filter((u) => deptRoleNames!.includes(u.role))
    : rawUsers
  const allowedEmails = filteredUsers.map((u) => u.email)

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <Suspense>
        <TrackerClient
          initialIssues={issues}
          permissions={permissions}
          userEmail={userEmail}
          allowedEmails={allowedEmails}
          issueTypes={settings.issueTypes ?? []}
          issueTags={settings.issueTags ?? []}
        />
      </Suspense>
    </main>
  )
}
