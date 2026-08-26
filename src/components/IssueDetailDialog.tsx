'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { X, Loader2, Pencil, Trash2, Pin, Send } from 'lucide-react'
import type { Issue, IssueUpdate } from '@/app/tracker/page'
import EditIssueDialog from '@/components/EditIssueDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import UpdateImageLightbox from '@/components/UpdateImageLightbox'
import { useUpdateAttachmentUpload } from '@/hooks/useUpdateAttachmentUpload'

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
  onDeleteStart: (issueId: string) => void
  onDeleteRollback: (issue: Issue) => void
  onDeleted: (issueId: string) => void
  onTypesChange?: (types: string[]) => void
}

interface PendingImage {
  tempId: string
  uploading: boolean
  public_id?: string
  url?: string
  error?: string
}

type TableData = { rows: string[][]; hasHeader: boolean }

const PRIORITY_PILL: Record<string, { label: string; cls: string }> = {
  high:   { label: '緊急', cls: 'bg-red-50 text-red-600 border border-red-200' },
  medium: { label: '重要', cls: 'bg-amber-50 text-amber-600 border border-amber-200' },
  low:    { label: '普通', cls: 'bg-[rgba(122,82,48,.06)] text-[#a08060] border border-[rgba(122,82,48,.15)]' },
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

// 貼上偵測用：Excel/Google Sheets 複製表格範圍時 clipboard 的 text/html 會帶 <table>。
// 解析成結構化列×欄資料；第一列若全是 <th> 視為表頭。
function parseHtmlTable(html: string): TableData | null {
  if (!/<table/i.test(html)) return null
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html')
    const table = doc.querySelector('table')
    if (!table) return null
    const rows: string[][] = []
    let hasHeader = false
    const trList = Array.from(table.querySelectorAll('tr'))
    trList.forEach((tr, idx) => {
      const cells = Array.from(tr.children).filter(
        (el): el is HTMLTableCellElement => el.tagName === 'TD' || el.tagName === 'TH',
      )
      if (cells.length === 0) return
      rows.push(cells.map((td) => (td.textContent ?? '').replace(/\s+/g, ' ').trim()))
      if (idx === 0 && cells.every((c) => c.tagName === 'TH')) hasHeader = true
    })
    return rows.length > 0 ? { rows, hasHeader } : null
  } catch {
    return null
  }
}

