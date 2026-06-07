'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, AlertCircle, ChevronDown } from 'lucide-react'
import type { Issue } from './page'
import IssueExpandedContent from '@/components/IssueExpandedContent'
import NewIssueDialog from '@/components/NewIssueDialog'

interface Props {
  initialIssues: Issue[]
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onMyTasksCountChange?: (count: number) => void
}

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-[#ef4444]',
  medium: 'bg-[#eab308]',
  low:    'bg-[#22c55e]',
}

const PRIORITY_LABEL: Record<string, string> = {
  high:   '緊急',
  medium: '重要',
  low:    '普通',
}

const STATUS_BADGE: Record<string, string> = {
  '待處理': 'bg-gray-100 text-gray-600 border-gray-200',
  '進行中': 'bg-blue-50 text-blue-700 border-blue-200',
  '等待中': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '已完成': 'bg-green-50 text-green-700 border-green-200',
}

function formatDatetime(dateStr: string): string {
  const d = new Date(dateStr)
  const y = d.getFullYear()
  const mo = d.getMonth() + 1
  const day = d.getDate()
  const h = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${y}/${mo}/${day} ${h}:${mi}`
}

export default function TrackerClient({
  initialIssues,
  permissions,
  userEmail,
  allowedEmails,
  issueTypes,
  issueTags,
  onMyTasksCountChange,
}: Props) {
  const searchParams = useSearchParams()

  const canCreateIssues = permissions.includes('create_issues')
  const canViewMyTasks = permissions.includes('view_my_tasks')

  const [issues, setIssues] = useState<Issue[]>(initialIssues)
  const [activeTab, setActiveTab] = useState<'all' | 'my'>(() => {
    return searchParams.get('tab') === 'my' ? 'my' : 'all'
  })
  const [filterType, setFilterType] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [newIssueOpen, setNewIssueOpen] = useState(false)

  const filteredIssues = useMemo(() => {
    let list = issues

    if (activeTab === 'my') {
      list = list.filter((i) => i.assignee_emails.includes(userEmail))
    }

    if (filterType) list = list.filter((i) => i.type === filterType)
    if (filterStatus) list = list.filter((i) => i.status === filterStatus)
    if (filterPriority) list = list.filter((i) => i.priority === filterPriority)

    return list
  }, [issues, activeTab, filterType, filterStatus, filterPriority, userEmail])

  const myPendingCount = useMemo(() => {
    return issues.filter(
      (i) => i.status !== '已完成' && i.assignee_emails.includes(userEmail),
    ).length
  }, [issues, userEmail])

  useEffect(() => {
    onMyTasksCountChange?.(myPendingCount)
  }, [myPendingCount, onMyTasksCountChange])

  const handleIssueCreated = useCallback((newIssue: Issue) => {
    setIssues((prev) => [newIssue, ...prev])
    setNewIssueOpen(false)
  }, [])

  const handleIssueUpdated = useCallback((updatedIssue: Issue) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === updatedIssue.id ? updatedIssue : i)),
    )
  }, [])

  const handleIssueDeleted = useCallback((issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId))
    setExpandedId(null)
  }, [])

  const allStatuses = ['待處理', '進行中', '等待中', '已完成']

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
      {/* 篩選列 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        {/* Tab */}
        <div className="flex items-center gap-1 bg-white border border-[rgba(122,82,48,.15)] rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setActiveTab('all')}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              activeTab === 'all'
                ? 'bg-[#7a5230] text-white font-medium'
                : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
            }`}
          >
            全部
          </button>
          {canViewMyTasks && (
            <button
              onClick={() => setActiveTab('my')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                activeTab === 'my'
                  ? 'bg-[#7a5230] text-white font-medium'
                  : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
              }`}
            >
              我的任務
              {canViewMyTasks && myPendingCount > 0 && (
                <span
                  className={`px-1.5 py-0.5 text-xs rounded-full font-semibold ${
                    activeTab === 'my'
                      ? 'bg-white/20 text-white'
                      : 'bg-[#7a5230] text-white'
                  }`}
                >
                  {myPendingCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 篩選下拉 */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-sm border border-[rgba(122,82,48,.2)] rounded-lg px-2.5 py-1.5 bg-white text-[#4a3422] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
          >
            <option value="">類型：全部</option>
            {issueTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="text-sm border border-[rgba(122,82,48,.2)] rounded-lg px-2.5 py-1.5 bg-white text-[#4a3422] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
          >
            <option value="">狀態：全部</option>
            {allStatuses.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            value={filterPriority}
            onChange={(e) => setFilterPriority(e.target.value)}
            className="text-sm border border-[rgba(122,82,48,.2)] rounded-lg px-2.5 py-1.5 bg-white text-[#4a3422] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
          >
            <option value="">優先度：全部</option>
            <option value="high">緊急</option>
            <option value="medium">重要</option>
            <option value="low">普通</option>
          </select>
        </div>

        {/* 新增議題 */}
        {canCreateIssues && (
          <button
            onClick={() => setNewIssueOpen(true)}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.25)] whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            新增議題
          </button>
        )}
      </div>

      {/* 議題清單 */}
      <div className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden">
        {filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#a08060]">
            <AlertCircle className="h-8 w-8 mb-2 opacity-40" />
            <p className="text-sm">
              {activeTab === 'my' ? '目前沒有指派給你的議題' : '目前沒有符合條件的議題'}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[rgba(122,82,48,.08)]">
            {filteredIssues.map((issue) => {
              const isExpanded = expandedId === issue.id
              return (
                <li key={issue.id}>
                  {/* 摺疊標題列 */}
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : issue.id)}
                    className="w-full text-left px-4 py-3 hover:bg-[rgba(122,82,48,.04)] transition-colors flex flex-col gap-1.5"
                  >
                    {/* 第一行：優先度・類型・標題・狀態・展開箭頭 */}
                    <div className="flex items-start gap-2.5">
                      <span
                        className={`shrink-0 mt-1.5 w-2.5 h-2.5 rounded-full ${
                          PRIORITY_DOT[issue.priority] ?? 'bg-gray-300'
                        }`}
                        title={PRIORITY_LABEL[issue.priority]}
                      />
                      <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.18)] self-start">
                        {issue.type}
                      </span>
                      <span className="flex-1 min-w-0 text-sm text-[#2c1e12] break-words">
                        {issue.title}
                      </span>
                      <span
                        className={`shrink-0 text-[11px] font-medium px-2 py-0.5 rounded-full border ${
                          STATUS_BADGE[issue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                        }`}
                      >
                        {issue.status}
                      </span>
                      <ChevronDown
                        className={`shrink-0 h-4 w-4 text-[#a08060] transition-transform duration-200 mt-0.5 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>

                    {/* 第二行：日期・負責人・更新時間 */}
                    <div className="flex items-center gap-3 pl-[26px] text-xs text-[#a08060] flex-wrap">
                      <span className="shrink-0">
                        {issue.due_date ? issue.due_date.slice(5, 10).replace('-', '/') : '—'}
                      </span>
                      {issue.assignees.length > 0 && (
                        <span className="flex flex-wrap gap-x-1 gap-y-0.5">
                          {issue.assignees.map((a, i) => (
                            <span key={a} className="whitespace-nowrap">
                              {a}{i < issue.assignees.length - 1 ? '、' : ''}
                            </span>
                          ))}
                        </span>
                      )}
                      <span className="ml-auto shrink-0">{formatDatetime(issue.updated_at)}</span>
                    </div>
                  </button>

                  {/* 展開內容 */}
                  {isExpanded && (
                    <IssueExpandedContent
                      issue={issue}
                      permissions={permissions}
                      userEmail={userEmail}
                      allowedEmails={allowedEmails}
                      issueTypes={issueTypes}
                      issueTags={issueTags}
                      onUpdated={handleIssueUpdated}
                      onDeleted={handleIssueDeleted}
                    />
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>

      {/* 新增議題 Dialog */}
      {canCreateIssues && (
        <NewIssueDialog
          open={newIssueOpen}
          onClose={() => setNewIssueOpen(false)}
          onCreated={handleIssueCreated}
          issueTypes={issueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          userEmail={userEmail}
        />
      )}
    </div>
  )
}
