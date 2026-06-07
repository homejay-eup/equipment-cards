import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@supabase/supabase-js'
import { getUserRoleWithPermissions } from '@/lib/admin'
import { createSupabaseServerClient } from '@/lib/supabase-server'
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
  assignees: string[]         // email 前綴
  assignee_emails: string[]   // 完整 email（供 edit 使用）
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

async function getIssues(): Promise<Issue[]> {
  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('issues')
    .select(`
      id, title, type, priority, status, due_date, description, tags,
      created_by, created_at, updated_at,
      issue_assignees(user_email)
    `)
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[tracker] getIssues error:', error)
    return []
  }

  return (data ?? []).map((issue) => {
    const emails: string[] = (issue.issue_assignees as { user_email: string }[]).map(
      (a) => a.user_email,
    )
    return {
      ...issue,
      issue_assignees: undefined,
      assignee_emails: emails,
      assignees: emails.map((e) => e.split('@')[0]),
    }
  })
}

async function getAllowedEmails(): Promise<string[]> {
  const supabase = getServiceClient()
  const { data } = await supabase.from('allowed_emails').select('email')
  return (data ?? []).map((r: { email: string }) => r.email)
}

async function getIssueSettings(): Promise<{ issueTypes: string[]; issueTags: string[] }> {
  const supabase = getServiceClient()
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', ['issueTypes', 'issueTags'])

  const result: { issueTypes: string[]; issueTags: string[] } = {
    issueTypes: ['缺貨', '韌體', '維修', '客戶反應', '其他'],
    issueTags: [],
  }

  for (const row of data ?? []) {
    if (row.key === 'issueTypes' && Array.isArray(row.value)) {
      result.issueTypes = row.value
    }
    if (row.key === 'issueTags' && Array.isArray(row.value)) {
      result.issueTags = row.value
    }
  }

  return result
}

export default async function TrackerPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { permissions } = await getUserRoleWithPermissions()

  if (!permissions.includes('view_tracker')) {
    redirect('/')
  }

  const [issues, allowedEmails, issueSettings] = await Promise.all([
    getIssues(),
    getAllowedEmails(),
    getIssueSettings(),
  ])

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-gray-400 text-sm">
            載入中…
          </div>
        }
      >
        <TrackerClient
          initialIssues={issues}
          permissions={permissions}
          userEmail={user.email ?? ''}
          allowedEmails={allowedEmails}
          issueTypes={issueSettings.issueTypes}
          issueTags={issueSettings.issueTags}
        />
      </Suspense>
    </main>
  )
}
