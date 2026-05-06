'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, X, Plus, Loader2 } from 'lucide-react'

interface Props {
  /** 'categories' | 'statuses' */
  settingKey: 'categories' | 'statuses'
  items: string[]
  /** 儲存成功後回傳最新清單 */
  onSaved: (newItems: string[]) => void
  disabled?: boolean
}

export default function SettingsPopover({ settingKey, items, onSaved, disabled }: Props) {
  const [open, setOpen]       = useState(false)
  const [input, setInput]     = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const containerRef          = useRef<HTMLDivElement>(null)

  // 點外面關閉
  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  async function save(newItems: string[]) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/settings', {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: settingKey, value: newItems }),
      })
      if (!res.ok) { setError('儲存失敗'); return }
      onSaved(newItems)
    } catch {
      setError('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleAdd() {
    const val = input.trim()
    if (!val || items.includes(val)) return
    setInput('')
    await save([...items, val])
  }

  async function handleDelete(item: string) {
    await save(items.filter(i => i !== item))
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => { setOpen(v => !v); setError(null) }}
        disabled={disabled}
        className="text-gray-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
        title="管理選項"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-6 z-[200] w-52 bg-white border border-gray-200 rounded-xl shadow-lg p-3 flex flex-col gap-2">
          <p className="text-xs font-medium text-gray-500 mb-1">
            {settingKey === 'categories' ? '分類選項' : '狀態選項'}
          </p>

          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {items.map((item, idx) => (
              <li key={item} className="flex items-center justify-between gap-1 group">
                <span className="text-sm text-gray-800 truncate flex-1">{item}</span>
                {/* 第一個狀態為預設，不可刪 */}
                {!(settingKey === 'statuses' && idx === 0) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    disabled={saving}
                    className="text-gray-300 hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>

          <div className="flex gap-1 pt-1 border-t border-gray-100">
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAdd() } }}
              placeholder="新增選項…"
              className="flex-1 text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={saving || !input.trim()}
              className="p-1 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors flex-shrink-0"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            </button>
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      )}
    </div>
  )
}
