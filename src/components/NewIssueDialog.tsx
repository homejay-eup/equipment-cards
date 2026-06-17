'use client'

import { useState, useCallback, useEffect } from 'react'
import { X, Loader2, Plus, Check } from 'lucide-react'
import type { Issue } from '@/app/tracker/page'
import SettingsPopover from '@/components/SettingsPopover'
import DatePicker from '@/components/DatePicker'

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (issue: Issue) => void
  issueTypes: string[]
  issueTags: string[]
  allowedEmails: string[]
  userEmail?: string
  defaultStatus?: string
  onTypesChange?: (types: string[]) => void
}

export default function NewIssueDialog({
  open, onClose, onCreated, issueTypes, issueTags, allowedEmails, defaultStatus, onTypesChange,
}: Props) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [status, setStatus] = useState('待處理')
  const [dueDate, setDueDate] = useState('')
  const [description, setDescription] = useState('')
  const [selectedAssignees, setSelectedAssignees] = useState<string[]>([])
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [localIssueTypes, setLocalIssueTypes] = useState<string[]>(issueTypes)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { setLocalIssueTypes(issueTypes) }, [issueTypes])
  const [error, setError] = useState<string | null>(null)
  const [assigneeInput, setAssigneeInput] = useState('')
  const [tagInput, setTagInput] = useState('')

  const reset = useCallback(() => {
    setTitle('')
    setType('')
    setPriority('medium')
    setStatus(defaultStatus ?? '待處理')
    setDueDate('')
    setDescription('')
    setSelectedAssignees([])
    setSelectedTags([])
    setError(null)
    setAssigneeInput('')
    setTagInput('')
  }, [defaultStatus])

  const handleClose = useCallback(() => {
    reset()
    onClose()
  }, [reset, onClose])

  const toggleAssignee = useCallback((email: string) => {
    setSelectedAssignees((prev) =>
      prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email],
    )
  }, [])

  const toggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    )
  }, [])

  const filteredEmails = allowedEmails.filter((e) =>
    assigneeInput === '' || e.toLowerCase().includes(assigneeInput.toLowerCase()),
  )

  const filteredTags = issueTags.filter((t) =>
    tagInput === '' || t.toLowerCase().includes(tagInput.toLowerCase()),
  )

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault()
    if (!title.trim()) { setError('標題為必填'); return }
    if (!type) { setError('類型為必填'); return }

    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          type,
          priority,
          status,
          due_date: dueDate || null,
          description: description.trim() || null,
          tags: selectedTags,
          assignees: selectedAssignees,
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '建立失敗')
        return
      }
      const newIssue = await res.json()
      const issue: Issue = {
        ...newIssue,
        issue_assignees: undefined,
        issue_updates: undefined,
        assignee_emails: selectedAssignees,
        assignees: selectedAssignees.map((e) => e.split('@')[0]),
        tags: selectedTags,
      }
      onCreated(issue)
      reset()
    } catch {
      setError('建立失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }, [title, type, priority, status, dueDate, description, selectedTags, selectedAssignees, onCreated, reset])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4 py-6"
    >
      <div
        className="bg-[#fff9f4] rounded-2xl shadow-[0_0_40px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[rgba(122,82,48,.1)]">
          <h2 className="text-base font-semibold text-[#2c1e12]">新增任務</h2>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 rounded-lg text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 標題 */}
          <div>
            <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">
              標題 <span className="text-[#b5451b]">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="任務標題"
              required
              disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
            />
          </div>

          {/* 類型 + 優先度 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-xs font-semibold text-[#6b4f38] mb-1.5">
                類型 <span className="text-[#b5451b]">*</span>
                <SettingsPopover
                  settingKey="issueTypes"
                  items={localIssueTypes}
                  onConfirm={(newTypes) => {
                    setLocalIssueTypes(newTypes)
                    onTypesChange?.(newTypes)
                    if (!newTypes.includes(type)) setType(newTypes[0] ?? '')
                  }}
                />
              </label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                required
                disabled={submitting}
                className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
              >
                <option value="">請選擇</option>
                {localIssueTypes.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">優先度</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low')}
                disabled={submitting}
                className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
              >
                <option value="high">緊急</option>
                <option value="medium">重要</option>
                <option value="low">普通</option>
              </select>
            </div>
          </div>

          {/* 狀態 + 預計日期 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">狀態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                disabled={submitting}
                className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
              >
                {['待處理', '進行中', '等待中', '已完成'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">預計日期</label>
              <DatePicker value={dueDate} onChange={setDueDate} disabled={submitting} />
            </div>
          </div>

          {/* 說明 */}
          <div>
            <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">說明</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="任務說明（選填）"
              rows={5}
              disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all resize-none"
            />
          </div>

          {/* 負責人多選 */}
          <div>
            <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">負責人</label>
            {selectedAssignees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedAssignees.map((email) => (
                  <span
                    key={email}
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]"
                  >
                    {email.split('@')[0]}
                    <button
                      type="button"
                      onClick={() => toggleAssignee(email)}
                      className="ml-0.5 hover:text-[#b5451b] transition-colors"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <input
              type="text"
              value={assigneeInput}
              onChange={(e) => setAssigneeInput(e.target.value)}
              placeholder="搜尋成員…"
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all mb-1.5"
            />
            <div className="max-h-56 overflow-y-auto border border-[rgba(122,82,48,.1)] rounded-lg bg-white divide-y divide-[rgba(122,82,48,.06)]">
              {filteredEmails.length === 0 && (
                <p className="text-xs text-[#c0a882] px-3 py-2">無符合成員</p>
              )}
              {filteredEmails.map((email) => (
                <button
                  key={email}
                  type="button"
                  onClick={() => toggleAssignee(email)}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left hover:bg-[rgba(122,82,48,.04)] transition-colors"
                >
                  <span
                    className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                      selectedAssignees.includes(email)
                        ? 'bg-[#7a5230] border-[#7a5230]'
                        : 'border-[#d0b898]'
                    }`}
                  >
                    {selectedAssignees.includes(email) && (
                      <Check className="h-2.5 w-2.5 text-white" />
                    )}
                  </span>
                  <span className="text-[#4a3422]">{email.split('@')[0]}</span>
                  <span className="text-xs text-[#c0a882] truncate">{email}</span>
                </button>
              ))}
            </div>
          </div>

          {/* 標籤多選 */}
          {issueTags.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-[#6b4f38] mb-1.5 block">標籤</label>
              {selectedTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {selectedTags.map((tag) => (
                    <span
                      key={tag}
                      className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.15)]"
                    >
                      {tag}
                      <button
                        type="button"
                        onClick={() => toggleTag(tag)}
                        className="ml-0.5 hover:text-[#b5451b] transition-colors"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {filteredTags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(tag)}
                    className={`text-xs px-2 py-0.5 rounded-full border transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-[rgba(122,82,48,.15)] text-[#7a5230] border-[rgba(122,82,48,.3)]'
                        : 'bg-white text-[#6b4f38] border-[rgba(122,82,48,.2)] hover:bg-[rgba(122,82,48,.06)]'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
              {error}
            </p>
          )}
        </form>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[rgba(122,82,48,.1)] bg-[#faf6f0]">
          <button
            type="button"
            onClick={handleClose}
            className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => handleSubmit()}
            disabled={submitting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-40 transition-colors"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            新增
          </button>
        </div>
      </div>
    </div>
  )
}
