'use client'

import { useState, useMemo } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import type { UsageAnalyticsRow } from '@/lib/analytics'

interface Props {
  initialData: UsageAnalyticsRow[]
}

// 秒數格式化成「X 小時 Y 分」或「X 分鐘」，避免顯示原始秒數
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分鐘`
  if (minutes === 0) return `${hours} 小時`
  return `${hours} 小時 ${minutes} 分`
}

type SortKey = 'email' | 'loginCount' | 'totalDurationSeconds' | 'averageDurationSeconds' | 'card_search' | 'card_detail_view'

// 各欄位取值（數字欄位皆回傳 number，email 回字串），供排序共用
function sortValue(row: UsageAnalyticsRow, key: SortKey): string | number {
  switch (key) {
    case 'email': return row.email
    case 'loginCount': return row.loginCount
    case 'totalDurationSeconds': return row.totalDurationSeconds
    case 'averageDurationSeconds': return row.averageDurationSeconds
    case 'card_search': return row.eventCounts['card_search'] ?? 0
    case 'card_detail_view': return row.eventCounts['card_detail_view'] ?? 0
  }
}

export default function AnalyticsClient({ initialData }: Props) {
  // 前端排序：預設維持後端排序（總停留時長 desc），點欄位才切換
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' })

  function handleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const sortedData = useMemo(() => {
    if (!sort.key) return initialData
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = sort.key
    return [...initialData].sort((a, b) => {
      const av = sortValue(a, key)
      const bv = sortValue(b, key)
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'zh-Hant') * dir
      return ((av as number) - (bv as number)) * dir
    })
  }, [initialData, sort])

  function SortableHeader({ label, column, className }: { label: string; column: SortKey; className?: string }) {
    return (
      <th className={`text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap ${className ?? ''}`}>
        <button type="button" onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
          {label}
          {sort.key !== column
            ? <ChevronsUpDown className="h-3 w-3 opacity-40" />
            : sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </th>
    )
  }

  return (
    <div>
      <div className="mb-3 text-sm text-[#a08060]">
        共 {initialData.length} 位使用者
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
        {initialData.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#a08060]">尚無使用統計資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.12)]">
                  <SortableHeader label="Email" column="email" />
                  <SortableHeader label="登入次數" column="loginCount" />
                  <SortableHeader label="總停留時長" column="totalDurationSeconds" />
                  <SortableHeader label="平均停留時長" column="averageDurationSeconds" />
                  <SortableHeader label="料卡搜尋次數" column="card_search" />
                  <SortableHeader label="料卡瀏覽次數" column="card_detail_view" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(122,82,48,.08)]">
                {sortedData.map(row => (
                  <tr key={row.email} className="hover:bg-[rgba(122,82,48,.03)] transition-colors">
                    <td className="px-4 py-3 text-[#2c1e12] whitespace-nowrap">{row.email}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.loginCount}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.totalDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.averageDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_search'] ?? 0}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_detail_view'] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
