'use client'

import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { Search, X, Plus, Pencil, Trash2, Loader2, GripVertical, Info } from 'lucide-react'
import { QuoteItem } from '@/types/equipment'
import SettingsPopover from '@/components/SettingsPopover'
import ConfirmDialog from '@/components/ConfirmDialog'
import { getDropPosition, reorderByPosition, type DropPosition } from '@/lib/dragReorder'

interface Props {
  initialItems: QuoteItem[]
  categories: string[]
  permissions: string[]
}

interface FormState {
  category: string
  name: string
  standard_price: string
  manager_price: string
}

const EMPTY_FORM: FormState = { category: '', name: '', standard_price: '', manager_price: '' }

export default function QuotesClient({ initialItems, categories, permissions }: Props) {
  const canViewManagerPrice = permissions.includes('view_quotes_manager_price')
  const canEdit = permissions.includes('edit_quotes')

  const [items, setItems] = useState<QuoteItem[]>(initialItems)
  const [localCategories, setLocalCategories] = useState<string[]>(categories)
  const [query, setQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)     // 編輯模式（單筆）
  const [rows, setRows] = useState<FormState[]>([EMPTY_FORM]) // 新增模式（可多筆）
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<QuoteItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)
  const [dragOverPosition, setDragOverPosition] = useState<DropPosition | null>(null)
  const canReorder = canEdit && !query.trim()

  const [draggingCategory, setDraggingCategory] = useState<string | null>(null)
  const [dragOverCategory, setDragOverCategory] = useState<string | null>(null)
  const [dragOverCategoryPosition, setDragOverCategoryPosition] = useState<DropPosition | null>(null)

  const fuse = useMemo(
    () => new Fuse(items, { keys: ['name'], threshold: 0.35 }),
    [items],
  )

  const filtered = useMemo(() => {
    let result = query.trim() ? fuse.search(query.trim()).map(r => r.item) : items
    if (selectedCategory) result = result.filter(i => i.category === selectedCategory)
    return result
  }, [items, query, selectedCategory, fuse])

  const grouped = useMemo(() => {
    const map = new Map<string, QuoteItem[]>()
    for (const item of filtered) {
      if (!map.has(item.category)) map.set(item.category, [])
      map.get(item.category)!.push(item)
    }
    // 依 localCategories 的順序排列分類區塊；不在清單裡的分類（孤兒值）排在最後
    return Array.from(map.entries()).sort((a, b) => {
      const ai = localCategories.indexOf(a[0])
      const bi = localCategories.indexOf(b[0])
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  }, [filtered, localCategories])

  function openCreate() {
    setFormMode('create')
    setEditingId(null)
    setRows([{ ...EMPTY_FORM, category: selectedCategory ?? localCategories[0] ?? '' }])
    setFormError(null)
    setFormOpen(true)
  }

  function openEdit(item: QuoteItem) {
    setFormMode('edit')
    setEditingId(item.id)
    setForm({
      category: item.category,
      name: item.name,
      standard_price: String(item.standard_price),
      manager_price: item.manager_price !== null ? String(item.manager_price) : '',
    })
    setFormError(null)
    setFormOpen(true)
  }

  function addRow() {
    setRows(prev => [...prev, { ...EMPTY_FORM, category: prev[prev.length - 1]?.category ?? selectedCategory ?? localCategories[0] ?? '' }])
  }

  function removeRow(idx: number) {
    setRows(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== idx))
  }

  function updateRow(idx: number, patch: Partial<FormState>) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))
  }

  async function handleSubmit() {
    if (formMode === 'edit') return handleEditSubmit()
    return handleCreateSubmit()
  }

  async function handleEditSubmit() {
    const standardPrice = Number(form.standard_price)
    if (!form.category) { setFormError('請選擇分類'); return }
    if (!form.name.trim()) { setFormError('請輸入品名'); return }
    if (form.standard_price.trim() === '' || Number.isNaN(standardPrice)) { setFormError('標準售價必須為數字'); return }
    const managerPrice = form.manager_price.trim() === '' ? null : Number(form.manager_price)
    if (managerPrice !== null && Number.isNaN(managerPrice)) { setFormError('主管權限價必須為數字'); return }

    setSaving(true)
    setFormError(null)
    try {
      const body = { category: form.category, name: form.name.trim(), standard_price: standardPrice, manager_price: managerPrice }
      const res = await fetch(`/api/quotes/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) { setFormError(json.error ?? '儲存失敗'); return }

      setItems(prev => prev.map(i => i.id === editingId ? json.item : i))
      setFormOpen(false)
    } catch {
      setFormError('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function handleCreateSubmit() {
    const parsed: { category: string; name: string; standard_price: number; manager_price: number | null }[] = []
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i]
      if (!r.category) { setFormError(`第 ${i + 1} 列：請選擇分類`); return }
      if (!r.name.trim()) { setFormError(`第 ${i + 1} 列：請輸入品名`); return }
      const sp = Number(r.standard_price)
      if (r.standard_price.trim() === '' || Number.isNaN(sp)) { setFormError(`第 ${i + 1} 列：標準售價必須為數字`); return }
      const mp = r.manager_price.trim() === '' ? null : Number(r.manager_price)
      if (mp !== null && Number.isNaN(mp)) { setFormError(`第 ${i + 1} 列：主管權限價必須為數字`); return }
      parsed.push({ category: r.category, name: r.name.trim(), standard_price: sp, manager_price: mp })
    }

    setSaving(true)
    setFormError(null)
    const created: QuoteItem[] = []
    try {
      for (const body of parsed) {
        const res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const json = await res.json()
        if (!res.ok) {
          setFormError(`「${body.name}」儲存失敗：${json.error ?? '未知錯誤'}（前面已成功的品項已儲存）`)
          return
        }
        created.push(json.item)
      }
      setFormOpen(false)
    } catch {
      setFormError('儲存失敗（前面已成功的品項已儲存）')
    } finally {
      if (created.length > 0) setItems(prev => [...prev, ...created])
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/quotes/${deleteTarget.id}`, { method: 'DELETE' })
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      }
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  async function handleReorder(category: string, fromId: string, toId: string, position: DropPosition) {
    const catItems = items.filter(i => i.category === category)
    // 依游標實際懸停在目標上/下半插入（before/after），取代舊有依 fromIdx/toIdx 大小關係決定方向的 splice
    const reordered = reorderByPosition(catItems, fromId, toId, position, i => i.id)
    if (reordered === catItems) return
    const orders = reordered.map((it, i) => ({ id: it.id, sort_order: (i + 1) * 1000 }))
    const sortMap = Object.fromEntries(orders.map(o => [o.id, o.sort_order]))

    // 保留原本在 items 陣列中的槽位（同分類在陣列中為連續區塊），只替換內容順序，避免分類區塊本身跳動
    const catSlots = items.map((it, idx) => (it.category === category ? idx : -1)).filter(idx => idx !== -1)
    const newItems = [...items]
    reordered.forEach((it, i) => { newItems[catSlots[i]] = { ...it, sort_order: sortMap[it.id] } })

    const originalItems = items
    setItems(newItems)
    setDraggingId(null)
    setDragOverId(null)
    setDragOverPosition(null)

    try {
      const res = await fetch('/api/quotes/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setItems(originalItems)
    }
  }

  async function handleCategoryReorder(fromCat: string, toCat: string, position: DropPosition) {
    const reordered = reorderByPosition(localCategories, fromCat, toCat, position, c => c)
    if (reordered === localCategories) return

    const original = localCategories
    setLocalCategories(reordered)
    setDraggingCategory(null)
    setDragOverCategory(null)
    setDragOverCategoryPosition(null)

    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'quoteCategories', value: reordered }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setLocalCategories(original)
    }
  }

  function formatPrice(n: number | null) {
    if (n === null) return '—'
    return n.toLocaleString('zh-TW')
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16">
      {/* 搜尋列 */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-9 h-9 border border-[#e8ddd0] rounded-md text-sm bg-white text-[#2c1e12] placeholder:text-[#a08060] focus:outline-none focus:ring-1 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
            placeholder="搜尋品名…"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => setQuery('')}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {canEdit && (
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#7a5230] text-white text-sm font-medium hover:bg-[#9c6b42] transition-colors shadow-[0_0_10px_rgba(122,82,48,.3)]"
          >
            <Plus className="h-4 w-4" />
            新增品項
          </button>
        )}
      </div>

      {/* 分類篩選 */}
      <div className="flex items-center gap-1.5 flex-wrap mb-4">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
            selectedCategory === null
              ? 'bg-[#7a5230] text-white border-[#7a5230]'
              : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)]'
          }`}
        >
          全部
        </button>
        {localCategories.map(cat => {
          const isDraggingThis = draggingCategory === cat
          const isDragOverThis = !isDraggingThis && draggingCategory && dragOverCategory === cat
          return (
            <div key={cat} className="relative">
              {isDragOverThis && (
                <div className={`absolute top-0.5 bottom-0.5 w-0.5 bg-[#c49a72] rounded-full pointer-events-none ${dragOverCategoryPosition === 'after' ? '-right-1' : '-left-1'}`} />
              )}
              <button
                onClick={() => setSelectedCategory(cat)}
                draggable={canEdit}
                onDragStart={() => canEdit && setDraggingCategory(cat)}
                onDragOver={(e) => { if (canEdit) { e.preventDefault(); setDragOverCategory(cat); setDragOverCategoryPosition(getDropPosition(e, 'horizontal')) } }}
                onDrop={() => canEdit && draggingCategory && handleCategoryReorder(draggingCategory, cat, dragOverCategoryPosition ?? 'before')}
                onDragEnd={() => { setDraggingCategory(null); setDragOverCategory(null); setDragOverCategoryPosition(null) }}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${canEdit ? 'cursor-grab' : ''} ${
                  selectedCategory === cat
                    ? 'bg-[#7a5230] text-white border-[#7a5230]'
                    : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)]'
                }`}
              >
                {cat}
              </button>
            </div>
          )
        })}
        {canEdit && (
          <SettingsPopover
            settingKey="quoteCategories"
            items={localCategories}
            onConfirm={(next) => {
              setLocalCategories(next)
              if (selectedCategory && !next.includes(selectedCategory)) setSelectedCategory(null)
            }}
          />
        )}
      </div>

      {!canEdit && (
        <div className="flex items-center gap-1.5 text-xs text-[#a08060] mb-4">
          <Info className="h-3.5 w-3.5 flex-shrink-0" />
          <span>找不到需要的品項或價格有問題，請聯繫 Lala 協助處理。</span>
        </div>
      )}

      {/* 清單 */}
      {filtered.length === 0 ? (
        <p className="text-sm text-[#a08060] text-center py-10">
          沒有符合的品項{!canEdit && '，如需新增請聯繫 Lala'}
        </p>
      ) : (
        <div className="space-y-4">
          {grouped.map(([category, groupItems]) => (
            <div key={category}>
              <p className="text-xs font-semibold text-[#a08060] mb-1">{category}</p>
              <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
                {/* 欄位標頭：每欄各自的標籤，跟下方兩欄品項對齊 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 bg-[#faf6f0] border-b border-[#e8ddd0]">
                  {[0, 1].map(col => (
                    (col === 0 || groupItems.length > 1) && (
                      <div key={col} className={`${col === 1 ? 'hidden sm:flex sm:border-l' : 'hidden sm:flex'} items-center gap-3 px-4 py-1 border-[#e8ddd0]`}>
                        {canEdit && <span className="w-4 flex-shrink-0" />}
                        <span className="flex-1" />
                        <span className="text-xs font-semibold text-[#a08060] w-20 text-right">標準售價</span>
                        {canViewManagerPrice && (
                          <span className="text-xs font-semibold text-[#a08060] w-20 text-right">主管權限價</span>
                        )}
                        {canEdit && <span className="w-[52px] flex-shrink-0" />}
                      </div>
                    )
                  ))}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2">
                  {groupItems.map((item, idx) => {
                    const isDraggingThis = draggingId === item.id
                    const isDragOverThis = !isDraggingThis && draggingId && dragOverId === item.id
                    return (
                    <div
                      key={item.id}
                      draggable={canReorder}
                      onDragStart={() => canReorder && setDraggingId(item.id)}
                      onDragOver={(e) => { if (canReorder) { e.preventDefault(); setDragOverId(item.id); setDragOverPosition(getDropPosition(e, 'vertical')) } }}
                      onDrop={() => canReorder && draggingId && handleReorder(item.category, draggingId, item.id, dragOverPosition ?? 'before')}
                      onDragEnd={() => { setDraggingId(null); setDragOverId(null); setDragOverPosition(null) }}
                      className={`relative group flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-4 py-1.5 transition-colors ${idx >= 2 ? 'border-t border-[#f0e8dc]' : ''} ${idx % 2 === 1 ? 'sm:border-l border-[#f0e8dc]' : ''}`}
                    >
                      {isDragOverThis && (
                        <div className={`absolute left-2 right-2 h-0.5 bg-[#c49a72] rounded-full pointer-events-none ${dragOverPosition === 'after' ? 'bottom-0' : 'top-0'}`} />
                      )}
                      <div className="flex items-center gap-2 min-w-0 sm:flex-1">
                        {canEdit && (
                          <GripVertical className={`h-4 w-4 text-[#d4bda0] flex-shrink-0 ${canReorder ? 'cursor-grab opacity-0 group-hover:opacity-100' : 'opacity-0'} transition-opacity`} />
                        )}
                        <span className="text-sm text-[#2c1e12] truncate min-w-0 flex-1">{item.name}</span>
                      </div>
                      <div className="flex items-center gap-3 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
                        <span className="text-sm font-medium text-[#7a5230] sm:w-20 sm:text-right">
                          <span className="sm:hidden text-[#a08060] font-normal">標準 </span>{formatPrice(item.standard_price)}
                        </span>
                        {canViewManagerPrice && (
                          <span className="text-sm text-[#a08060] sm:w-20 sm:text-right">
                            <span className="sm:hidden font-normal">主管 </span>{formatPrice(item.manager_price)}
                          </span>
                        )}
                        {canEdit && (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEdit(item)} className="text-[#a08060] hover:text-[#7a5230] transition-colors p-1">
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => setDeleteTarget(item)} className="text-[#a08060] hover:text-[#b5451b] transition-colors p-1">
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 編輯 Dialog（單筆） */}
      {formOpen && formMode === 'edit' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={() => !saving && setFormOpen(false)}>
          <div
            className="bg-[#fff9f4] rounded-2xl shadow-[0_0_30px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-sm p-6"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#2c1e12] mb-4">編輯品項</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-[#a08060] mb-1">分類</label>
                <select
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  disabled={saving}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                >
                  <option value="">— 未選 —</option>
                  {localCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a08060] mb-1">品名</label>
                <input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  disabled={saving}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                />
              </div>
              <div>
                <label className="block text-xs text-[#a08060] mb-1">標準售價</label>
                <input
                  type="number"
                  value={form.standard_price}
                  onChange={e => setForm(f => ({ ...f, standard_price: e.target.value }))}
                  disabled={saving}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                />
              </div>
              {canViewManagerPrice && (
                <div>
                  <label className="block text-xs text-[#a08060] mb-1">主管權限價（可留空）</label>
                  <input
                    type="number"
                    value={form.manager_price}
                    onChange={e => setForm(f => ({ ...f, manager_price: e.target.value }))}
                    disabled={saving}
                    className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                  />
                </div>
              )}
              {formError && <p className="text-xs text-[#b5451b]">{formError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => setFormOpen(false)}
                disabled={saving}
                className="flex-1 text-sm text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 py-2 rounded-lg hover:bg-[rgba(122,82,48,.05)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold bg-[#7a5230] text-white rounded-lg py-2 hover:bg-[#9c6b42] disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(122,82,48,.3)]"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                儲存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新增 Dialog（可多筆） */}
      {formOpen && formMode === 'create' && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4" onClick={() => !saving && setFormOpen(false)}>
          <div
            className="bg-[#fff9f4] rounded-2xl shadow-[0_0_30px_rgba(122,82,48,.18),0_20px_60px_rgba(0,0,0,.22)] border border-[rgba(122,82,48,.18)] w-full max-w-2xl p-6 max-h-[85vh] flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-[#2c1e12] mb-4">新增品項（可一次新增多筆）</h3>

            <div className="overflow-y-auto overflow-x-hidden flex-1 -mx-1 px-1">
              {/* 欄位標題（桌機才顯示，手機用堆疊卡片較好讀） */}
              <div className="hidden sm:grid grid-cols-[1fr_1.4fr_100px_100px_28px] gap-2 mb-1.5 px-1">
                <span className="text-xs text-[#a08060]">分類</span>
                <span className="text-xs text-[#a08060]">品名</span>
                <span className="text-xs text-[#a08060]">標準售價</span>
                {canViewManagerPrice && <span className="text-xs text-[#a08060]">主管權限價</span>}
              </div>

              <div className="space-y-2">
                {rows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr_100px_100px_28px] gap-2 items-start bg-white sm:bg-transparent rounded-lg sm:rounded-none border sm:border-0 border-[#e8ddd0] p-2 sm:p-0">
                    <select
                      value={row.category}
                      onChange={e => updateRow(idx, { category: e.target.value })}
                      disabled={saving}
                      className="w-full border border-[#e8ddd0] rounded-lg px-2.5 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                    >
                      <option value="">— 未選 —</option>
                      {localCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                    <input
                      placeholder="品名"
                      value={row.name}
                      onChange={e => updateRow(idx, { name: e.target.value })}
                      disabled={saving}
                      className="w-full border border-[#e8ddd0] rounded-lg px-2.5 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                    />
                    <input
                      type="number"
                      placeholder="標準售價"
                      value={row.standard_price}
                      onChange={e => updateRow(idx, { standard_price: e.target.value })}
                      disabled={saving}
                      className="w-full border border-[#e8ddd0] rounded-lg px-2.5 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                    />
                    {canViewManagerPrice && (
                      <input
                        type="number"
                        placeholder="主管權限價"
                        value={row.manager_price}
                        onChange={e => updateRow(idx, { manager_price: e.target.value })}
                        disabled={saving}
                        className="w-full border border-[#e8ddd0] rounded-lg px-2.5 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                      />
                    )}
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      disabled={saving || rows.length <= 1}
                      className="flex items-center justify-center h-9 w-9 sm:h-full text-[#a08060] hover:text-[#b5451b] disabled:opacity-30 transition-colors"
                      title="移除這一列"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={addRow}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm text-[#7a5230] hover:text-[#9c6b42] mt-3 disabled:opacity-50 transition-colors"
              >
                <Plus className="h-4 w-4" />
                新增一列
              </button>

              {formError && <p className="text-xs text-[#b5451b] mt-3">{formError}</p>}
            </div>

            <div className="flex gap-2 mt-5 pt-4 border-t border-[rgba(122,82,48,.12)]">
              <button
                onClick={() => setFormOpen(false)}
                disabled={saving}
                className="flex-1 text-sm text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 py-2 rounded-lg hover:bg-[rgba(122,82,48,.05)] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 flex items-center justify-center gap-1.5 text-sm font-semibold bg-[#7a5230] text-white rounded-lg py-2 hover:bg-[#9c6b42] disabled:opacity-50 transition-colors shadow-[0_0_10px_rgba(122,82,48,.3)]"
              >
                {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {rows.length > 1 ? `儲存全部（${rows.length} 筆）` : '儲存'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="刪除這個報價品項？"
        message={deleteTarget ? `「${deleteTarget.name}」刪除後無法復原。` : undefined}
        danger
        confirmLabel={deleting ? '刪除中…' : '刪除'}
        onConfirm={handleDelete}
        onCancel={() => !deleting && setDeleteTarget(null)}
      />
    </div>
  )
}
