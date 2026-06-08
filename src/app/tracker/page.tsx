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

  const [roleData, settings, issuesResult, usersResult] = await Promise.all([
    getUserRoleWithPermissions(),
    getSettings(),
    adminClient
      .from('issues')
      .select(`
        id, title, type, priority, status, due_date, description, tags,
        created_by, created_at, updated_at, sort_order,
        issue_assignees(user_email),
        issue_updates(id, content, created_by, created_at)
      `)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'issue_updates', ascending: false }),
    adminClient
      .from('allowed_emails')
      .select('email')
      .order('created_at', { ascending: true }),
  ])

  const { permissions } = roleData
  const userEmail = authUser?.email ?? ''

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

  const issues: Issue[] = (issuesResult.data ?? []).map((raw: RawIssue) => {
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

  const allowedEmails = (usersResult.data ?? []).map((u: { email: string }) => u.email)

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
