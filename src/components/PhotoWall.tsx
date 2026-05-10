'use client'

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Fuse from 'fuse.js'
import { EquipmentCard, AppSettings } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import CardDetailDialog from '@/components/CardDetailDialog'
import CardFormDialog from '@/components/CardFormDialog'
import { Search, X, ArrowUpDown, Plus, Trash2, Loader2, CheckSquare } from 'lucide-react'

interface Props {
  initialCards: EquipmentCard[]
  isAdmin: boolean
  settings: AppSettings
}

const SORT_OPTIONS = [
  { value: 'id',   label: '料號排序' },
  { value: 'name', label: '品名排序' },
]

export default function PhotoWall({ initialCards, isAdmin, settings }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const activeStatus = settings.statuses[0] ?? '現役'

  const [query,    setQuery]    = useState(() => searchParams.get('q')      ?? '')
  const [category, setCategory] = useState(() => searchParams.get('cat')    ?? '全部')
  const [status,   setStatus]   = useState(() => searchParams.get('status') ?? 'all')
  const [sortBy,   setSortBy]   = useState(() => searchParams.get('sort')   ?? 'id')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  const [formMode,    setFormMode]    = useState<'create' | 'edit'>('create')
  const [formOpen,    setFormOpen]    = useState(false)
  const [editingCard, setEditingCard] = useState<EquipmentCard | undefined>(undefined)

  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)

  useEffect(() => {
    const params = new URLSearchParams()
    if (query)              params.set('q',      query)
    if (category !== '全部') params.set('cat',    category)
    if (status   !== 'all') params.set('status', status)
    if (sortBy   !== 'id')  params.set('sort',   sortBy)
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [query, category, status, sortBy, router])

  const fuse = useMemo(() => new Fuse(initialCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name',         weight: 2 },
      { name: 'vendor',       weight: 1 },
      { name: 'tags',         weight: 1 },
      { name: 'notes',        weight: 0.5 },
    ],
    threshold: 0.4,
    includeScore: true,
    minMatchCharLength: 1,
  }), [initialCards])

  const filtered = useMemo(() => {
    let result: EquipmentCard[] = query.trim()
      ? fuse.search(query.trim()).map(r => r.item)
      : [...initialCards]

    if (category !== '全部') result = result.filter(c => c.category === category)
    if (status   !== 'all')  result = result.filter(c => c.status === status)

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
  const clearFilters = () => { setQuery(''); setCategory('全部'); setStatus('all'); setSortBy('id') }

  function openCreate() { setEditingCard(undefined); setFormMode('create'); setFormOpen(true) }
  function openEdit(card: EquipmentCard) { setEditingCard(card); setFormMode('edit'); setFormOpen(true) }

  const handleDelete = useCallback(async (card: EquipmentCard) => {
    if (!confirm(`確定要刪除「${card.name}」？\n此操作無法還原，Cloudinary 照片也會一併刪除。`)) return
    try {
      const res = await fetch(`/api/cards/${card.equipment_id}`, { method: 'DELETE' })
      if (!res.ok) { alert('刪除失敗，請重試'); return }
      router.refresh()
    } catch {
      alert('刪除失敗，請重試')
    }
  }, [router])

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.equipment_id)))
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBatchDelete = useCallback(async () => {
    const count = selectedIds.size
    const names = filtered
      .filter(c => selectedIds.has(c.equipment_id))
      .map(c => `${c.equipment_id} ${c.name}`)
      .join('\n')
    if (!confirm(`確定要刪除以下 ${count} 筆料卡？\n\n${names}\n\n此操作無法還原。`)) return
    setBatchDeleting(true)
    try {
      const results = await Promise.allSettled(
        Array.from(selectedIds).map(id =>
          fetch(`/api/cards/${id}`, { method: 'DELETE' })
        )
      )
      const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
      if (failed > 0) alert(`${count - failed} 筆刪除成功，${failed} 筆失敗`)
      exitSelectMode()
      router.refresh()
    } catch {
      alert('刪除失敗，請重試')
    } finally {
      setBatchDeleting(false)
    }
  }, [selectedIds, filtered, router])

  const categories = ['全部', ...settings.categories]
  const statusOptions = [
    { value: 'all', label: '全部狀態' },
    ...settings.statuses.map(s => ({ value: s, label: s })),
  ]

  return (
    <>
      {/* 凍結搜尋 + 篩選列（sticky，緊貼主導覽列下方） */}
      <div className="sticky top-[82px] z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 pt-3 pb-2">
          {/* 搜尋列 */}
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input className="pl-9 pr-9" placeholder="搜尋料號、品名、廠商、備註…（支援模糊比對）"
                value={query} onChange={e => setQuery(e.target.value)} />
              {query && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setQuery('')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="relative">
              <ArrowUpDown className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400 pointer-events-none" />
              <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                className="pl-7 pr-3 py-2 border border-gray-300 rounded-md text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer">
                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          {/* 篩選列 */}
          <div className="flex gap-2 flex-wrap items-center pb-1">
            {categories.map(cat => (
              <button key={cat} onClick={() => setCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  category === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>
                {cat}
              </button>
            ))}
            <span className="w-px h-5 bg-gray-300 mx-1" />
            {statusOptions.map(opt => (
              <button key={opt.value} onClick={() => setStatus(opt.value)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                  status === opt.value
                    ? opt.value === activeStatus
                      ? 'bg-green-600 text-white border-green-600'
                      : opt.value === 'all'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                }`}>
                {opt.label}
              </button>
            ))}
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-gray-500 border border-gray-300 hover:border-red-400 hover:text-red-500 transition-colors">
                <X className="h-3 w-3" />
                清除篩選
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 主內容區 */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
        {/* 結果數量 */}
        <p className="text-sm text-gray-500 mb-4">
          顯示 {filtered.length} / {initialCards.length} 筆
          {query && <span className="ml-1.5 text-blue-500">— 模糊搜尋「{query}」</span>}
        </p>

        {/* 網格 */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">找不到符合的料卡</p>
            <p className="text-sm mt-1">試著更換關鍵字或篩選條件</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-blue-500 text-sm underline hover:text-blue-700">
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
                isAdmin={isAdmin}
                onEdit={() => openEdit(card)}
                onDelete={() => handleDelete(card)}
                activeStatus={activeStatus}
                selectMode={selectMode}
                isSelected={selectedIds.has(card.equipment_id)}
                onSelect={() => toggleSelect(card.equipment_id)}
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
            activeStatus={activeStatus}
          />
        )}
      </div>

      {/* 管理員浮動按鈕區 */}
      {isAdmin && (
        <>
          {/* 批次刪除 action bar */}
          {selectMode && (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4 bg-white border border-gray-200 rounded-2xl shadow-xl px-5 py-3">
              <button onClick={toggleSelectAll} className="text-sm text-gray-500 hover:text-gray-800 transition-colors whitespace-nowrap">
                {selectedIds.size === filtered.length ? '取消全選' : `全選（${filtered.length}）`}
              </button>
              <span className="text-sm text-gray-700">
                已選 <span className="font-semibold">{selectedIds.size}</span> 張
              </span>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting || selectedIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors"
              >
                {batchDeleting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />
                }
                刪除選取
              </button>
            </div>
          )}

          {/* 批次選取 + 新增料卡 */}
          <div className="fixed bottom-6 right-6 flex items-center gap-3 z-40">
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              className={`flex items-center gap-2 font-medium px-4 py-3 rounded-full shadow-lg transition-colors ${
                selectMode
                  ? 'bg-gray-800 hover:bg-gray-900 text-white'
                  : 'bg-white hover:bg-gray-50 text-gray-700 border border-gray-200'
              }`}
            >
              <CheckSquare className="h-5 w-5" />
              {selectMode ? '取消選取' : '批次選取'}
            </button>
            <button onClick={openCreate}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-3 rounded-full shadow-lg transition-colors">
              <Plus className="h-5 w-5" />
              新增料卡
            </button>
          </div>

          <CardFormDialog
            mode={formMode}
            card={editingCard}
            open={formOpen}
            onClose={() => setFormOpen(false)}
            settings={settings}
          />
        </>
      )}
    </>
  )
}
