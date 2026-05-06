'use client'

import { useState, useRef, useEffect } from 'react'
import { Settings, X, Plus } from 'lucide-react'

interface Props {
  settingKey: 'categories' | 'statuses'
  items: string[]
  /** 按「確認」後回傳最新清單（不呼叫 API，由 CardFormDialog 統一儲存） */
  onConfirm: (newItems: string[]) => void
  disabled?: boolean
}

export default function SettingsPopover({ settingKey, items, onConfirm, disabled }: Props) {
  const [open, setOpen]   = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [input, setInput] = useState('')

  const btnRef   = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })

  function openPopover() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, left: r.left })
    }
    setDraft([...items])
    setInput('')
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handler(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        btnRef.current   && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  function handleAdd() {
    const val = input.trim()
    if (!val || draft.includes(val)) return
    setDraft(prev => [...prev, val])
    setInput('')
  }

  function handleDelete(item: string) {
    setDraft(prev => prev.filter(i => i !== item))
  }

  function handleConfirm() {
    onConfirm(draft)
    setOpen(false)
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(items)

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={openPopover}
        disabled={disabled}
        className="text-gray-400 hover:text-blue-500 disabled:opacity-40 transition-colors"
        title="管理選項"
      >
        <Settings className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-52 bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex flex-col gap-2"
        >
          <p className="text-xs font-medium text-gray-500">
            {settingKey === 'categories' ? '分類選項' : '狀態選項'}
            <span className="ml-1 text-gray-400 font-normal">（存檔時一起儲存）</span>
          </p>

          <ul className="space-y-1 max-h-48 overflow-y-auto">
            {draft.map((item, idx) => (
              <li key={item} className="flex items-center gap-1">
                <span className="text-sm text-gray-800 truncate flex-1">{item}</span>
                {!(settingKey === 'statuses' && idx === 0) && (
                  <button
                    type="button"
                    onClick={() => handleDelete(item)}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
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
              className="flex-1 min-w-0 text-xs border border-gray-200 rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-400"
            />
            <button
              type="button"
              onClick={handleAdd}
              disabled={!input.trim()}
              className="p-1 rounded-md bg-gray-100 hover:bg-gray-200 disabled:opacity-40 transition-colors flex-shrink-0"
              title="加入清單"
            >
              <Plus className="h-3.5 w-3.5 text-gray-600" />
            </button>
          </div>

          <div className="flex gap-2 pt-1 border-t border-gray-100">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="flex-1 text-xs text-gray-500 hover:text-gray-700 py-1 transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!dirty}
              className="flex-1 text-xs font-medium bg-blue-600 text-white rounded-md py-1 hover:bg-blue-700 disabled:opacity-40 transition-colors"
            >
              確認
            </button>
          </div>
        </div>
      )}
    </>
  )
}
