'use client'

import { useState } from 'react'
import { Pencil, X, Plus, Loader2 } from 'lucide-react'

interface SubfilterTagBarProps {
  category: string
  tags: string[]
  selectedTags: string[]
  onTagToggle: (tag: string) => void
  canManage: boolean
  onTagsUpdated: (category: string, newTags: string[]) => void
}

export default function SubfilterTagBar({
  category,
  tags,
  selectedTags,
  onTagToggle,
  canManage,
  onTagsUpdated,
}: SubfilterTagBarProps) {
  const [editOpen, setEditOpen] = useState(false)
  const [editTags, setEditTags] = useState<string[]>(tags)
  const [inputValue, setInputValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  // 用 index 而非標籤字串本身記錄拖曳來源/目標，避免萬一出現重複標籤字串時 indexOf 抓錯位置
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)

  function openEdit() {
    setEditTags([...tags])
    setInputValue('')
    setSaveError('')
    setEditOpen(true)
  }

  function closeEdit() {
    setEditOpen(false)
    setInputValue('')
    setSaveError('')
  }

  function addTag() {
    const val = inputValue.trim()
    if (!val) return
    if (editTags.includes(val)) {
      setInputValue('')
      return
    }
    setEditTags(prev => [...prev, val])
    setInputValue('')
  }

  function removeEditTag(tag: string) {
    setEditTags(prev => prev.filter(t => t !== tag))
  }

  function handleTagReorder(fromIdx: number, toIdx: number) {
    if (fromIdx === toIdx) return
    setEditTags(prev => {
      const reordered = [...prev]
      const [dragged] = reordered.splice(fromIdx, 1)
      reordered.splice(toIdx, 0, dragged)
      return reordered
    })
    setDraggingIndex(null)
    setDragOverIndex(null)
  }

  function handleInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  async function handleSave() {
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/subfilter-tags/${encodeURIComponent(category)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: editTags }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setSaveError(body.error ?? '儲存失敗，請重試')
        return
      }
      onTagsUpdated(category, editTags)
      setEditOpen(false)
    } catch {
      setSaveError('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      {/* 次級篩選 chip 列 */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-[#a08060] mr-0.5 shrink-0">次級篩選：</span>
        {tags.map(tag => {
          const isSelected = selectedTags.includes(tag)
          return (
            <button
              key={tag}
              onClick={() => onTagToggle(tag)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all duration-200 ${
                isSelected
                  ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_8px_rgba(122,82,48,.4)]'
                  : 'bg-white text-[#7a5230] border-[#c49a72] hover:bg-[rgba(122,82,48,.06)] hover:shadow-[0_0_6px_rgba(122,82,48,.2)]'
              }`}
            >
              {tag}
            </button>
          )
        })}
        {canManage && !editOpen && (
          <button
            onClick={openEdit}
            title="編輯次級標籤"
            className="flex items-center justify-center w-6 h-6 text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.08)] rounded-full transition-colors"
          >
            <Pencil size={14} />
          </button>
        )}
      </div>

      {/* 編輯區（inline） */}
      {editOpen && (
        <div className="mt-1 p-3 bg-white border border-[rgba(122,82,48,.2)] rounded-xl shadow-sm">
          {/* 已加入的 tag chips */}
          <div className="flex flex-wrap gap-1.5 mb-2 min-h-[28px]">
            {editTags.length === 0 && (
              <span className="text-xs text-[#c0a882] italic">尚無標籤</span>
            )}
            {editTags.map((tag, idx) => (
              <span
                key={`${tag}-${idx}`}
                draggable
                onDragStart={() => setDraggingIndex(idx)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIndex(idx) }}
                onDrop={(e) => { e.preventDefault(); if (draggingIndex !== null) handleTagReorder(draggingIndex, idx) }}
                onDragEnd={() => { setDraggingIndex(null); setDragOverIndex(null) }}
                className={`flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)] cursor-grab ${
                  draggingIndex !== null && dragOverIndex === idx ? 'ring-2 ring-[#c49a72]' : ''
                }`}
              >
                {tag}
                <button
                  onClick={() => removeEditTag(tag)}
                  className="text-[#a08060] hover:text-[#7a5230] transition-colors"
                  aria-label={`移除 ${tag}`}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>

          {/* 輸入框 */}
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="輸入標籤名稱，按 Enter 新增"
              className="flex-1 px-3 py-1.5 text-xs border border-[rgba(122,82,48,.2)] rounded-lg bg-[#faf6f0] text-[#4a3422] placeholder-[#c0a882] focus:outline-none focus:border-[#c49a72] focus:ring-1 focus:ring-[rgba(122,82,48,.15)]"
            />
            <button
              onClick={addTag}
              disabled={!inputValue.trim()}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)] rounded-lg hover:bg-[rgba(122,82,48,.14)] disabled:opacity-40 transition-colors"
            >
              <Plus size={12} />
              新增
            </button>
          </div>

          {saveError && (
            <p className="text-xs text-red-500 mb-2">{saveError}</p>
          )}

          {/* 操作按鈕 */}
          <div className="flex gap-2 justify-end">
            <button
              onClick={closeEdit}
              className="px-3 py-1.5 text-xs text-[#a08060] hover:text-[#7a5230] transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={12} className="animate-spin" />}
              儲存
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
