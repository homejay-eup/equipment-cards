'use client'

import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

export type SortDir = 'asc' | 'desc'

// 可點擊排序的表頭欄位，依文件／依料號兩個表格共用（純前端排序，泛型 K 讓兩邊各自的欄位鍵值都能重用）
export default function SortHeader<K extends string>({
  label, sortKey, active, dir, onSort, className,
}: {
  label: string
  sortKey: K
  active: boolean
  dir: SortDir
  onSort: (key: K) => void
  className?: string
}) {
  return (
    <button type="button" onClick={() => onSort(sortKey)}
      className={`flex items-center gap-0.5 hover:text-[#7a5230] transition-colors ${className ?? ''}`}>
      {label}
      {active ? (dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : <ChevronsUpDown className="h-3 w-3 opacity-40" />}
    </button>
  )
}
