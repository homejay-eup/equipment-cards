'use client'

import { useState, useMemo } from 'react'
import { EquipmentCard } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import CardDetailDialog from '@/components/CardDetailDialog'
import { Search, X } from 'lucide-react'

interface Props {
  initialCards: EquipmentCard[]
}

const CATEGORIES = ['全部', '主機', '天線', '支架', '螢幕', '線材', '配件']

export default function PhotoWall({ initialCards }: Props) {
  const [query, setQuery]           = useState('')
  const [category, setCategory]     = useState('全部')
  const [selected, setSelected]     = useState<EquipmentCard | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return initialCards.filter(card => {
      const matchCat = category === '全部' || card.category === category
      if (!matchCat) return false
      if (!q) return true
      return (
        card.equipment_id.toLowerCase().includes(q) ||
        card.name.toLowerCase().includes(q) ||
        (card.vendor ?? '').toLowerCase().includes(q) ||
        (card.notes ?? '').toLowerCase().includes(q) ||
        card.tags.some(t => t.toLowerCase().includes(q))
      )
    })
  }, [initialCards, query, category])

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* 搜尋列 + 分類 */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9 pr-9"
            placeholder="搜尋料號、品名、廠商、備註…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              onClick={() => setQuery('')}
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                category === cat
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* 結果數量 */}
      <p className="text-sm text-gray-500 mb-4">
        顯示 {filtered.length} / {initialCards.length} 筆
      </p>

      {/* 網格 */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">找不到符合的料卡</p>
          <p className="text-sm mt-1">試著更換搜尋關鍵字或分類</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map(card => (
            <EquipmentCardItem
              key={card.equipment_id}
              card={card}
              onClick={() => setSelected(card)}
            />
          ))}
        </div>
      )}

      {/* 細節 Dialog */}
      {selected && (
        <CardDetailDialog
          card={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
