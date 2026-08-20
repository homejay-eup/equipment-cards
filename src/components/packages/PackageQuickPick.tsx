'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { Search, Loader2 } from 'lucide-react'

interface PickablePackage {
  id: string
  name: string
}

// 複選版組合挑選器：依料號檢視展開列裡「+ 掛載到其他組合」用。
// 比照 documents/EquipmentQuickPick.tsx 的打勾＋批次送出模式。
export default function PackageQuickPick({
  packages, excludeIds = [], onPickMany, disabled,
}: {
  packages: PickablePackage[]
  excludeIds?: string[]
  onPickMany: (packageIds: string[]) => void | Promise<void>
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const candidates = useMemo(
    () => packages.filter(p => !excludeIds.includes(p.id)),
    [packages, excludeIds],
  )

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return candidates
    return candidates.filter(p => p.name.toLowerCase().includes(q))
  }, [query, candidates])

  function toggle(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function reset() {
    setOpen(false)
    setQuery('')
    setSelectedIds(new Set())
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      await onPickMany(Array.from(selectedIds))
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => !disabled && setOpen(v => !v)} disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
        <Search className="h-3 w-3" />
        + 新增到其他組合
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden">
          <div className="p-2 border-b border-[rgba(122,82,48,.1)]">
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜尋組合名稱…" autoFocus disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#a08060]">沒有可掛載的組合</p>
            ) : results.map(p => {
              const checked = selectedIds.has(p.id)
              return (
                <label key={p.id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.06)]">
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.id)}
                    disabled={submitting} className="accent-[#7a5230]" />
                  <span className="truncate text-[#4a3422]">{p.name}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 p-2 border-t border-[rgba(122,82,48,.1)]">
            <button type="button" onClick={reset} disabled={submitting}
              className="text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">取消</button>
            <button type="button" onClick={handleConfirm} disabled={selectedIds.size === 0 || submitting}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#6b4530] disabled:opacity-40 transition-colors">
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              確認掛載（已選 {selectedIds.size}）
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