// 真表格渲染（非簡易文字表格），更新紀錄的送出預覽與清單顯示共用。
function UpdateTable({ data }: { data: TableData }) {
  const { rows, hasHeader } = data
  const headerRow = hasHeader ? rows[0] : null
  const bodyRows = hasHeader ? rows.slice(1) : rows
  return (
    <table className="w-full text-xs border-collapse">
      {headerRow && (
        <thead>
          <tr>
            {headerRow.map((cell, i) => (
              <th
                key={i}
                className="border border-[rgba(122,82,48,.15)] bg-[rgba(122,82,48,.06)] px-2 py-1.5 text-left font-semibold text-[#6b4f38] whitespace-pre-wrap"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {bodyRows.map((row, ri) => (
          <tr key={ri}>
            {row.map((cell, ci) => (
              <td
                key={ci}
                className="border border-[rgba(122,82,48,.1)] px-2 py-1.5 text-[#4a3422] whitespace-pre-wrap"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export default function IssueDetailDialog({
  open, issue, permissions, userEmail, allowedEmails,
  issueTypes, issueTags, onClose, onUpdated, onDeleteStart, onDeleteRollback, onDeleted, onTypesChange,
}: Props) {
  const [localIssue, setLocalIssue] = useState<Issue>(issue)
  const [updates, setUpdates] = useState<IssueUpdate[]>(issue.issue_updates ?? [])
  const [loadingUpdates, setLoadingUpdates] = useState(false)
  const [updateContent, setUpdateContent] = useState('')
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [pendingTable, setPendingTable] = useState<TableData | null>(null)
  const [submittingUpdate, setSubmittingUpdate] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [lightbox, setLightbox] = useState<{ images: { public_id: string; url: string }[]; index: number } | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const { upload: uploadAttachment } = useUpdateAttachmentUpload(issue.id)

  const canCreateIssues = permissions.includes('create_issues')
  const canEditIssue = permissions.includes('tracker_edit_issue')
  const canViewTracker = permissions.includes('view_tracker')
  const isAuthor = localIssue.created_by === userEmail
  const canFullEdit = (isAuthor && canCreateIssues) || canEditIssue
  const canDelete = isAuthor || canCreateIssues

  const [deletingUpdateId,     setDeletingUpdateId]     = useState<string | null>(null)

  const showToast = useCallback((msg: string) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2500)
  }, [])

  useEffect(() => {
    return () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current) }
  }, [])

  // 每次 open 時同步最新 issue 並載入 updates
  useEffect(() => {
    if (!open) return
    setLocalIssue(issue)
    setError(null)
    setUpdateContent('')
    setPendingImages([])
    setPendingTable(null)

    const hasInitialData = Array.isArray(issue.issue_updates)
    if (hasInitialData) {
      setUpdates(issue.issue_updates!)
    }

    const fetchUpdates = async () => {
      if (!hasInitialData) setLoadingUpdates(true)
      try {
        const res = await fetch(`/api/issues/${issue.id}`)
        if (res.ok) {
          const data = await res.json()
          const freshUpdates = data.issue_updates ?? []
          setUpdates(freshUpdates)
          const emails: string[] = (data.issue_assignees ?? []).map(
            (a: { user_email: string }) => a.user_email,
          )
          const updatedIssue = {
            ...issue,
            ...data,
            issue_updates: freshUpdates,
            issue_assignees: undefined,
            assignee_emails: emails,
            assignees: emails.map((e: string) => e.split('@')[0]),
          }
          setLocalIssue(prev => ({ ...updatedIssue, is_pinned: prev.is_pinned, issue_updates: undefined }))
          // fetchUpdates 不更新 is_pinned：避免非同步取得的舊值覆蓋樂觀更新結果
          onUpdated({ ...updatedIssue, is_pinned: undefined })
        }
      } catch {
        // silent
      } finally {
        setLoadingUpdates(false)
      }
    }
    fetchUpdates()
  }, [open, issue.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // 貼上偵測：圖片(image/*) → 上傳；表格(text/html 內含 <table>) → 解析成結構化資料。
  // 純文字貼上不攔截，交給瀏覽器預設行為直接插入 textarea。
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    const html = e.clipboardData.getData('text/html')
    const parsedTable = html ? parseHtmlTable(html) : null

    if (imageFiles.length === 0 && !parsedTable) return // 純文字：交給預設行為

    e.preventDefault()

    if (parsedTable) setPendingTable(parsedTable)

    for (const file of imageFiles) {
      const tempId = `pending-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setPendingImages((prev) => [...prev, { tempId, uploading: true }])
      const result = await uploadAttachment(file)
      setPendingImages((prev) => prev.map((p) => {
        if (p.tempId !== tempId) return p
        return result
          ? { ...p, uploading: false, public_id: result.public_id, url: result.url }
          : { ...p, uploading: false, error: '上傳失敗' }
      }))
    }
  }, [uploadAttachment])

  const removePendingImage = useCallback((tempId: string) => {
    setPendingImages((prev) => prev.filter((p) => p.tempId !== tempId))
  }, [])

  const hasUploadedImage = pendingImages.some((p) => p.public_id && p.url)
  const isUploadingAny = pendingImages.some((p) => p.uploading)
  const canSubmitUpdate = (updateContent.trim().length > 0 || hasUploadedImage || !!pendingTable) && !isUploadingAny

  const handleSubmitUpdate = useCallback(async () => {
    if (submittingUpdate || !canSubmitUpdate) return
    const content = updateContent.trim() || null
    const images = pendingImages
      .filter((p) => p.public_id && p.url)
      .map((p) => ({ public_id: p.public_id!, url: p.url! }))
    const table = pendingTable
    if (!content && images.length === 0 && !table) return

    // 失敗時用來復原輸入區內容，不弄丟使用者已貼好的圖片/表格
    const snapshotContent = updateContent
    const snapshotImages = pendingImages
    const snapshotTable = pendingTable

    const pendingId = `pending-${Date.now()}`
    const optimistic: IssueUpdate = {
      id: pendingId,
      content,
      image_urls: images,
      table_data: table,
      created_by: userEmail,
      created_at: new Date().toISOString(),
    }
    setUpdates((prev) => [optimistic, ...prev])
    setUpdateContent('')
    setPendingImages([])
    setPendingTable(null)
    setError(null)
    setSubmittingUpdate(true)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}/updates`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, image_urls: images, table_data: table }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '新增更新紀錄失敗')
        setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
        setUpdateContent(snapshotContent)
        setPendingImages(snapshotImages)
        setPendingTable(snapshotTable)
        return
      }
      const real: IssueUpdate = await res.json()
      let nextUpdates: IssueUpdate[] = []
      setUpdates((prev) => {
        nextUpdates = prev.map((u) => u.id === pendingId ? real : u)
        return nextUpdates
      })
      onUpdated({ ...issue, issue_updates: nextUpdates })
    } catch {
      setError('新增更新紀錄失敗，請重試')
      setUpdates((prev) => prev.filter((u) => u.id !== pendingId))
      setUpdateContent(snapshotContent)
      setPendingImages(snapshotImages)
      setPendingTable(snapshotTable)
    } finally {
      setSubmittingUpdate(false)
    }
  }, [submittingUpdate, canSubmitUpdate, updateContent, pendingImages, pendingTable, localIssue.id, userEmail, issue, onUpdated])

  const handleDelete = useCallback(async () => {
    setDeleting(true)
    setError(null)
    // 樂觀更新：立即從 banner 移除，dialog 保持開著
    onDeleteStart(localIssue.id)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '刪除失敗')
        onDeleteRollback(localIssue)
        return
      }
      onDeleted(localIssue.id)
    } catch {
      setError('刪除失敗，請重試')
      onDeleteRollback(localIssue)
    } finally {
      setDeleting(false)
      setConfirmDeleteOpen(false)
    }
  }, [localIssue, onDeleteStart, onDeleteRollback, onDeleted])

  const handleEditUpdated = useCallback((updated: Issue) => {
    setLocalIssue(updated)
    setEditOpen(false)
    onUpdated(updated)
  }, [onUpdated])

  const handleTogglePin = useCallback(async () => {
    const nextPinned = !localIssue.is_pinned
    // 樂觀更新：立即同步 dialog 與 TrackerClient 的 issues state（Banner 即時出現/消失）
    setLocalIssue(prev => ({ ...prev, is_pinned: nextPinned }))
    onUpdated({ ...localIssue, is_pinned: nextPinned, issue_updates: updates })
    try {
      const res = await fetch(`/api/issues/${localIssue.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_pinned: nextPinned }),
      })
      if (!res.ok) {
        // 回滾
        setLocalIssue(prev => ({ ...prev, is_pinned: !nextPinned }))
        onUpdated({ ...localIssue, is_pinned: !nextPinned, issue_updates: updates })
        return
      }
      const updated = await res.json()
      onUpdated({ ...updated, issue_updates: updates })
    } catch {
      // 回滾
      setLocalIssue(prev => ({ ...prev, is_pinned: !nextPinned }))
      onUpdated({ ...localIssue, is_pinned: !nextPinned, issue_updates: updates })
    }
  }, [localIssue, updates, onUpdated])

  const handleDeleteUpdate = useCallback(async (updateId: string) => {
    setDeletingUpdateId(updateId)
    try {
      const res = await fetch(`/api/issues/${localIssue.id}/updates/${updateId}`, {
        method: 'DELETE',
      })
      if (!res.ok) { setError('刪除失敗'); return }
      const data = await res.json().catch(() => null)
      if (data?.warning) showToast(data.warning)
      let nextUpdates: IssueUpdate[] = []
      setUpdates((prev) => {
        nextUpdates = prev.filter((u) => u.id !== updateId)
        return nextUpdates
      })
      onUpdated({ ...issue, issue_updates: nextUpdates })
    } catch {
      setError('刪除失敗，請重試')
    } finally {
      setDeletingUpdateId(null)
    }
  }, [localIssue.id, issue, onUpdated, showToast])

  const openLightbox = useCallback((images: { public_id: string; url: string }[], index: number) => {
    setLightbox({ images, index })
  }, [])

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
              <span className={`text-xs px-2 py-1 rounded-full border font-medium ${STATUS_BADGE[localIssue.status] ?? 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {localIssue.status}
              </span>
              <button
                onClick={handleTogglePin}
                title={localIssue.is_pinned ? '取消公告' : '設為公告'}
                className={`p-1.5 rounded-lg transition-colors ${
                  localIssue.is_pinned
                    ? 'text-[#7a5230] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)]'
                    : 'text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)]'
                }`}
              >
                <Pin className={`h-4 w-4 ${localIssue.is_pinned ? 'fill-current' : ''}`} />
              </button>
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
                {PRIORITY_PILL[localIssue.priority] ? (
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${PRIORITY_PILL[localIssue.priority].cls}`}>
                    {PRIORITY_PILL[localIssue.priority].label}
                  </span>
                ) : (
                  <span className="text-sm text-[#4a3422]">{localIssue.priority}</span>
                )}
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
              <div>
                <p className="text-xs text-[#a08060] mb-1">最後更新</p>
                <p className="text-sm text-[#4a3422]">{formatDatetime(localIssue.updated_at)}</p>
              </div>
              <div>
                <p className="text-xs text-[#a08060] mb-1">更新人員</p>
                <p className="text-sm text-[#4a3422]">
                  {localIssue.updated_by ? localIssue.updated_by.split('@')[0] : '—'}
                </p>
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
                <div className="space-y-2 animate-pulse">
                  {([48, 36, 48] as number[]).map((w, i) => (
                    <div key={i} className="rounded-lg bg-[rgba(122,82,48,.07)] px-3 py-2.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-3 rounded bg-[rgba(122,82,48,.12)]" style={{ width: '60px' }} />
                        <div className="h-3 rounded bg-[rgba(122,82,48,.07)]" style={{ width: '80px' }} />
                      </div>
                      <div className="h-3 rounded bg-[rgba(122,82,48,.1)]" style={{ width: `${w}%` }} />
                    </div>
                  ))}
                </div>
              )}
              {!loadingUpdates && updates.length === 0 && (
                <p className="text-xs text-[#c0a882] py-2">尚無更新紀錄</p>
              )}
              {!loadingUpdates && updates.length > 0 && (
                <div className="space-y-2">
                  {updates.map((upd) => {
                    const canDeleteThis = upd.created_by === userEmail || canCreateIssues
                    const isDeleting = deletingUpdateId === upd.id
                    const images = upd.image_urls ?? []
                    return (
                      <div
                        key={upd.id}
                        className="rounded-lg bg-white border border-[rgba(122,82,48,.1)] px-3 py-2.5 group"
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-medium text-[#7a5230]">
                            {upd.created_by.split('@')[0]}
                          </span>
                          <span className="text-xs text-[#c0a882]">
                            {formatDatetime(upd.created_at)}
                          </span>
                          {canDeleteThis && (
                            <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => handleDeleteUpdate(upd.id)}
                                disabled={isDeleting}
                                className="p-1 rounded text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.06)] transition-colors disabled:opacity-50"
                                title="刪除"
                              >
                                {isDeleting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                              </button>
                            </div>
                          )}
                        </div>
                        {upd.content && (
                          <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap">
                            {upd.content}
                          </p>
                        )}
                        {images.length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            {images.map((img, idx) => (
                              <button
                                key={img.public_id}
                                type="button"
                                onClick={() => openLightbox(images, idx)}
                                className="w-16 h-16 rounded-lg overflow-hidden border border-[rgba(122,82,48,.15)] hover:opacity-80 transition-opacity"
                                title="點擊放大"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img.url} alt="" className="w-full h-full object-cover" />
                              </button>
                            ))}
                          </div>
                        )}
                        {upd.table_data && (
                          <div className="mt-2 border border-[rgba(122,82,48,.12)] rounded-lg overflow-x-auto">
                            <UpdateTable data={upd.table_data} />
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* 新增更新紀錄 */}
            {canViewTracker && (
              <div className="space-y-2">
                <textarea
                  ref={textareaRef}
                  value={updateContent}
                  onChange={(e) => setUpdateContent(e.target.value)}
                  onPaste={handlePaste}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && canSubmitUpdate) {
                      e.preventDefault()
                      handleSubmitUpdate()
                    }
                  }}
                  placeholder="新增更新紀錄…（可貼上圖片或 Excel/表格範圍，Ctrl+Enter 送出）"
                  rows={10}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                />

                {pendingImages.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {pendingImages.map((img) => (
                      <div
                        key={img.tempId}
                        className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#e8ddd0] bg-white"
                      >
                        {img.uploading ? (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="h-4 w-4 animate-spin text-[#a08060]" />
                          </div>
                        ) : img.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={img.url} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-center text-[9px] text-[#b5451b] px-1 leading-tight">
                            {img.error ?? '失敗'}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => removePendingImage(img.tempId)}
                          className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                          title="移除"
                        >
                          <X className="h-2.5 w-2.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {pendingTable && (
                  <div className="relative border border-[#e8ddd0] rounded-lg overflow-x-auto bg-white">
                    <button
                      type="button"
                      onClick={() => setPendingTable(null)}
                      className="absolute top-1 right-1 z-10 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                      title="移除表格"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                    <UpdateTable data={pendingTable} />
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={handleSubmitUpdate}
                    disabled={!canSubmitUpdate || submittingUpdate}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
          canManageIssueTypes={canCreateIssues || canEditIssue}
          onClose={() => setEditOpen(false)}
          onUpdated={handleEditUpdated}
          onTypesChange={onTypesChange}
        />
      )}

      {/* 刪除確認 */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={`刪除任務「${localIssue.title}」？`}
        message="刪除後無法復原，包含所有更新紀錄。"
        confirmLabel="刪除"
        danger
        onConfirm={handleDelete}
        onCancel={() => setConfirmDeleteOpen(false)}
      />

      {/* 更新紀錄圖片放大檢視 */}
      {lightbox && (
        <UpdateImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((prev) => prev ? { ...prev, index: i } : prev)}
          onClose={() => setLightbox(null)}
        />
      )}

      {/* 輕量 toast：刪除更新紀錄時 Cloudinary 清除失敗的非阻塞提示，2.5 秒後自動消失 */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] bg-[#4a3422] text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  )
}
