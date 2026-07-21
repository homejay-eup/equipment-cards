'use client'

import { useState } from 'react'
import { X, Loader2, Check } from 'lucide-react'

interface Department {
  id: string
  name: string
}

interface Props {
  packageCount: number
  departments: Department[]
  currentDepartmentId: string | null
  // 目前這批套餐已分享的部門交集（全部相同才預先勾選，避免誤導）
  initialSelected: string[]
  onConfirm: (departmentIds: string[]) => Promise<void>
  onCancel: () => void
}

// 批次「分享至部門」彈窗：部門多選 + 全選 checkbox，一次套用到所有勾選的套餐（全量覆蓋）
export default function ShareDepartmentsDialog({
  packageCount, departments, currentDepartmentId, initialSelected, onConfirm, onCancel,
}: Props) {
  const selectable = departments.filter(d => d.id !== currentDepartmentId)
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected))
  const [saving, setSaving] = useState(false)

  function toggle(id: string) {
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleAll() {
    setSelected(prev => prev.size === selectable.length ? new Set() : new Set(selectable.map(d => d.id)))
  }

  async function handleConfirm() {
    setSaving(true)
    try {
      await onConfirm(Array.from(selected))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between flex-shrink-0">
          <p className="text-sm font-semibold text-[#5a3820]">分享至部門（{packageCount} 份套餐）</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-2 flex-shrink-0 border-b border-[rgba(122,82,48,.08)]">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-[#7a5230] font-medium">
            <input
              type="checkbox"
              checked={selectable.length > 0 && selected.size === selectable.length}
              onChange={toggleAll}
              className="accent-[#7a5230]"
            />
            全選
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2 min-h-0">
          {selectable.length === 0 ? (
            <p className="text-xs text-[#a08060] py-6 text-center">沒有其他部門可分享</p>
          ) : (
            <div className="space-y-1">
              {selectable.map(d => (
                <label key={d.id} className="flex items-center gap-2 cursor-pointer px-1 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={selected.has(d.id)}
                    onChange={() => toggle(d.id)}
                    className="accent-[#7a5230]"
                  />
                  <span className="text-[#4a3422]">{d.name}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="px-4 py-3 border-t border-[rgba(122,82,48,.1)] flex gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            確認分享
          </button>
        </div>
      </div>
    </div>
  )
}
