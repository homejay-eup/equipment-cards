'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import Fuse from 'fuse.js'
import { Search } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'

// 單選版料卡挑選器：搜尋 → 點一下立刻選定並關閉。用於「文件清單」展開列裡
// 「+ 新增掛載料卡」這類一次只需要挑一張卡片、選完馬上動作的情境
// （跟批次上傳用的多選版 EquipmentPicker 區分開，避免行為混淆）
export default function EquipmentQuickPick({
  allCards, excludeIds = [], onPick, disabled,
}: {
  allCards: EquipmentCard[]
  excludeIds?: string[]
  onPick: (equipmentId: string) => void
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

  const candidates = useMemo(
    () => allCards.filter(c => !excludeIds.includes(c.equipment_id)),
    [allCards, excludeIds],
  )

  const fuse = useMemo(() => new Fuse(candidates, {
    keys: [{ name: 'equipment_id', weight: 2 }, { name: 'name', weight: 2 }],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [candidates])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return candidates.slice(0, 50)
    if (/^\d+$/.test(q)) return candidates.filter(c => c.equipment_id.includes(q) || c.name.includes(q)).slice(0, 50)
    return fuse.search(q).map(r => r.item).slice(0, 50)
  }, [query, candidates, fuse])

  return (
    <div ref={ref} className="relative inline-block">
      <button type="button" onClick={() => !disabled && setOpen(v => !v)} disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
        <Search className="h-3 w-3" />
        + 新增掛載料卡
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
              共 {candidates.length} 張料卡，顯示前 {Math.min(50, candidates.length)} 筆，請輸入關鍵字搜尋更多
            </p>
          )}
          <div className="max-h-48 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#a08060]">沒有符合的料卡</p>
            ) : results.map(c => (
              <button
                key={c.equipment_id}
                type="button"
                onClick={() => { onPick(c.equipment_id); setOpen(false); setQuery('') }}
                className="w-full text-left flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-[rgba(122,82,48,.06)] transition-colors"
              >
                <span className="truncate text-[#4a3422]">{c.equipment_id} {c.name}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
