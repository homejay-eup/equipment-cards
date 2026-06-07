'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Plus, AlertTriangle, ArrowUpDown } from 'lucide-react'
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
  onMyTasksCountChange?: (count: number) => void
}

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-[#7a3b1e]',
  medium: 'bg-[#9c6b42]',
  low:    'bg-[#b8956a]',
}

const COLUMNS = [
  { key: '待處理', label: '待處理', dotClass: 'bg-gray-400' },
  { key: '進行中', label: '進行中', dotClass: 'bg-blue-500' },
  { key: '等待中', label: '等待中', dotClass: 'bg-amber-500' },
  { key: '已完成', label: '已完成', dotClass: 'bg-green-500' },
] as const

const P_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 }

function todayStr() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dueDateChip(due: string | null): { label: string; cls: string } | null {
  if (!due) return null
  const today = todayStr()
  const [, m, day] = due.split('-')
  const label = `${m}/${day}`
  if (due < today) return { label: `⚠ ${label}`, cls: 'bg-red-50 text-red-600 border-red-200' }
  if (due === today) return { label: '今天', cls: 'bg-amber-50 text-amber-600 border-amber-200' }
  return { label, cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border-[rgba(122,82,48,.15)]' }
}

function sortByPriorityThenDue(a: Issue, b: Issue) {
  const pd = (P_ORDER[a.priority] ?? 2) - (P_ORDER[b.priority] ?? 2)
  if (pd !== 0) return pd
  if (a.due_date && b.due_date) return a.due_date.localeCompare(b.due_date)
  if (a.due_date) return -1
  if (b.due_date) return 1
  return 0
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
  const canViewMyTasks  = permissions.includes('view_my_tasks')

  const [issues,          setIssues]          = useState<Issue[]>(initialIssues)
  const [myTasksOnly,     setMyTasksOnly]     = useState(() => searchParams.get('tab') === 'my')
  const [filterPriority,  setFilterPriority]  = useState<'' | 'high' | 'medium' | 'low'>('')
  const [selectedIssue,   setSelectedIssue]   = useState<Issue | null>(null)
  const [newIssueOpen,    setNewIssueOpen]    = useState(false)
  const [newIssueStatus,  setNewIssueStatus]  = useState('待處理')
  const [draggingId,      setDraggingId]      = useState<string | null>(null)
  const [dragOverCol,     setDragOverCol]     = useState<string | null>(null)

  const myPendingCount = useMemo(() =>
    issues.filter(i => i.status !== '已完成' && i.assignee_emails.includes(userEmail)).length,
  [issues, userEmail])

  useEffect(() => {
    onMyTasksCountChange?.(myPendingCount)
  }, [myPendingCount, onMyTasksCountChange])

  // 依篩選後的 base list
  const baseIssues = useMemo(() => {
    let list = issues
    if (myTasksOnly)    list = list.filter(i => i.assignee_emails.includes(userEmail))
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)
    return list
  }, [issues, myTasksOnly, filterPriority, userEmail])

  // 分欄
  const columnIssues = useMemo(() => {
    const map: Record<string, Issue[]> = {}
    for (const col of COLUMNS) map[col.key] = baseIssues.filter(i => i.status === col.key)
    return map
  }, [baseIssues])

  // 優先級計數（未完成、不受 priority filter 影響）
  const priCounts = useMemo(() => {
    const base = (myTasksOnly
      ? issues.filter(i => i.status !== '已完成' && i.assignee_emails.includes(userEmail))
      : issues.filter(i => i.status !== '已完成'))
    return {
      all:    base.length,
      high:   base.filter(i => i.priority === 'high').length,
      medium: base.filter(i => i.priority === 'medium').length,
      low:    base.filter(i => i.priority === 'low').length,
    }
  }, [issues, myTasksOnly, userEmail])

  // 提醒：逾期 + 今日（未完成）
  const today = todayStr()
  const reminders = useMemo(() => {
    const base = (myTasksOnly
      ? issues.filter(i => i.status !== '已完成' && i.assignee_emails.includes(userEmail))
      : issues.filter(i => i.status !== '已完成'))
    return {
      overdue: base.filter(i => i.due_date && i.due_date < today),
      today:   base.filter(i => i.due_date === today),
    }
  }, [issues, myTasksOnly, userEmail, today])

  const handleIssueCreated = useCallback((newIssue: Issue) => {
    setIssues(prev => [newIssue, ...prev])
    setNewIssueOpen(false)
  }, [])

  const handleIssueUpdated = useCallback((updated: Issue) => {
    setIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedIssue(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  const handleIssueDeleted = useCallback((id: string) => {
    setIssues(prev => prev.filter(i => i.id !== id))
    setSelectedIssue(null)
  }, [])

  const handleSort = useCallback(() => {
    setIssues(prev => {
      const colOrder = COLUMNS.reduce((acc, c, i) => ({ ...acc, [c.key]: i }), {} as Record<string, number>)
      return [...prev].sort((a, b) => {
        const cd = (colOrder[a.status] ?? 0) - (colOrder[b.status] ?? 0)
        return cd !== 0 ? cd : sortByPriorityThenDue(a, b)
      })
    })
  }, [])

  const openNewIssue = useCallback((status = '待處理') => {
    setNewIssueStatus(status)
    setNewIssueOpen(true)
  }, [])

  const handleDrop = useCallback(async (targetStatus: string) => {
    if (!draggingId) return
    const issue = issues.find(i => i.id === draggingId)
    if (!issue || issue.status === targetStatus) {
      setDraggingId(null)
      setDragOverCol(null)
      return
    }
    const originalStatus = issue.status
    const id = draggingId
    setIssues(prev => prev.map(i => i.id === id ? { ...i, status: targetStatus } : i))
    setDraggingId(null)
    setDragOverCol(null)
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status: originalStatus } : i))
    }
  }, [draggingId, issues])

  const hasReminders = reminders.overdue.length > 0 || reminders.today.length > 0

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 sm:px-6">

      {/* ── 頂部控制列 ── */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        {/* 全部 / 我的任務 toggle */}
        <div className="flex items-center gap-1 bg-white border border-[rgba(122,82,48,.15)] rounded-lg p-1 shadow-sm">
          <button
            onClick={() => setMyTasksOnly(false)}
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              !myTasksOnly ? 'bg-[#7a5230] text-white font-medium' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
            }`}
          >
            全部
          </button>
          {canViewMyTasks && (
            <button
              onClick={() => setMyTasksOnly(true)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                myTasksOnly ? 'bg-[#7a5230] text-white font-medium' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
              }`}
            >
              我的任務
              {myPendingCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs rounded-full font-semibold ${
                  myTasksOnly ? 'bg-white/20 text-white' : 'bg-[#7a5230] text-white'
                }`}>
                  {myPendingCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* 排序 + 新增（右側） */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={handleSort}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#6b4f38] border border-[rgba(122,82,48,.2)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors bg-white"
            title="依優先級＋日期排序各欄（一次性）"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            排序
          </button>
          {canCreateIssues && (
            <button
              onClick={() => openNewIssue()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.25)]"
            >
              <Plus className="h-4 w-4" />
              新增議題
            </button>
          )}
        </div>
      </div>

      {/* ── 優先級篩選 chips ── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-[#a08060]">優先級：</span>
        {(
          [
            { key: '' as const,        label: '全部',  count: priCounts.all    },
            { key: 'high' as const,    label: '緊急',  count: priCounts.high   },
            { key: 'medium' as const,  label: '重要',  count: priCounts.medium },
            { key: 'low' as const,     label: '普通',  count: priCounts.low    },
          ] as const
        ).map(chip => (
          <button
            key={chip.key}
            onClick={() => setFilterPriority(chip.key)}
            className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs border transition-all ${
              filterPriority === chip.key
                ? chip.key === 'high'   ? 'bg-[#7a3b1e] border-[#7a3b1e] text-white'
                : chip.key === 'medium' ? 'bg-[#9c6b42] border-[#9c6b42] text-white'
                : chip.key === 'low'    ? 'bg-[#b8956a] border-[#b8956a] text-white'
                :                         'bg-[#7a5230] border-[#7a5230] text-white'
                : 'bg-white border-[rgba(122,82,48,.2)] text-[#6b4f38] hover:border-[rgba(122,82,48,.4)]'
            }`}
          >
            {chip.label}
            <span className="opacity-70 ml-0.5">{chip.count}</span>
          </button>
        ))}
      </div>

      {/* ── 提醒橫幅 ── */}
      {hasReminders && (
        <div className="mb-4 bg-[#fdf4f0] border border-[rgba(201,74,46,.3)] rounded-xl px-4 py-3">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-[#c94a2e] shrink-0" />
            <span className="text-xs font-semibold text-[#c94a2e] tracking-wider">待完成提醒</span>
          </div>
          <ul className="space-y-1">
            {reminders.today.map(i => (
              <li key={i.id} className="text-xs text-[#4a3422] flex items-center gap-2 flex-wrap">
                <AlertTriangle className="h-3 w-3 text-[#c94a2e] shrink-0" />
                <span>[今日] {i.title}</span>
                {i.assignees.length > 0 && <span className="text-[#a08060]">@ {i.assignees.join('、')}</span>}
              </li>
            ))}
            {reminders.overdue.map(i => {
              const days = Math.round((new Date(today).getTime() - new Date(i.due_date!).getTime()) / 86400000)
              return (
                <li key={i.id} className="text-xs text-[#4a3422] flex items-center gap-2 flex-wrap">
                  <AlertTriangle className="h-3 w-3 text-[#c94a2e] shrink-0" />
                  <span>[逾期 +{days}天] {i.title}</span>
                  {i.assignees.length > 0 && <span className="text-[#a08060]">@ {i.assignees.join('、')}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* ── Kanban 看板 ── */}
      <div className="overflow-x-auto -mx-4 px-4 sm:-mx-6 sm:px-6">
      <div className="grid grid-cols-4 gap-3 min-w-[700px]">
        {COLUMNS.map(col => {
          const colItems = columnIssues[col.key] ?? []
          return (
            <div
              key={col.key}
              className={`bg-white rounded-xl border border-[rgba(122,82,48,.12)] shadow-sm flex flex-col ${dragOverCol === col.key ? 'ring-2 ring-[#c49a72] ring-offset-1' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key) }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null)
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.key) }}
            >
              {/* 欄標題 */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(122,82,48,.08)]">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${col.dotClass}`} />
                  <span className="text-sm font-semibold text-[#4a3422]">{col.label}</span>
                </div>
                <span className="text-[11px] bg-[rgba(122,82,48,.07)] text-[#a08060] px-2 py-0.5 rounded-full border border-[rgba(122,82,48,.12)]">
                  {colItems.length}
                </span>
              </div>

              {/* 卡片列表 */}
              <div className="flex-1 p-2 space-y-2 min-h-[100px]">
                {colItems.length === 0 ? (
                  <div className="flex items-center justify-center py-8 text-[#c0a882] text-xs">
                    無項目
                  </div>
                ) : (
                  colItems.map(issue => {
                    const due = dueDateChip(issue.due_date)
                    return (
                      <button
                        key={issue.id}
                        onClick={() => setSelectedIssue(issue)}
                        draggable={true}
                        onDragStart={() => setDraggingId(issue.id)}
                        onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                        className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer group ${
                          col.key === '已完成'
                            ? 'bg-[rgba(122,82,48,.03)] border-[rgba(122,82,48,.08)] opacity-75 hover:opacity-100'
                            : 'bg-[#faf6f0] border-[rgba(122,82,48,.12)] hover:border-[rgba(122,82,48,.35)] hover:shadow-[2px_2px_0_rgba(122,82,48,.1)] hover:-translate-x-px hover:-translate-y-px'
                        } ${draggingId === issue.id ? 'opacity-50 cursor-grabbing' : ''}`}
                      >
                        {/* 標題行 */}
                        <div className="flex items-start gap-1.5 mb-1.5">
                          <span className={`shrink-0 mt-[3px] w-2 h-2 rounded-full ${PRIORITY_DOT[issue.priority] ?? 'bg-gray-300'}`} />
                          <span className={`flex-1 text-xs font-medium leading-snug break-words ${
                            col.key === '已完成' ? 'line-through text-[#a08060]' : 'text-[#2c1e12]'
                          }`}>
                            {issue.title}
                          </span>
                        </div>
                        {/* meta 行 */}
                        <div className="flex items-center gap-1.5 pl-3.5 flex-wrap">
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]">
                            {issue.type}
                          </span>
                          {due && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${due.cls}`}>
                              {due.label}
                            </span>
                          )}
                          {issue.assignees.length > 0 && (
                            <span className="text-[10px] text-[#a08060] truncate max-w-[90px]" title={issue.assignees.join('、')}>
                              @ {issue.assignees.join('、')}
                            </span>
                          )}
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              {/* 新增到此欄 */}
              {canCreateIssues && (
                <button
                  onClick={() => openNewIssue(col.key)}
                  className="mx-2 mb-2 py-1.5 text-[11px] text-[#a08060] border border-dashed border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] hover:bg-[rgba(122,82,48,.03)] transition-all"
                >
                  + 新增到此欄
                </button>
              )}
            </div>
          )
        })}
      </div>
      </div>

      {/* ── Issue 詳細 Dialog ── */}
      {selectedIssue && (
        <IssueDetailDialog
          open={!!selectedIssue}
          issue={selectedIssue}
          permissions={permissions}
          userEmail={userEmail}
          allowedEmails={allowedEmails}
          issueTypes={issueTypes}
          issueTags={issueTags}
          onClose={() => setSelectedIssue(null)}
          onUpdated={handleIssueUpdated}
          onDeleted={handleIssueDeleted}
        />
      )}

      {/* ── 新增 Dialog ── */}
      {canCreateIssues && (
        <NewIssueDialog
          open={newIssueOpen}
          onClose={() => setNewIssueOpen(false)}
          onCreated={handleIssueCreated}
          issueTypes={issueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          userEmail={userEmail}
          defaultStatus={newIssueStatus}
        />
      )}
    </div>
  )
}
