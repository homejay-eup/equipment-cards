'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, AlertTriangle, ArrowUpDown, Trash2 } from 'lucide-react'
import type { Issue } from './page'
import IssueDetailDialog from '@/components/IssueDetailDialog'
import NewIssueDialog from '@/components/NewIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useIssueRealtime } from '@/hooks/useIssueRealtime'

interface Props {
  initialIssues: Issue[]
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onMyTasksCountChange?: (count: number) => void
  userDepartmentId?: string | null
}

const PRIORITY_PILL: Record<string, { label: string; cls: string }> = {
  high:   { label: '緊急', cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: '重要', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low:    { label: '普通', cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border border-[rgba(122,82,48,.15)]' },
}

const COLUMNS = [
  { key: '待處理', label: '待處理' },
  { key: '進行中', label: '進行中' },
  { key: '等待中', label: '等待中' },
  { key: '已完成', label: '已完成' },
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
  userDepartmentId,
}: Props) {
  const router = useRouter()
  const hasMutatedRef = useRef(false)
  const recentMutationIdsRef = useRef<Map<string, number>>(new Map())
  const searchParams = useSearchParams()

  function markMutation(id: string) {
    recentMutationIdsRef.current.set(id, Date.now())
    setTimeout(() => recentMutationIdsRef.current.delete(id), 3000)
  }

  const canCreateIssues = permissions.includes('create_issues')
  const canViewMyTasks  = permissions.includes('view_my_tasks')

  const [issues,               setIssues]               = useState<Issue[]>(initialIssues)
  const [currentIssueTypes,    setCurrentIssueTypes]    = useState<string[]>(issueTypes)
  const [myTasksOnly,          setMyTasksOnly]          = useState(() => searchParams.get('tab') === 'my')
  const [filterPriority,       setFilterPriority]       = useState<'' | 'high' | 'medium' | 'low'>('')
  const [selectedIssue,        setSelectedIssue]        = useState<Issue | null>(null)
  const [newIssueOpen,         setNewIssueOpen]         = useState(false)
  const [newIssueStatus,       setNewIssueStatus]       = useState('待處理')
  const [draggingId,           setDraggingId]           = useState<string | null>(null)
  const [dragOverCol,          setDragOverCol]          = useState<string | null>(null)
  const [dragOverIssueId,      setDragOverIssueId]      = useState<string | null>(null)
  const [confirmClearOpen,     setConfirmClearOpen]     = useState(false)
  const [confirmDeleteIssueId, setConfirmDeleteIssueId] = useState<string | null>(null)
  const [clearingCompleted,    setClearingCompleted]    = useState(false)
  const [deletingIssueId,      setDeletingIssueId]      = useState<string | null>(null)
  const [activeCol,            setActiveCol]            = useState<string>(COLUMNS[0].key)

  const myPendingCount = useMemo(() =>
    issues.filter(i => i.status !== '已完成' && i.assignee_emails.includes(userEmail)).length,
  [issues, userEmail])

  useEffect(() => {
    onMyTasksCountChange?.(myPendingCount)
  }, [myPendingCount, onMyTasksCountChange])

  // 每次掛載時強制重取 server 資料，確保切頁返回後看到最新狀態
  useEffect(() => {
    router.refresh()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // router.refresh() 完成後 initialIssues prop 更新，同步至 state
  // hasMutatedRef 防止在使用者操作期間被 server 資料覆蓋
  useEffect(() => {
    if (!hasMutatedRef.current) setIssues(initialIssues)
  }, [initialIssues])

  useIssueRealtime({
    userDepartmentId: userDepartmentId ?? null,
    onInsert: useCallback((issue: Issue) => {
      if (recentMutationIdsRef.current.has(issue.id)) return
      setIssues(prev =>
        prev.some(i => i.id === issue.id)
          ? prev.map(i => i.id === issue.id ? issue : i)
          : [issue, ...prev],
      )
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onUpdate: useCallback((issue: Issue) => {
      if (recentMutationIdsRef.current.has(issue.id)) return
      setIssues(prev => prev.map(i => i.id === issue.id ? issue : i))
      setSelectedIssue(prev => prev?.id === issue.id ? issue : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
    onDelete: useCallback((id: string) => {
      if (recentMutationIdsRef.current.has(id)) return
      setIssues(prev => prev.filter(i => i.id !== id))
      setSelectedIssue(prev => prev?.id === id ? null : prev)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  })

  // 依篩選後的 base list
  const baseIssues = useMemo(() => {
    let list = issues
    if (myTasksOnly)    list = list.filter(i => i.assignee_emails.includes(userEmail))
    if (filterPriority) list = list.filter(i => i.priority === filterPriority)
    return list
  }, [issues, myTasksOnly, filterPriority, userEmail])

  // 分欄（依 sort_order 排序，null 排最後）
  const columnIssues = useMemo(() => {
    const map: Record<string, Issue[]> = {}
    for (const col of COLUMNS) {
      map[col.key] = baseIssues
        .filter(i => i.status === col.key)
        .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
    }
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
    hasMutatedRef.current = true
    markMutation(newIssue.id)
    setIssues(prev => [newIssue, ...prev])
    setNewIssueOpen(false)
  }, [])

  const handleIssueUpdated = useCallback((updated: Issue) => {
    hasMutatedRef.current = true
    markMutation(updated.id)
    setIssues(prev => prev.map(i => i.id === updated.id ? updated : i))
    setSelectedIssue(prev => prev?.id === updated.id ? updated : prev)
  }, [])

  // 樂觀刪除：立即移除 issues（Banner 即時消失），dialog 保持開著等 API
  const handleIssueDeleteStart = useCallback((id: string) => {
    hasMutatedRef.current = true
    markMutation(id)
    setIssues(prev => prev.filter(i => i.id !== id))
  }, [])

  // 回滾：API 失敗時補回 issue，dialog 仍可顯示錯誤
  const handleIssueDeleteRollback = useCallback((issue: Issue) => {
    setIssues(prev => prev.some(i => i.id === issue.id) ? prev : [issue, ...prev])
  }, [])

  // 成功後：關閉 dialog
  const handleIssueDeleted = useCallback(() => {
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

  const handleClearCompleted = useCallback(async () => {
    const completedIssues = issues.filter(i => i.status === '已完成')
    setClearingCompleted(true)
    try {
      await Promise.all(
        completedIssues.map(issue =>
          fetch(`/api/issues/${issue.id}`, { method: 'DELETE' })
        )
      )
      hasMutatedRef.current = true
      completedIssues.forEach(i => markMutation(i.id))
      setIssues(prev => prev.filter(i => i.status !== '已完成'))
    } finally {
      setClearingCompleted(false)
      setConfirmClearOpen(false)
    }
  }, [issues])

  const handleDeleteIssue = useCallback(async (id: string) => {
    setDeletingIssueId(id)
    // 樂觀更新：立即從本地狀態移除，確保 Banner 即時消失
    hasMutatedRef.current = true
    markMutation(id)
    setIssues(prev => prev.filter(i => i.id !== id))
    try {
      const res = await fetch(`/api/issues/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        // API 失敗：回滾（重新向 server 取最新資料補回）
        const refetch = await fetch(`/api/issues/${id}`)
        if (refetch.ok) {
          const issue = await refetch.json()
          setIssues(prev => prev.some(i => i.id === id) ? prev : [issue, ...prev])
        }
      }
    } finally {
      setDeletingIssueId(null)
      setConfirmDeleteIssueId(null)
    }
  }, [])

  const handleDrop = useCallback(async (targetStatus: string) => {
    if (!draggingId) return
    const issue = issues.find(i => i.id === draggingId)
    if (!issue) {
      setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null)
      return
    }

    const id = draggingId
    const hoverId = dragOverIssueId
    setDraggingId(null)
    setDragOverCol(null)
    setDragOverIssueId(null)

    // ── 跨欄拖曳（原有邏輯）──
    if (issue.status !== targetStatus) {
      const originalStatus = issue.status
      hasMutatedRef.current = true
      markMutation(id)
      setIssues(prev => prev.map(i => i.id === id ? { ...i, status: targetStatus } : i))
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
      return
    }

    // ── 同欄排序（新增邏輯）──
    if (hoverId && hoverId !== id) {
      const colItems = issues
        .filter(i => i.status === targetStatus)
        .sort((a, b) => (a.sort_order ?? Infinity) - (b.sort_order ?? Infinity))
      const draggingIdx = colItems.findIndex(i => i.id === id)
      const hoverIdx = colItems.findIndex(i => i.id === hoverId)
      if (draggingIdx === -1 || hoverIdx === -1) return

      // 移除被拖曳的項目，插入到 hover 目標之前
      const reordered = [...colItems]
      const [dragged] = reordered.splice(draggingIdx, 1)
      const insertIdx = reordered.findIndex(i => i.id === hoverId)
      reordered.splice(insertIdx, 0, dragged)

      // 重新分配 sort_order（等差 1000，留空間之後插入）
      const orders = reordered.map((item, idx) => ({ id: item.id, sort_order: (idx + 1) * 1000 }))
      const sortMap = Object.fromEntries(orders.map(o => [o.id, o.sort_order]))
      const originalSortMap = Object.fromEntries(colItems.map(i => [i.id, i.sort_order ?? null]))

      // 樂觀更新
      hasMutatedRef.current = true
      orders.forEach(o => markMutation(o.id))
      setIssues(prev => prev.map(i =>
        sortMap[i.id] !== undefined ? { ...i, sort_order: sortMap[i.id] } : i
      ))

      // 持久化
      try {
        const res = await fetch('/api/issues/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orders }),
        })
        if (!res.ok) throw new Error('Failed')
      } catch {
        // Rollback
        setIssues(prev => prev.map(i =>
          originalSortMap[i.id] !== undefined
            ? { ...i, sort_order: originalSortMap[i.id] ?? undefined }
            : i
        ))
      }
    }
  }, [draggingId, dragOverIssueId, issues])

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
              新增任務
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
                ? 'bg-[#7a5230] border-[#7a5230] text-white font-medium'
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

      {/* 手機：欄位 Tab（sm 以上隱藏） */}
      <div className="flex sm:hidden gap-1 bg-[#ede5db] rounded-xl p-1 mb-3">
        {COLUMNS.map(col => {
          const count = columnIssues[col.key]?.length ?? 0
          return (
            <button
              key={col.key}
              onClick={() => setActiveCol(col.key)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeCol === col.key
                  ? 'bg-white text-[#7a5230] shadow-sm'
                  : 'text-[#a08060] hover:text-[#6b4f38]'
              }`}
            >
              <span>{col.label}</span>
              <span className={`text-[10px] px-1.5 rounded-full ${
                activeCol === col.key ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230]' : ''
              }`}>{count}</span>
            </button>
          )
        })}
      </div>

      <div className="sm:-mx-6 sm:px-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        {COLUMNS.map(col => {
          const colItems = columnIssues[col.key] ?? []
          return (
            <div
              key={col.key}
              className={`bg-[#ede5db] rounded-xl border shadow-sm flex-col transition-colors ${
                col.key !== activeCol ? 'hidden sm:flex' : 'flex'
              } ${dragOverCol === col.key ? 'border-2 border-[#c49a72]' : 'border border-[rgba(122,82,48,.20)]'}`}
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); setDragOverIssueId(null) }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverCol(null)
              }}
              onDrop={(e) => { e.preventDefault(); handleDrop(col.key) }}
            >
              {/* 欄標題 */}
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-[rgba(122,82,48,.08)]">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[#4a3422]">{col.label}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] bg-[rgba(122,82,48,.07)] text-[#a08060] px-2 py-0.5 rounded-full border border-[rgba(122,82,48,.12)]">
                    {colItems.length}
                  </span>
                  {col.key === '已完成' && colItems.length > 0 && (
                    <button
                      onClick={() => setConfirmClearOpen(true)}
                      className="text-[10px] text-[#a08060] hover:text-[#b5451b] transition-colors px-1.5 py-0.5 rounded hover:bg-[rgba(181,69,27,.06)]"
                    >
                      清空
                    </button>
                  )}
                </div>
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
                    // 拖曳中、同欄、懸停在此卡上 → 顯示插入指示條
                    const draggedIssue = draggingId ? issues.find(i => i.id === draggingId) : null
                    const isSameColDrag = draggedIssue?.status === col.key
                    const isInsertTarget = isSameColDrag && dragOverIssueId === issue.id && draggingId !== issue.id
                    return (
                      <div key={issue.id}>
                        {/* 插入位置指示條 */}
                        {isInsertTarget && (
                          <div className="h-0.5 bg-[#c49a72] rounded-full mb-1 mx-0.5" />
                        )}
                        {col.key === '已完成' ? (
                          /* 已完成欄：改用 div（避免 button 巢狀 button） */
                          <div
                            onClick={() => setSelectedIssue(issue)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { setSelectedIssue(issue) } }}
                            draggable={true}
                            onDragStart={() => setDraggingId(issue.id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null) }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDragOverCol(col.key)
                              if (draggingId) {
                                const dragged = issues.find(i => i.id === draggingId)
                                if (dragged?.status === col.key) {
                                  setDragOverIssueId(issue.id)
                                }
                              }
                            }}
                            className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer group bg-white border-[rgba(122,82,48,.12)] opacity-50 hover:opacity-80 ${draggingId === issue.id ? 'opacity-40 cursor-grabbing' : ''}`}
                          >
                            {/* 標題行 */}
                            <div className="flex items-start gap-1.5 mb-1.5">
                              <span className="flex-1 text-xs font-medium leading-snug break-words line-through text-[#a08060]">
                                {issue.title}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteIssueId(issue.id) }}
                                className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-0.5 rounded text-[#c0a882] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.06)]"
                                title="刪除"
                                disabled={deletingIssueId === issue.id}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            {/* meta 行 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {PRIORITY_PILL[issue.priority] && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[issue.priority].cls}`}>
                                  {PRIORITY_PILL[issue.priority].label}
                                </span>
                              )}
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
                          </div>
                        ) : (
                          /* 其他欄：維持原本 button 結構 */
                          <button
                            onClick={() => setSelectedIssue(issue)}
                            draggable={true}
                            onDragStart={() => setDraggingId(issue.id)}
                            onDragEnd={() => { setDraggingId(null); setDragOverCol(null); setDragOverIssueId(null) }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              setDragOverCol(col.key)
                              if (draggingId) {
                                const dragged = issues.find(i => i.id === draggingId)
                                if (dragged?.status === col.key) {
                                  setDragOverIssueId(issue.id)
                                }
                              }
                            }}
                            className={`w-full text-left rounded-lg border px-2.5 py-2 transition-all cursor-pointer group bg-white border-[rgba(122,82,48,.15)] hover:border-[rgba(122,82,48,.40)] hover:shadow-[0_2px_8px_rgba(122,82,48,.12)] hover:-translate-y-px ${draggingId === issue.id ? 'opacity-50 cursor-grabbing' : ''}`}
                          >
                            {/* 標題行 */}
                            <div className="flex items-start gap-1.5 mb-1.5">
                              <span className="flex-1 text-xs font-medium leading-snug break-words text-[#2c1e12]">
                                {issue.title}
                              </span>
                            </div>
                            {/* meta 行 */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {PRIORITY_PILL[issue.priority] && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[issue.priority].cls}`}>
                                  {PRIORITY_PILL[issue.priority].label}
                                </span>
                              )}
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
                        )}
                      </div>
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
          issueTypes={currentIssueTypes}
          issueTags={issueTags}
          onClose={() => setSelectedIssue(null)}
          onUpdated={handleIssueUpdated}
          onDeleteStart={handleIssueDeleteStart}
          onDeleteRollback={handleIssueDeleteRollback}
          onDeleted={handleIssueDeleted}
          onTypesChange={setCurrentIssueTypes}
        />
      )}

      {/* ── 新增 Dialog ── */}
      {canCreateIssues && (
        <NewIssueDialog
          open={newIssueOpen}
          onClose={() => setNewIssueOpen(false)}
          onCreated={handleIssueCreated}
          issueTypes={currentIssueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          userEmail={userEmail}
          defaultStatus={newIssueStatus}
          onTypesChange={setCurrentIssueTypes}
        />
      )}

      {/* ── 清空已完成 ConfirmDialog ── */}
      <ConfirmDialog
        open={confirmClearOpen}
        title="清空已完成任務"
        message={`確定要刪除全部 ${issues.filter(i => i.status === '已完成').length} 筆已完成任務嗎？此操作無法復原。`}
        danger={true}
        confirmLabel={clearingCompleted ? '刪除中…' : '確定刪除'}
        onConfirm={handleClearCompleted}
        onCancel={() => setConfirmClearOpen(false)}
      />

      {/* ── 個別刪除 ConfirmDialog ── */}
      {confirmDeleteIssueId && (() => {
        const targetIssue = issues.find(i => i.id === confirmDeleteIssueId)
        return (
          <ConfirmDialog
            open={true}
            title="刪除任務"
            message={`確定要刪除「${targetIssue?.title ?? ''}」嗎？`}
            danger={true}
            confirmLabel={deletingIssueId === confirmDeleteIssueId ? '刪除中…' : '確定刪除'}
            onConfirm={() => { void handleDeleteIssue(confirmDeleteIssueId) }}
            onCancel={() => setConfirmDeleteIssueId(null)}
          />
        )
      })()}
    </div>
  )
}
