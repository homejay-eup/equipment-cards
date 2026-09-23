'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X, Plus, FileUp, Info, Tags } from 'lucide-react'
import type { StandardPriceItem } from '@/types/standardPrice'
import ConfirmDialog from '@/components/ConfirmDialog'
import ProductList from './ProductList'
import ProductDetail from './ProductDetail'
import PriceFormDialog from './PriceFormDialog'
import PriceImportDialog from './PriceImportDialog'
import { formatDate, groupVersionsByName, mergeItems, readApiError } from './standardPriceUtils'

interface Props {
  initialItems: StandardPriceItem[]
  canEdit: boolean
}

// Step 46：標準售價頁籤。左側產品清單（依分類分組，只列現行版本），右側產品詳情＋歷史版本。
// 手機版：清單與詳情二擇一顯示，點產品進詳情、按「返回清單」回來。
export default function StandardPricesClient({ initialItems, canEdit }: Props) {
  const [items, setItems] = useState<StandardPriceItem[]>(initialItems)
  const [query, setQuery] = useState('')
  const [selectedName, setSelectedName] = useState<string | null>(null)
  const [viewingId, setViewingId] = useState<string | null>(null) // null＝看現行版本
  const [mobileDetail, setMobileDetail] = useState(false)

  const [form, setForm] = useState<{ mode: 'create' | 'edit'; item?: StandardPriceItem } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<StandardPriceItem | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState<{ text: string; tone: 'info' | 'warn' } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  function showToast(text: string, tone: 'info' | 'warn' = 'info') {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ text, tone })
    toastTimer.current = setTimeout(() => setToast(null), tone === 'warn' ? 6000 : 3000)
  }

  const versionsByName = useMemo(() => groupVersionsByName(items), [items])
  const currentProducts = useMemo(() => Array.from(versionsByName.values()).map((v) => v[0]), [versionsByName])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return currentProducts
    return currentProducts.filter((p) => {
      const versions = versionsByName.get(p.name) ?? [p]
      return (
        p.name.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        versions.some((v) => (v.plan_name ?? '').toLowerCase().includes(q))
      )
    })
  }, [query, currentProducts, versionsByName])

  const selectedVersions = selectedName ? versionsByName.get(selectedName) ?? [] : []
  const displayed = selectedVersions.find((v) => v.id === viewingId) ?? selectedVersions[0] ?? null
  const categories = useMemo(() => new Set(currentProducts.map((p) => p.category)).size, [currentProducts])

  function scrollToTop() {
    const top = rootRef.current ? rootRef.current.getBoundingClientRect().top + window.scrollY - 120 : 0
    window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }

  // 搜尋字串變動 → 手機版切回清單（否則停在詳情畫面時打字看不到任何結果）；桌面版兩欄並列不受影響
  function changeQuery(q: string) {
    setQuery(q)
    setMobileDetail(false)
  }

  function selectProduct(name: string, versionId: string | null = null) {
    setSelectedName(name)
    setViewingId(versionId)
    setMobileDetail(true)
    if (typeof window !== 'undefined' && window.innerWidth < 640) scrollToTop()
  }

  function handleSaved(item: StandardPriceItem, warning: string | null) {
    setItems((prev) => mergeItems(prev, [item]))
    setForm(null)
    selectProduct(item.name, item.id)
    if (warning) showToast(warning, 'warn')
    else showToast('已儲存')
  }

  function handleImported(imported: StandardPriceItem[]) {
    setItems((prev) => mergeItems(prev, imported))
  }

  async function confirmDelete() {
    const target = deleteTarget
    if (!target) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/standard-prices/${target.id}`, { method: 'DELETE' })
      if (!res.ok) {
        showToast(await readApiError(res, '刪除失敗，請重試'), 'warn')
        return
      }
      const data = await res.json().catch(() => null)
      setItems((prev) => prev.filter((i) => i.id !== target.id))
      if (viewingId === target.id) setViewingId(null)
      const remaining = (versionsByName.get(target.name) ?? []).filter((v) => v.id !== target.id)
      if (remaining.length === 0 && selectedName === target.name) {
        setSelectedName(null)
        setMobileDetail(false)
      }
      if (data?.warning) showToast(data.warning, 'warn')
      else showToast('已刪除')
    } catch {
      showToast('刪除失敗，請檢查網路後重試', 'warn')
    } finally {
      setDeleting(false)
      setDeleteTarget(null)
    }
  }

  const deleteIsLast = deleteTarget ? (versionsByName.get(deleteTarget.name)?.length ?? 0) <= 1 : false

  return (
    <div ref={rootRef} className="max-w-5xl mx-auto px-4 pt-4 pb-16">
      {/* 工具列 */}
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            className="w-full pl-9 pr-9 h-9 border border-[#e8ddd0] rounded-md text-sm bg-white text-[#2c1e12] placeholder:text-[#a08060] focus:outline-none focus:ring-1 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
            placeholder="搜尋產品名稱、分類、方案名稱…"
            value={query}
            onChange={(e) => changeQuery(e.target.value)}
          />
          {query && (
            <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" onClick={() => changeQuery('')} title="清除">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {canEdit && (
          <>
            <button
              onClick={() => setImportOpen(true)}
              title="批次匯入"
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[rgba(122,82,48,.35)] bg-white text-[#7a5230] text-sm font-medium hover:bg-[rgba(122,82,48,.06)] transition-colors"
            >
              <FileUp className="h-4 w-4" />
              <span className="hidden sm:inline">批次匯入</span>
            </button>
            <button
              onClick={() => setForm({ mode: 'create' })}
              title="新增產品"
              className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#7a5230] text-white text-sm font-medium hover:bg-[#9c6b42] transition-colors shadow-[0_0_10px_rgba(122,82,48,.3)]"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">新增產品</span>
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#a08060] mb-4">
        <span>共 {currentProducts.length} 項產品、{categories} 個分類{query.trim() ? `，符合 ${filtered.length} 項` : ''}</span>
        {!canEdit && (
          <span className="flex items-center gap-1.5">
            <Info className="h-3.5 w-3.5 flex-shrink-0" />
            找不到需要的產品或價格有問題，請聯繫 Lala 協助處理。
          </span>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-4 items-start">
        <div className={`w-full sm:w-[280px] sm:flex-shrink-0 ${mobileDetail && displayed ? 'hidden sm:block' : ''}`}>
          <ProductList
            products={filtered}
            selectedName={selectedName}
            onSelect={(name) => selectProduct(name)}
            hasQuery={!!query.trim()}
            totalCount={currentProducts.length}
            canEdit={canEdit}
          />
        </div>
        <div className={`w-full min-w-0 sm:flex-1 ${mobileDetail && displayed ? '' : 'hidden sm:block'}`}>
          {displayed ? (
            <ProductDetail
              item={displayed}
              versions={selectedVersions}
              canEdit={canEdit}
              onSelectVersion={(id) => setViewingId(id)}
              onEdit={(it) => setForm({ mode: 'edit', item: it })}
              onDelete={(it) => setDeleteTarget(it)}
              onBackToList={() => { setMobileDetail(false); scrollToTop() }}
            />
          ) : (
            <div className="rounded-lg border border-dashed border-[#e8ddd0] bg-white/60 px-4 py-16 text-center">
              <Tags className="h-8 w-8 text-[#d4bda0] mx-auto mb-2" />
              <p className="text-sm text-[#a08060]">請從左側選擇產品查看售價</p>
            </div>
          )}
        </div>
      </div>

      {form && (
        <PriceFormDialog
          open
          mode={form.mode}
          item={form.item}
          allItems={items}
          onClose={() => setForm(null)}
          onSaved={handleSaved}
        />
      )}

      {canEdit && (
        <PriceImportDialog
          open={importOpen}
          existing={items}
          onClose={() => setImportOpen(false)}
          onImported={handleImported}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title={deleting ? '刪除中…' : '刪除此售價版本？'}
        message={deleteTarget
          ? `「${deleteTarget.name}」生效日期 ${formatDate(deleteTarget.effective_date)} 的版本將被刪除，無法還原。${deleteIsLast ? '這是此產品唯一的版本，刪除後產品會從清單消失。' : ''}`
          : undefined}
        confirmLabel="刪除"
        danger
        onConfirm={() => { if (!deleting) confirmDelete() }}
        onCancel={() => { if (!deleting) setDeleteTarget(null) }}
      />

      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[210] max-w-[90vw] px-4 py-2 rounded-lg text-sm shadow-lg ${
            toast.tone === 'warn' ? 'bg-[#fdf3e3] text-[#8a5a1c] border border-[#e8c9a0]' : 'bg-[#2c1e12] text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  )
}
