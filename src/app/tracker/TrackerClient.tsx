'use client'

import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Plus, ArrowLeft, AlertCircle } from 'lucide-react'
import type { Issue } from './page'
import IssueDetailDialog from '@/components/IssueDetailDialog'
import NewIssueDialog from '@/components/NewIssueDialog'

interface Props {
  initialIssues: Issue[]
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
}

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-[#ef4444]',
  medium: 'bg-[#eab308]',
  low:    'bg-[#22c55e]',
}

const PRIORITY_LABEL: Record<string, string> = {
  high:   '緊急',
  medium: '中',
  low:    '低',
}

const STATUS_BADGE: Record<string, string> = {
  '待處理': 'bg-gray-100 text-gray-600 border-gray-200',
  '進行中': 'bg-blue-50 text-blue-700 border-blue-200',
  '等待中': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '已完成': 'bg-green-50 text-green-700 border-green-200',
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffSeconds < 60) return '剛剛'
  if (diffMinutes < 60) return `${diffMinutes} 分鐘前`
  if (diffHours < 24) return `${diffHours} 小時前`
  if (diffDays < 30) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })
}

export default function TrackerClient({
  initialIssues,
  permissions,
  userEmail,
  allowedEmails,
  issueTypes,
  issueTags,
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
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null)
  const [newIssueOpen, setNewIssueOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)

  const filteredIssues = useMemo(() => {
    let list = issues

    if (activeTab === 'my') {
      list = list.filter((i) =>
        i.assignee_emails.includes(userEmail) ||
        i.created_by === userEmail,
      )
    }

    if (filterType) list = list.filter((i) => i.type === filterType)
    if (filterStatus) list = list.filter((i) => i.status === filterStatus)
    if (filterPriority) list = list.filter((i) => i.priority === filterPriority)

    return list
  }, [issues, activeTab, filterType, filterStatus, filterPriority, userEmail])

  const myPendingCount = useMemo(() => {
    return issues.filter(
      (i) =>
        i.status !== '已完成' &&
        (i.assignee_emails.includes(userEmail) || i.created_by === userEmail),
    ).length
  }, [issues, userEmail])

  const handleIssueClick = useCallback((issue: Issue) => {
    setSelectedIssue(issue)
    setDetailOpen(true)
  }, [])

  const handleIssueCreated = useCallback((newIssue: Issue) => {
    setIssues((prev) => [newIssue, ...prev])
    setNewIssueOpen(false)
  }, [])

  const handleIssueUpdated = useCallback((updatedIssue: Issue) => {
    setIssues((prev) =>
      prev.map((i) => (i.id === updatedIssue.id ? updatedIssue : i)),
    )
    setSelectedIssue(updatedIssue)
  }, [])

  const handleIssueDeleted = useCallback((issueId: string) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId))
    setDetailOpen(false)
    setSelectedIssue(null)
  }, [])

  const allStatuses = ['待處理', '進行中', '等待中', '已完成']

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-[#a08060] hover:text-[#7a5230] transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">料卡</span>
        </Link>
        <h1 className="text-xl font-semibold text-[#2c1e12]">追蹤板</h1>
        {canViewMyTasks && myPendingCount > 0 && (
          <span className="px-2 py-0.5 text-xs font-semibold bg-[#7a5230] text-white rounded-full">
            {myPendingCount}
          </span>
        )}
      </div>

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
            <option value="medium">中</option>
            <option value="low">低</option>
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
            {filteredIssues.map((issue) => (
              <li key={issue.id}>
                <button
                  onClick={() => handleIssueClick(issue)}
                  className="w-full text-left px-4 py-3.5 hover:bg-[rgba(122,82,48,.03)] transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    {/* 優先度圓點 */}
                    <span
                      className={`shrink-0 w-2.5 h-2.5 rounded-full ${
                        PRIORITY_DOT[issue.priority] ?? 'bg-gray-300'
                      }`}
                      title={PRIORITY_LABEL[issue.priority]}
                    />

                    {/* 類型標籤 */}
                    <span className="shrink-0 text-xs px-1.5 py-0.5 rounded border border-[rgba(122,82,48,.2)] bg-[rgba(122,82,48,.05)] text-[#7a5230] font-medium">
                      {issue.type}
                    </span>

                    {/* 標題 */}
                    <span className="flex-1 text-sm text-[#2c1e12] font-medium group-hover:text-[#7a5230] transition-colors truncate">
                      {issue.title}
                    </span>

                    {/* 狀態徽章 */}
                    <span
                      className={`shrink-0 text-xs px-2 py-0.5 rounded-full border font-medium hidden sm:inline-flex ${
                        STATUS_BADGE[issue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {issue.status}
                    </span>

                    {/* 預計日期 */}
                    <span className="shrink-0 text-xs text-[#a08060] hidden md:block w-16 text-right">
                      {issue.due_date
                        ? new Date(issue.due_date).toLocaleDateString('zh-TW', {
                            month: 'numeric',
                            day: 'numeric',
                          })
                        : '—'}
                    </span>

                    {/* 負責人 */}
                    <span className="shrink-0 text-xs text-[#a08060] hidden md:block w-24 text-right truncate">
                      {issue.assignees.length > 0 ? issue.assignees.join(', ') : '—'}
                    </span>

                    {/* 建立時間 */}
                    <span className="shrink-0 text-xs text-[#c0a882] hidden lg:block w-14 text-right">
                      {formatRelativeTime(issue.created_at)}
                    </span>
                  </div>

                  {/* 手機版：第二行補充資訊 */}
                  <div className="flex items-center gap-2 mt-1 sm:hidden pl-5">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                        STATUS_BADGE[issue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                      }`}
                    >
                      {issue.status}
                    </span>
                    {issue.assignees.length > 0 && (
                      <span className="text-xs text-[#a08060]">{issue.assignees.join(', ')}</span>
                    )}
                    <span className="text-xs text-[#c0a882] ml-auto">
                      {formatRelativeTime(issue.created_at)}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* 議題詳情 Dialog */}
      {selectedIssue && (
        <IssueDetailDialog
          open={detailOpen}
          issue={selectedIssue}
          permissions={permissions}
          userEmail={userEmail}
          allowedEmails={allowedEmails}
          issueTypes={issueTypes}
          issueTags={issueTags}
          onClose={() => {
            setDetailOpen(false)
            setSelectedIssue(null)
          }}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
        />
      )}

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
