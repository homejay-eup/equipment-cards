'use client'

import { useState, useRef, useEffect } from 'react'
import type { DragEvent } from 'react'
import { Settings, X, Plus, Check, Loader2, GripVertical } from 'lucide-react'
import { MaintenanceExitOption } from '@/types/maintenance'
import { MAX_EXIT_OPTION_LENGTH, MAX_EXIT_OPTIONS_COUNT } from '@/lib/maintenanceFormat'
import { getDropPosition, reorderByPosition, type DropPosition } from '@/lib/dragReorder'

interface Props {
  options: MaintenanceExitOption[]
  /** 儲存成功後回傳最新清單（API 沒回清單時為 null，由父層自行重抓） */
  onSaved: (options: MaintenanceExitOption[] | null) => void
}

// 「處理後去向」選項管理：齒輪開彈出面板，可新增（Enter 或加號）、刪除、拖曳排序，
// 按儲存才呼叫 PUT /api/maintenance/options 整批覆蓋（互動比照 SettingsPopover）。
// 面板以 absolute 定位在齒輪旁，不 portal；呼叫端的容器不可設 overflow-hidden。
export default function ExitOptionsManager({ options, onSaved }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragLabel, setDragLabel] = useState<string | null>(null)
  const [dropHint, setDropHint] = useState<{ label: string; position: DropPosition } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function openPanel() {
    setDraft(options.map(o => o.label))
    setInput('')
    setError(null)
    setOpen(true)
  }

  function handleAdd() {
    const val = input.trim()
    if (!val) return
    if (val.length > MAX_EXIT_OPTION_LENGTH) { setError(`單一選項不可超過 ${MAX_EXIT_OPTION_LENGTH} 字`); return }
    if (draft.includes(val)) { setError('此選項已存在'); return }
    if (draft.length >= MAX_EXIT_OPTIONS_COUNT) { setError(`最多 ${MAX_EXIT_OPTIONS_COUNT} 個選項`); return }
    setDraft(prev => [...prev, val])
    setInput('')
    setError(null)
  }

  function handleDragOver(e: DragEvent<HTMLLIElement>, label: string) {
    if (dragLabel === null) return
    e.preventDefault()
    setDropHint({ label, position: getDropPosition(e) })
  }

  function handleDrop(e: DragEvent<HTMLLIElement>, label: string) {
    e.preventDefault()
    if (dragLabel !== null) {
      const pos = getDropPosition(e)
      setDraft(prev => reorderByPosition(prev, dragLabel, label, pos, s => s))
    }
    setDragLabel(null)
    setDropHint(null)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/maintenance/options', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ options: draft }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? '儲存失敗'); return }
      onSaved(Array.isArray(data?.options) ? data.options : null)
      setOpen(false)
    } catch {
      setError('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(options.map(o => o.label))

  return (
    <div ref={wrapRef} className="relative flex-shrink-0">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        title="管理處理後去向選項"
        aria-label="管理處理後去向選項"
        className="inline-flex items-center justify-center p-1.5 text-[#a08060] hover:text-[#7a5230] border border-[rgba(122,82,48,.2)] rounded-lg transition-colors"
      >
        <Settings className="h-[15px] w-[15px]" />
      </button>

      {open && (
        <div className="absolute z-30 right-0 top-full mt-1 w-56 p-3 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-xl shadow-[0_8px_30px_rgba(122,82,48,.18)] flex flex-col gap-2">
          <p className="text-xs font-semibold text-[#7a5230]">處理後去向選項</p>

          <ul className="space-y-1 max-h-44 overflow-y-auto">
            {draft.length === 0 && <li className="text-xs text-[#a08060] px-1">尚無選項</li>}
            {draft.map(label => {
              const hint = dropHint?.label === label && dragLabel !== null && dragLabel !== label ? dropHint.position : null
              return (
                <li
                  key={label}
                  draggable
                  onDragStart={() => setDragLabel(label)}
                  onDragOver={e => handleDragOver(e, label)}
                  onDrop={e => handleDrop(e, label)}
                  onDragEnd={() => { setDragLabel(null); setDropHint(null) }}
                  className={`group flex items-center gap-1 px-1 py-0.5 rounded hover:bg-[rgba(122,82,48,.05)] transition-colors border-y-2 border-transparent ${
                    hint === 'before' ? '!border-t-[#c49a72]' : hint === 'after' ? '!border-b-[#c49a72]' : ''
                  } ${dragLabel === label ? 'opacity-50' : ''}`}
                >
                  <GripVertical className="h-3.5 w-3.5 text-[#d4bda0] cursor-grab flex-shrink-0" aria-hidden="true" />
                  <span className="text-sm text-[#2c1e12] truncate flex-1">{label}</span>
                  <button
                    type="button"
                    onClick={() => setDraft(prev => prev.filter(l => l !== label))}
                    title="刪除此選項"
                    aria-label={`刪除選項「${label}」`}
                    className="text-[#c49a72] hover:text-[#b5451b] transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="flex gap-1 pt-2 border-t border-[rgba(122,82,48,.12)]">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="新增選項…"
              maxLength={MAX_EXIT_OPTION_LENGTH}
              className="flex-1 min-w-0 text-xs border border-[#e8ddd0] rounded-md px-2 py-1.5 bg-[#faf6f0] text-[#2c1e12] placeholder:text-[#a08060] focus:outline-none focus:border-[#c49a72]"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!input.trim()}
              title="加入清單"
              aria-label="加入清單"
              className="p-1.5 rounded-md border border-[rgba(122,82,48,.2)] text-[#6b4f38] hover:bg-[rgba(122,82,48,.07)] disabled:opacity-40 transition-colors flex-shrink-0"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {error && <p className="text-xs text-[#b5451b]">{error}</p>}

          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={() => setOpen(false)}
              disabled={saving}
              title="取消"
              aria-label="取消"
              className="inline-flex items-center justify-center p-1.5 text-[#a08060] hover:text-[#7a5230] rounded-lg hover:bg-[rgba(122,82,48,.07)] disabled:opacity-40 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !dirty}
              title="儲存選項"
              aria-label="儲存選項"
              className="inline-flex items-center justify-center p-1.5 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-40 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
