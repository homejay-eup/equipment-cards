'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Loader2, Send, Pencil, Trash2 } from 'lucide-react'
import type { Issue, IssueUpdate } from '@/app/tracker/page'
import EditIssueDialog from '@/components/EditIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Props {
  open: boolean
  issue: Issue
  permissions: string[]
  userEmail: string
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  onClose: () => void
  onUpdated: (updated: Issue) => void
  onDeleted: (issueId: string) => void
}

const PRIORITY_DOT: Record<string, string> = {
  high:   'bg-[#ef4444]',
  medium: 'bg-[#eab308]',
  low:    'bg-[#22c55e]',
}
const PRIORITY_LABEL: Record<string, string> = {
  high: '緊急', medium: '中', low: '低',
}

const STATUS_OPTIONS = ['待處理', '進行中', '等待中', '已完成']

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

export default function IssueDetailDialog({
  open, issue, permissions, userEmail, allowedEmails,
  issueTypes, issueTags, onClose, onUpdated, onDeleted,
}: Props) {
  const [localIssue, setLocalIssue] = useState<Issue>(issue)
  const [updates, setUpdates] = useState<IssueUpdate[]>(issue.issue_updates ?? [])
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [updateContent, setUpdateContent] = useState('')
  const [submittingUpdate, setSubmittingUpdate] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const canCreateIssues = permissions.includes('create_issues')
  const canViewTracker = permissions.includes('view_tracker')
  const isAuthor = localIssue.created_by === userEmail
  const isAssignee = localIssue.assignee_emails.includes(userEmail)
  const canFullEdit = isAuthor || canCreateIssues
  const canChangeStatus = isAuthor || isAssignee || canCreateIssues
  const canDelete = isAuthor || canCreateIssues

  // 每次 open 時同步最新 issue 並載入 updates
  useEffect(() => {
    if (!open) return
    setLocalIssue(issue)
    setError(null)
    setUpdateContent('')

    // 載入完整更新紀錄
    const fetchUpdates = async () => {
      setLoadingUpdates(true)
      try {
        const res = await fetch(`/api/issues/${issue.id}`)
        if (res.ok) {
          const data = await res.json()
          setUpdates(data.issue_updates ?? [])
          // 同步最新 assignees
          const emails: string[] = (data.issue_assignees ?? []).map(
            (a: { user_email: string }) => a.user_email,
          )
          setLocalIssue({
            ...issue,
            ...data,
            issue_updates: undefined,
            issue_assignees: undefined,
            assignee_emails: emails,
            assignees: emails.map((e: string) => e.split('@')[0]),
          })
        }
      } catch {
        // silent
      } finally {
        setLoadingUpdates(false)
      }
    }
    fetchUpdates()
  }, [open, issue.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (newStatus === localIssue.status) return
    const prev = localIssue.status
    // Optimistic Update
    setLocalIssue((cur) => ({ ...cur, status: newStatus }))
    setChangingStatus(true)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '狀態更新失敗')
        setLocalIssue((cur) => ({ ...cur, status: prev }))
        return
      }
      const updated = await res.json()
      const emails: string[] = (updated.issue_assignees ?? []).map(
        (a: { user_email: string }) => a.user_email,
      )
      const merged: Issue = {
        ...updated,
        issue_updates: undefined,
        issue_assignees: undefined,
        assignee_emails: emails,
        assignees: emails.map((e: string) => e.split('@')[0]),
      }
      setLocalIssue(merged)
      onUpdated(merged)
    } catch {
      setError('狀態更新失敗，請重試')
      setLocalIssue((cur) => ({ ...cur, status: prev }))
    } finally {
      setChangingStatus(false)
    }
  }, [localIssue, onUpdated])

  const handleSubmitUpdate = useCallback(async () => {
    const content = updateContent.trim()
    if (!content) return
    const pendingId = `pending-${Date.now()}`
    const optimistic: IssueUpdate = {
      id: pendingId,
      content,
      created_by: userEmail,
      created_at: new Date().toISOString(),
    }
    setUpdates((prev) => [optimistic, ...prev])
    setUpdateContent('')
    setSubmittingUpdate(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '新增更新紀錄失敗')
        setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
        setUpdateContent(content)
        return
      }
      const real: IssueUpdate = await res.json()
      setUpdates((prev) => prev.map((u) => u.id === pendingId ? real : u))
    } catch {
      setError('新增更新紀錄失敗，請重試')
      setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
      setUpdateContent(content)
    } finally {
      setSubmittingUpdate(false)
    }
  }, [updateContent, localIssue.id, userEmail])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '刪除失敗')
        return
      }
      onDeleted(localIssue.id)
    } catch {
      setError('刪除失敗，請重試')
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }, [localIssue.id, onDeleted])

  const handleEditUpdated = useCallback((updated: Issue) => {
    setLocalIssue(updated)
    setEditOpen(false)
    onUpdated(updated)
  }, [onUpdated])

  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6"
        onClick={onClose}
      >
        <div
          className="bg-[#fff9f4] rounded-2xl shadow-[0_0_40px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-start gap-3 px-5 pt-5 pb-4 border-b border-[rgba(122,82,48,.1)]">
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-[#2c1e12] leading-snug">
                {localIssue.title}
              </h2>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {canChangeStatus && (
                <div className="relative">
                  <select
                    value={localIssue.status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    disabled={changingStatus}
                    className={`text-xs px-2 py-1 rounded-full border font-medium appearance-none cursor-pointer pr-5 focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-60 ${
                      STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                    }`}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  {changingStatus && (
                    <Loader2 className="absolute right-1 top-1/2 -translate-y-1/2 h-3 w-3 animate-spin text-[#a08060]" />
                  )}
                </div>
              )}
              {!canChangeStatus && (
                <span
                  className={`text-xs px-2 py-1 rounded-full border font-medium ${
                    STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'
                  }`}
                >
                  {localIssue.status}
                </span>
              )}
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {/* 議題資訊 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-xs text-[#a08060] mb-1">優先度</p>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${PRIORITY_DOT[localIssue.priority] ?? 'bg-gray-300'}`}
                  />
                  <span className="text-sm text-[#4a3422]">
                    {PRIORITY_LABEL[localIssue.priority] ?? localIssue.priority}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">類型</p>
                <span className="text-xs px-1.5 py-0.5 rounded border border-[rgba(122,82,48,.2)] bg-[rgba(122,82,48,.05)] text-[#7a5230] font-medium">
                  {localIssue.type}
                </span>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">預計日期</p>
                <p className="text-sm text-[#4a3422]">
                  {localIssue.due_date
                    ? new Date(localIssue.due_date).toLocaleDateString('zh-TW')
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">負責人</p>
                <p className="text-sm text-[#4a3422]">
                  {localIssue.assignees.length > 0 ? localIssue.assignees.join('、') : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">建立者</p>
                <p className="text-sm text-[#4a3422]">{localIssue.created_by.split('@')[0]}</p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">建立日期</p>
                <p className="text-sm text-[#4a3422]">{formatDatetime(localIssue.created_at)}</p>
              </div>
            </div>

            {/* 標籤 */}
            {localIssue.tags.length > 0 && (
              <div>
                <p className="text-xs text-[#a08060] mb-1.5">標籤</p>
                <div className="flex flex-wrap gap-1.5">
                  {localIssue.tags.map((tag) => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* 說明 */}
            {localIssue.description && (
              <div>
                <p className="text-xs text-[#a08060] mb-1.5">說明</p>
                <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap bg-[rgba(122,82,48,.03)] rounded-lg px-3 py-2.5 border border-[rgba(122,82,48,.08)]">
                  {localIssue.description}
                </p>
              </div>
            )}

            {/* 更新紀錄 */}
            <div>
              <p className="text-xs font-semibold text-[#6b4f38] mb-2">更新紀錄</p>
              {loadingUpdates && (
                <div className="flex items-center gap-2 text-xs text-[#a08060] py-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  載入中…
                </div>
              )}
              {!loadingUpdates && updates.length === 0 && (
                <p className="text-xs text-[#c0a882] py-2">尚無更新紀錄</p>
              )}
              {!loadingUpdates && updates.length > 0 && (
                <div className="space-y-2">
                  {updates.map((upd) => (
                    <div
                      key={upd.id}
                      className="rounded-lg bg-white border border-[rgba(122,82,48,.1)] px-3 py-2.5"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-[#7a5230]">
                          {upd.created_by.split('@')[0]}
                        </span>
                        <span className="text-xs text-[#c0a882]">
                          {formatDatetime(upd.created_at)}
                        </span>
                      </div>
                      <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap">
                        {upd.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 新增更新紀錄 */}
            {canViewTracker && (
              <div>
                <textarea
                  ref={textareaRef}
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      handleSubmitUpdate()
                    }
                  }}
                  placeholder="新增更新紀錄… (Ctrl+Enter 送出)"
                  rows={2}
                  disabled={submittingUpdate}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all resize-none"
                />
                <div className="flex justify-end mt-1.5">
                  <button
                    onClick={handleSubmitUpdate}
                    disabled={!updateContent.trim() || submittingUpdate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-40 transition-colors"
                  >
                    {submittingUpdate
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                    送出
                  </button>
                </div>
              </div>
            )}

            {error && (
              <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
                {error}
              </p>
            )}
          </div>

          {/* Footer */}
          {(canFullEdit || canDelete) && (
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[rgba(122,82,48,.1)] bg-[#faf6f0]">
              {canFullEdit && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  編輯
                </button>
              )}
              {canDelete && (
                <button
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={deleting}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#b5451b] border border-[rgba(181,69,27,.25)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-50 transition-colors"
                >
                  {deleting
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Trash2 className="h-3.5 w-3.5" />}
                  刪除
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 編輯 Dialog */}
      {editOpen && (
        <EditIssueDialog
          open={editOpen}
          issue={localIssue}
          issueTypes={issueTypes}
          issueTags={issueTags}
          allowedEmails={allowedEmails}
          onClose={() => setEditOpen(false)}
          onUpdated={handleEditUpdated}
        />
      )}

      {/* 刪除確認 */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`刪除議題「${localIssue.title}」？`}
        message="刪除後無法復原，包含所有更新紀錄。"
        confirmLabel="刪除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </>
  )
}
