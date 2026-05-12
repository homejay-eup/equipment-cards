'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Fuse from 'fuse.js'
import { EquipmentCard, AppSettings } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import CardDetailDialog from '@/components/CardDetailDialog'
import CardFormDialog from '@/components/CardFormDialog'
import UserMenu from '@/components/UserMenu'
import BatchImportDialog from '@/components/BatchImportDialog'
import { Search, X, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckSquare, FileUp, Users, ChevronDown, SlidersHorizontal, AlertTriangle } from 'lucide-react'

interface Props {
  initialCards: EquipmentCard[]
  isAdmin: boolean
  settings: AppSettings
  userEmail: string
}

const SORT_OPTIONS = [
  { value: 'id',   label: '料號排序' },
  { value: 'name', label: '品名排序' },
  { value: 'date', label: '新增日期' },
]

export default function PhotoWall({ initialCards, isAdmin, settings, userEmail }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  const activeStatus = settings.statuses[0] ?? '現役'

  const [query,        setQuery]        = useState(() => searchParams.get('q')      ?? '')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => {
    const cat = searchParams.get('cat')
    return cat ? new Set(cat.split(',').filter(Boolean)) : new Set()
  })
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    const s = searchParams.get('status')
    return s ? new Set(s.split(',').filter(Boolean)) : new Set()
  })
  const [sortBy,   setSortBy]   = useState(() => searchParams.get('sort')   ?? 'id')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>(() => (searchParams.get('dir') ?? 'asc') as 'asc' | 'desc')
  const [isNewFilter, setIsNewFilter] = useState(() => searchParams.get('new') === '1')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  const [formMode,    setFormMode]    = useState<'create' | 'edit'>('create')
  const [formOpen,    setFormOpen]    = useState(false)
  const [editingCard, setEditingCard] = useState<EquipmentCard | undefined>(undefined)

  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const sortRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sortOpen) return
    const close = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [sortOpen])

  useEffect(() => {
    const params = new URLSearchParams()
    if (query)                params.set('q',      query)
    if (selectedCats.size > 0)     params.set('cat',    Array.from(selectedCats).join(','))
    if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','))
    if (sortBy   !== 'id')         params.set('sort',   sortBy)
    if (sortDir  !== 'asc')        params.set('dir',    sortDir)
    if (isNewFilter)               params.set('new',    '1')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, router])

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

    if (selectedCats.size > 0)     result = result.filter(c => selectedCats.has(c.category ?? ''))
    if (selectedStatuses.size > 0) result = result.filter(c => selectedStatuses.has(c.status ?? ''))
    if (isNewFilter)               result = result.filter(c => c.is_new)

    if (!query.trim()) {
      result.sort((a, b) => {
        let cmp = 0
        if (sortBy === 'name') {
          cmp = a.name.localeCompare(b.name, 'zh-TW')
        } else if (sortBy === 'date') {
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        } else {
          cmp = a.equipment_id.localeCompare(b.equipment_id)
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
    }
    return result
  }, [initialCards, query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, fuse])

  const hasActiveFilters = !!(query || selectedCats.size > 0 || selectedStatuses.size > 0 || isNewFilter)

  function toggleCat(cat: string) {
    if (cat === '全部') { setSelectedCats(new Set()); return }
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  function toggleStatus(s: string) {
    if (s === 'all') { setSelectedStatuses(new Set()); return }
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  const clearFilters = () => { setQuery(''); setSelectedCats(new Set()); setSelectedStatuses(new Set()); setSortBy('id'); setSortDir('asc'); setIsNewFilter(false) }

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

  // 孤兒分類：存在於料卡資料，但不在設定清單內
  const orphanCategories = useMemo(() => {
    const official = new Set(settings.categories)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.category && !official.has(c.category)) found.add(c.category)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.categories])

  // 孤兒狀態：存在於料卡資料，但不在設定清單內
  const orphanStatuses = useMemo(() => {
    const official = new Set(settings.statuses)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.status && !official.has(c.status)) found.add(c.status)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.statuses])

  const mainPhotosCount = initialCards.filter(c => c.main_photo).length
  const detailPhotosCount = initialCards.reduce((sum, c) => sum + c.detail_photos.length, 0)

  return (
    <>
      {/* 單一凍結列：標題列 + 搜尋 + 篩選 */}
      <div className="sticky top-0 z-40 bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] shadow-sm">
        {/* 標題列 */}
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-3 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-[#7a5230]">設備料卡管理系統</h1>
            <p className="text-sm text-[#a08060] mt-0.5 leading-snug">
              共 {mainPhotosCount} 張主圖<br />與 {detailPhotosCount} 張細節
            </p>
          </div>
          <div className="flex items-center gap-3">
            {isAdmin && (
              <>
                <span className="badge-admin-pulse text-xs font-bold tracking-wider border border-[rgba(122,82,48,.35)] text-[#7a5230] bg-[rgba(122,82,48,.07)] px-2.5 py-0.5 rounded">管理員</span>
                <Link href="/admin/users"
                  className="flex items-center gap-1.5 text-xs text-[#a08060] hover:text-[#7a5230] transition-colors">
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">帳號管理</span>
                </Link>
              </>
            )}
            {userEmail && <UserMenu email={userEmail} />}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-0 pb-2">
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
            <div className="flex items-center gap-1">
              {/* 手機篩選切換按鈕 */}
              <button
                onClick={() => setShowFilters(v => !v)}
                className={`md:hidden relative flex items-center justify-center w-9 h-9 border rounded-md bg-white transition-colors focus:outline-none ${
                  showFilters || hasActiveFilters
                    ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                    : 'border-[#e8ddd0] text-[#a08060] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                }`}
                title="篩選"
              >
                <SlidersHorizontal className="h-4 w-4" />
              </button>
              {/* 自訂排序下拉 */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => setSortOpen(v => !v)}
                  className={`flex items-center gap-2 pl-3 pr-2.5 py-2 border rounded-md text-sm bg-white text-[#6b4f38] cursor-pointer transition-colors focus:outline-none whitespace-nowrap ${
                    sortOpen
                      ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                      : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                  }`}
                >
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${sortOpen ? 'rotate-180' : ''}`} />
                </button>
                {sortOpen && (
                  <div className="absolute top-full mt-1 left-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-[8px] shadow-md overflow-hidden z-50 min-w-full">
                    {SORT_OPTIONS.map(o => (
                      <button key={o.value}
                        onClick={() => { setSortBy(o.value); setSortOpen(false) }}
                        className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                          sortBy === o.value
                            ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                            : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? '升冪（點擊切換降冪）' : '降冪（點擊切換升冪）'}
                className="flex items-center justify-center w-9 h-9 border border-[#e8ddd0] rounded-md bg-white text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors focus:outline-none"
              >
                {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* 篩選列：桌面永遠顯示，手機按按鈕展開 */}
          <div className={`${showFilters ? 'flex' : 'hidden'} md:flex gap-2 flex-wrap items-center pb-1`}>
            {categories.map(cat => {
              const isActive = cat === '全部' ? selectedCats.size === 0 : selectedCats.has(cat)
              return (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    isActive
                      ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                      : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                  }`}>
                  {cat}
                </button>
              )
            })}
            {/* 孤兒分類 */}
            {orphanCategories.map(cat => {
              const isActive = selectedCats.has(cat)
              const count = initialCards.filter(c => c.category === cat).length
              return (
                <button
                  key={cat}
                  onClick={() => toggleCat(cat)}
                  title={`此分類已從清單移除，仍有 ${count} 張料卡使用此值`}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                    isActive
                      ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                      : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                  }`}
                >
                  <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                  {cat}
                  <span className="opacity-70">({count})</span>
                </button>
              )
            })}
            <span className="w-px h-5 bg-[#e8ddd0] mx-1" />
            {statusOptions.map(opt => {
              const isActive = opt.value === 'all' ? selectedStatuses.size === 0 : selectedStatuses.has(opt.value)
              return (
                <button key={opt.value} onClick={() => toggleStatus(opt.value)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    isActive
                      ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                      : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                  }`}>
                  {opt.label}
                </button>
              )
            })}
            {/* 孤兒狀態：已從清單移除但仍有料卡使用 */}
            {orphanStatuses.length > 0 && (
              <>
                <span className="w-px h-5 bg-[rgba(122,82,48,.2)] mx-1" />
                {orphanStatuses.map(s => {
                  const isActive = selectedStatuses.has(s)
                  const count = initialCards.filter(c => c.status === s).length
                  return (
                    <button
                      key={s}
                      onClick={() => toggleStatus(s)}
                      title={`此狀態已從清單移除，仍有 ${count} 張料卡使用此值`}
                      className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                        isActive
                          ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                          : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                      }`}
                    >
                      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                      {s}
                      <span className="opacity-70">({count})</span>
                    </button>
                  )
                })}
              </>
            )}
            <span className="w-px h-5 bg-[#e8ddd0] mx-1" />
            <button onClick={() => setIsNewFilter(v => !v)}
              className={`badge-new-pulse px-3 py-1.5 rounded-full text-sm font-bold tracking-widest border transition-all duration-200 ${
                isNewFilter
                  ? 'bg-[#b5451b] text-white border-[#b5451b] shadow-[0_0_10px_rgba(181,69,27,.5),0_0_20px_rgba(181,69,27,.18)]'
                  : 'bg-white text-[#b5451b] border-[rgba(181,69,27,.35)] hover:border-[#b5451b] hover:shadow-[0_0_8px_rgba(181,69,27,.3)]'
              }`}>
              NEW
            </button>
            {hasActiveFilters && (
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-[#a08060] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.18)] transition-all duration-200">
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
        <p className="text-sm text-[#a08060] mb-4">
          顯示 {filtered.length} / {initialCards.length} 筆
          {query && <span className="ml-1.5 text-[#7a5230]">— 模糊搜尋「{query}」</span>}
        </p>

        {/* 網格 */}
        {filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg">找不到符合的料卡</p>
            <p className="text-sm mt-1">試著更換關鍵字或篩選條件</p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="mt-3 text-[#7a5230] text-sm underline hover:text-[#9c6b42]">
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
                isNew={card.is_new}
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
          {/* 批次選取 action bar：全寬固定底部 */}
          {selectMode && (
            <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#faf6f0] border-t border-[rgba(122,82,48,.2)] shadow-[0_-4px_16px_rgba(122,82,48,.1)] px-4 py-3 flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-sm text-[#6b4f38] hover:text-[#7a5230] transition-colors whitespace-nowrap shrink-0"
              >
                {selectedIds.size === filtered.length
                  ? <CheckSquare className="h-4 w-4 text-[#7a5230]" />
                  : <CheckSquare className="h-4 w-4 opacity-50" />
                }
                <span className="hidden sm:inline">{selectedIds.size === filtered.length ? '取消全選' : '全選'}</span>
              </button>
              <span className="flex-1 text-sm font-semibold text-[#7a5230] text-center">
                已選 {selectedIds.size} 張
              </span>
              <button
                onClick={exitSelectMode}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.25)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors shrink-0"
              >
                取消
              </button>
              <button
                onClick={handleBatchDelete}
                disabled={batchDeleting || selectedIds.size === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-[#b5451b] hover:bg-[#9a3a16] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
              >
                {batchDeleting
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <Trash2 className="h-4 w-4" />
                }
                刪除（{selectedIds.size}）
              </button>
            </div>
          )}

          {/* 批次選取 + 批次匯入 + 新增料卡 */}
          <div className={`fixed ${selectMode ? 'bottom-20' : 'bottom-6'} right-4 sm:right-6 flex items-center gap-2 sm:gap-3 z-40 transition-all duration-200`}>
            <button
              onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
              title={selectMode ? '取消選取' : '批次選取'}
              className={`flex items-center gap-2 font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none ${
                selectMode
                  ? 'bg-[#7a5230] hover:bg-[#9c6b42] text-white shadow-[0_0_10px_rgba(122,82,48,.45)]'
                  : 'bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] hover:shadow-[0_0_10px_rgba(122,82,48,.3)]'
              }`}
            >
              <CheckSquare className="h-5 w-5" />
              <span className="hidden sm:inline">{selectMode ? '取消選取' : '批次選取'}</span>
            </button>
            <button onClick={() => setImportOpen(true)}
              title="批次匯入"
              className="flex items-center gap-2 bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none hover:shadow-[0_0_10px_rgba(122,82,48,.3)]">
              <FileUp className="h-5 w-5" />
              <span className="hidden sm:inline">批次匯入</span>
            </button>
            <button onClick={openCreate}
              title="新增料卡"
              className="flex items-center gap-2 bg-[#7a5230] hover:bg-[#9c6b42] text-white font-medium px-3 py-3 sm:px-4 rounded-full shadow-lg transition-all duration-200 focus:outline-none shadow-[0_0_10px_rgba(122,82,48,.45)] hover:shadow-[0_0_16px_rgba(122,82,48,.6)]">
              <Plus className="h-5 w-5" />
              <span className="hidden sm:inline">新增料卡</span>
            </button>
          </div>

          <CardFormDialog
            mode={formMode}
            card={editingCard}
            open={formOpen}
            onClose={() => setFormOpen(false)}
            settings={settings}
          />
          <BatchImportDialog
            open={importOpen}
            onClose={() => setImportOpen(false)}
            settings={settings}
          />
        </>
      )}
    </>
  )
}
