'use client'

import { useMemo, useState } from 'react'
import { Search, AlertTriangle } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceEquipmentStats } from '@/types/maintenance'

interface Props {
  allCards: EquipmentCard[]
  equipmentStats: Record<string, MaintenanceEquipmentStats>
  selectedEquipmentId: string | null
  onSelect: (equipmentId: string) => void
}

// 依料號/品名搜尋維修資訊：只列出有維修資訊（rule_count > 0）的設備，
// 空白查詢時不預設列出全部，避免一次列出過多不相關結果
export default function EquipmentSearchPanel({ allCards, equipmentStats, selectedEquipmentId, onSelect }: Props) {
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return []
    return allCards.filter(card => {
      const stats = equipmentStats[card.equipment_id]
      if (!stats || stats.rule_count <= 0) return false
      return card.equipment_id.includes(q) || card.name.includes(q)
    })
  }, [allCards, equipmentStats, query])

  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg overflow-hidden flex flex-col">
      <div className="p-2 border-b border-[rgba(122,82,48,.1)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜尋料號或品名…"
            className="w-full pl-8 pr-2 py-1.5 border border-[#e8ddd0] rounded-lg text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
          />
        </div>
      </div>
      <div className="max-h-[60vh] md:max-h-[70vh] overflow-y-auto">
        {!query.trim() ? (
          <p className="px-3 py-4 text-xs text-[#a08060] text-center">輸入料號或品名開始查詢</p>
        ) : results.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[#a08060] text-center">沒有符合的維修資訊</p>
        ) : results.map(card => {
          const stats = equipmentStats[card.equipment_id]
          const selected = selectedEquipmentId === card.equipment_id
          return (
            <button
              key={card.equipment_id}
              onClick={() => onSelect(card.equipment_id)}
              className={`w-full text-left px-3 py-2.5 border-b border-[rgba(122,82,48,.06)] transition-colors ${
                selected ? 'bg-[rgba(122,82,48,.08)]' : 'hover:bg-[rgba(122,82,48,.04)]'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className={`text-sm font-medium truncate ${selected ? 'text-[#7a5230]' : 'text-[#4a3422]'}`}>
                    {card.name}
                  </p>
                  <p className="text-[11px] text-[#a08060] font-mono">{card.equipment_id}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  {stats.needs_review_count > 0 && (
                    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(181,69,27,.12)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                      <AlertTriangle className="h-2.5 w-2.5" />{stats.needs_review_count}
                    </span>
                  )}
                  <span className="text-[10px] text-[#a08060]">{stats.rule_count} 筆規則</span>
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
