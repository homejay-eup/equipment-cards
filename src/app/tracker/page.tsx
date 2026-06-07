import { redirect } from 'next/navigation'

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

export default function TrackerPage() {
  redirect('/')
}
