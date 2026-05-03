'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Fuse from 'fuse.js'
import { EquipmentCard } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import CardDetailDialog from '@/components/CardDetailDialog'
import { Search, X, ArrowUpDown } from 'lucide-react'

interface Props {
  initialCards: EquipmentCard[]
}

const CATEGORIES = ['全部', '主機', '鏡頭', '螢幕', '天線', '儲存媒體', '線材', '配件', '耗材', '工具', '國外設備']

const STATUS_OPTIONS = [
  { value: 'all',          label: '全部狀態' },
  { value: 'active',       label: '現役' },
  { value: 'discontinued', label: '停產' },
]

const SORT_OPTIONS = [
  { value: 'id',   label: '料號排序' },
  { value: 'name', label: '品名排序' },
]

export default function PhotoWall({ initialCards }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const [query,    setQuery]    = useState(() => searchParams.get('q')      ?? '')
  const [category, setCategory] = useState(() => searchParams.get('cat')    ?? '全部')
  const [status,   setStatus]   = useState(() => searchParams.get('status') ?? 'all')
  const [sortBy,   setSortBy]   = useState(() => searchParams.get('sort')   ?? 'id')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  // 同步篩選條件到 URL（方便分享）
  useEffect(() => {
    const params = new URLSearchParams()
    if (query)              params.set('q',      query)
    if (category !== '全部') params.set('cat',    category)
    if (status   !== 'all') params.set('status', status)
    if (sortBy   !== 'id')  params.set('sort',   sortBy)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [query, category, status, sortBy, router])

  // Fuse.js 模糊搜尋設定
  const fuse = useMemo(() => new Fuse(initialCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name',         weight: 2 },
      { name: 'vendor',       weight: 1 },
      { name: 'tags',         weight: 1 },
      { name: 'notes',        weight: 0.5 },
    ],
    threshold: 0.4,   // 0 = 完全比對，1 = 全部通過；0.4 可容許少量錯字
    includeScore: true,
    minMatchCharLength: 1,
  }), [initialCards])

  const filtered = useMemo(() => {
    // 1. 模糊搜尋（有關鍵字）或全部
    let result: EquipmentCard[] = query.trim()
      ? fuse.search(query.trim()).map(r => r.item)
      : [...initialCards]

    // 2. 分類篩選
    if (category !== '全部') {
      result = result.filter(c => c.category === category)
    }

    // 3. 狀態篩選
    if (status !== 'all') {
      result = result.filter(c => c.status === status)
    }

    // 4. 排序（無搜尋時；有搜尋時 Fuse 已按相關度排）
    if (!query.trim()) {
      result.sort((a, b) =>
        sortBy === 'name'
          ? a.name.localeCompare(b.name, 'zh-TW')
          : a.equipment_id.localeCompare(b.equipment_id)
      )
    }

    return result
  }, [initialCards, query, category, status, sortBy, fuse])

  const hasActiveFilters = !!(query || category !== '全部' || status !== 'all')

  const clearFilters = () => {
    setQuery('')
    setCategory('全部')
    setStatus('all')
    setSortBy('id')
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">

      {/* ── 搜尋列 ── */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            className="pl-9 pr-9"
            placeholder="搜尋料號、品名、廠商、備註…（支援模糊比對）"
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

        {/* 排序 */}
        <div className="relative">
          <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer"
          >
            {SORT_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── 篩選列 ── */}
      <div className="flex gap-2 flex-wrap items-center mb-4">
        {/* 分類 */}
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

        <span className="w-px h-5 bg-gray-300 mx-1" />

        {/* 狀態 */}
        {STATUS_OPTIONS.map(opt => (
          <button
            key={opt.value}
            onClick={() => setStatus(opt.value)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              status === opt.value
                ? opt.value === 'discontinued'
                  ? 'bg-red-500 text-white border-red-500'
                  : opt.value === 'active'
                  ? 'bg-green-600 text-white border-green-600'
                  : 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
            }`}
          >
            {opt.label}
          </button>
        ))}

        {/* 清除篩選 */}
        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-gray-500 border border-gray-300 hover:border-red-400 hover:text-red-500 transition-colors"
          >
            <X className="h-3 w-3" />
            清除篩選
          </button>
        )}
      </div>

      {/* ── 結果數量 ── */}
      <p className="text-sm text-gray-500 mb-4">
        顯示 {filtered.length} / {initialCards.length} 筆
        {query && (
          <span className="ml-1.5 text-blue-500">
            — 模糊搜尋「{query}」
          </span>
        )}
      </p>

      {/* ── 網格 ── */}
      {filtered.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <p className="text-lg">找不到符合的料卡</p>
          <p className="text-sm mt-1">試著更換關鍵字或篩選條件</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="mt-3 text-blue-500 text-sm underline hover:text-blue-700"
            >
              清除所有篩選
            </button>
          )}
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

      {/* ── 細節 Dialog ── */}
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
