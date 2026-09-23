'use client'

import { useMemo } from 'react'
import { ChevronRight } from 'lucide-react'
import type { StandardPriceItem } from '@/types/standardPrice'
import { headlinePrice, zhCompare } from './standardPriceUtils'

interface Props {
  /** 每個產品一筆（現行版本），已依搜尋條件篩選 */
  products: StandardPriceItem[]
  selectedName: string | null
  onSelect: (name: string) => void
  hasQuery: boolean
  totalCount: number
  canEdit: boolean
}

// 左側產品清單：依分類分組（中文排序），每個產品一列，顯示名稱＋代表價格
export default function ProductList({ products, selectedName, onSelect, hasQuery, totalCount, canEdit }: Props) {
  const grouped = useMemo(() => {
    const map = new Map<string, StandardPriceItem[]>()
    for (const p of products) {
      const list = map.get(p.category)
      if (list) list.push(p)
      else map.set(p.category, [p])
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => zhCompare(a, b))
      .map(([category, list]) => [category, [...list].sort((a, b) => zhCompare(a.name, b.name))] as const)
  }, [products])

  if (products.length === 0) {
    return (
      <div className="rounded-lg border border-[#e8ddd0] bg-white px-4 py-10 text-center">
        <p className="text-sm text-[#a08060]">
          {totalCount === 0
            ? `尚未建立任何標準售價${canEdit ? '，可按「新增產品」或「批次匯入」建立' : ''}`
            : hasQuery ? '沒有符合的產品' : '沒有產品'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {grouped.map(([category, list]) => (
        <div key={category}>
          <p className="text-xs font-semibold text-[#a08060] mb-1">
            {category}
            <span className="ml-1 font-normal">（{list.length}）</span>
          </p>
          <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
            {list.map((p, idx) => {
              const active = p.name === selectedName
              const price = headlinePrice(p)
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p.name)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors ${
                    idx > 0 ? 'border-t border-[#f0e8dc]' : ''
                  } ${
                    active
                      ? 'bg-[rgba(122,82,48,.08)] border-l-[3px] border-l-[#7a5230] pl-[9px]'
                      : 'hover:bg-[rgba(122,82,48,.04)]'
                  }`}
                >
                  <span className={`flex-1 min-w-0 truncate text-sm ${active ? 'text-[#7a5230] font-semibold' : 'text-[#2c1e12]'}`}>
                    {p.name}
                  </span>
                  {price && <span className="text-xs text-[#a08060] flex-shrink-0">{price}</span>}
                  <ChevronRight className="h-3.5 w-3.5 text-[#d4bda0] flex-shrink-0 sm:hidden" />
                </button>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
