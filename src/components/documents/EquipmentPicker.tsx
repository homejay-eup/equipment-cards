'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import { Search, ChevronDown } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'

// 料卡多選挑選器：搜尋 + 勾選清單，樣式比照全站既有下拉/彈窗風格（FieldSelect / SubfilterTagBar）
// 抽出為共用元件（原本內嵌在 DocumentsClient.tsx），供批次上傳每一列與其他料卡選擇情境共用
export default function EquipmentPicker({
  allCards, selectedIds, onChange, disabled,
}: {
  allCards: EquipmentCard[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const fuse = useMemo(() => new Fuse(allCards, {
    keys: [{ name: 'equipment_id', weight: 2 }, { name: 'name', weight: 2 }],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [allCards])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return allCards.slice(0, 50)
    if (/^\d+$/.test(q)) return allCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q)).slice(0, 50)
    return fuse.search(q).map(r => r.item).slice(0, 50)
  }, [query, allCards, fuse])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id])
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => !disabled && setOpen(v => !v)} disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-[#faf6f0] text-[#6b4f38] hover:border-[rgba(122,82,48,.35)] disabled:opacity-50 transition-colors">
        <Search className="h-3 w-3" />
        選擇料卡{selectedIds.length > 0 ? `（已選 ${selectedIds.length}）` : ''}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden">
          <div className="p-2 border-b border-[rgba(122,82,48,.1)]">
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜尋料號、品名…" autoFocus
              className="w-full border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
            />
          </div>
          {!query.trim() && (
            <p className="px-3 py-1.5 text-[10px] text-[#a08060] border-b border-[rgba(122,82,48,.08)]">
              共 {allCards.length} 張料卡，顯示前 {Math.min(50, allCards.length)} 筆，請輸入關鍵字搜尋更多
            </p>
          )}
          <div className="max-h-48 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#a08060]">沒有符合的料卡</p>
            ) : results.map(c => {
              const checked = selectedIds.includes(c.equipment_id)
              return (
                <label key={c.equipment_id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.06)]">
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.equipment_id)} className="accent-[#7a5230]" />
                  <span className="truncate text-[#4a3422]">{c.equipment_id} {c.name}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
