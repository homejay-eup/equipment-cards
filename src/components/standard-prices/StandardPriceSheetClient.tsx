'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileUp, History, Loader2, Trash2, AlertTriangle, Pencil, ClipboardList } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { StandardPriceSheet, StandardPriceSheetMeta } from '@/types/standardPrice'
import { extractSheetData, isLegacySheet, type SheetData } from '@/lib/priceSheetTemplate'
import SheetUploadDialog from './SheetUploadDialog'
import SheetEditor from './SheetEditor'
import SheetRevisionsDialog from './SheetRevisionsDialog'
import { importLegacySheet } from './legacySheetImport'
import { emailName, formatDateTime, formatMonth, readApiError } from './standardPriceUtils'

interface Props {
  canEdit: boolean
}

// 價目表一律以淺色顯示：來源 HTML 會跟著作業系統切深色，跟料卡系統的淺色主題不搭。
// 來源 HTML 支援 :root[data-theme="light"] 強制淺色，這裡只補上 <html data-theme="light">，不改其他內容。
function forceLightTheme(html: string): string {
  if (/<html[^>]*\sdata-theme=/i.test(html)) return html
  if (/<html[\s>]/i.test(html)) return html.replace(/<html(?=[\s>])/i, '<html data-theme="light"')
  return `<html data-theme="light">${html}</html>`
}

// Step 47：標準售價頁籤改為整份 HTML 價目表原樣顯示。
// 安全性：HTML 放在 sandbox iframe（只允許 allow-scripts / allow-popups，不給 allow-same-origin），
// 內容的程式碼跑在獨立的 opaque origin，讀不到料卡系統的 cookie / DOM / API。
export default function StandardPriceSheetClient({ canEdit }: Props) {
  const [sheets, setSheets] = useState<StandardPriceSheetMeta[]>([])
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cache, setCache] = useState<Record<string, StandardPriceSheet>>({})
  const [sheetError, setSheetError] = useState<string | null>(null)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // Step 48：編輯器（editing 有值＝開啟中）
  const [editing, setEditing] = useState<{ data: SheetData; base: StandardPriceSheetMeta; current: boolean } | null>(null)
  const [opening, setOpening] = useState(false)
  const [revisionsOpen, setRevisionsOpen] = useState(false)

  const loadList = useCallback(async (selectId?: string) => {
    setListLoading(true)
    setListError(null)
    try {
      const res = await fetch('/api/standard-prices/sheets')
      if (!res.ok) { setListError(await readApiError(res, '讀取價目表失敗')); return }
      const json = await res.json()
      const list: StandardPriceSheetMeta[] = json.sheets ?? []
      setSheets(list)
      setSelectedId(prev => selectId ?? (prev && list.some(s => s.id === prev) ? prev : list[0]?.id ?? null))
    } catch {
      setListError('讀取價目表失敗')
    } finally {
      setListLoading(false)
    }
  }, [])

  useEffect(() => { loadList() }, [loadList])

  // 選到的版本還沒抓過 html 才去抓；抓過的放 cache，切換歷史版本不重抓
  useEffect(() => {
    if (!selectedId || cache[selectedId]) return
    let cancelled = false
    setSheetError(null)
    fetch(`/api/standard-prices/sheets/${selectedId}`)
      .then(async (res) => {
        if (!res.ok) { if (!cancelled) setSheetError(await readApiError(res, '讀取價目表內容失敗')); return }
        const json = await res.json()
        if (!cancelled) setCache(c => ({ ...c, [selectedId]: json.sheet }))
      })
      .catch(() => { if (!cancelled) setSheetError('讀取價目表內容失敗') })
    return () => { cancelled = true }
  }, [selectedId, cache])

  const selectedMeta = sheets.find(s => s.id === selectedId) ?? null
  const isCurrent = !!selectedMeta && sheets[0]?.id === selectedMeta.id
  const selectedSheet = selectedId ? cache[selectedId] : undefined
  const srcDoc = useMemo(() => (selectedSheet ? forceLightTheme(selectedSheet.html) : ''), [selectedSheet])

  // 用編輯器存的版本直接讀內嵌資料；2026/10/1 原始版另外轉換；其他手動上傳的 HTML 無法編輯
  async function openEditor() {
    if (!selectedSheet || !selectedMeta) return
    setSheetError(null)
    let data = extractSheetData(selectedSheet.html)
    if (!data && isLegacySheet(selectedSheet.html)) {
      setOpening(true)
      data = await importLegacySheet(selectedSheet.html)
      setOpening(false)
    }
    if (!data) { setSheetError('這個版本不是用編輯器格式製作的 HTML，無法直接編輯，請改用「上傳新版」'); return }
    setEditing({ data, base: selectedMeta, current: isCurrent })
  }

  // 存檔／還原後：該版本的 html 快取作廢，重新抓清單（會帶回新的最後修改時間）
  function afterSaved(sheet: StandardPriceSheetMeta) {
    setCache(c => { const next = { ...c }; delete next[sheet.id]; return next })
    loadList(sheet.id)
  }

  async function confirmDelete() {
    if (!selectedMeta) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/standard-prices/sheets/${selectedMeta.id}`, { method: 'DELETE' })
      if (!res.ok) { setSheetError(await readApiError(res, '刪除失敗')); return }
      setDeleteOpen(false)
      setSelectedId(null)
      await loadList()
    } finally {
      setDeleting(false)
    }
  }

  const deleteMessage = selectedMeta
    ? `「${selectedMeta.title}」（生效 ${formatMonth(selectedMeta.effective_date)}）將被刪除，無法還原。` +
      (sheets.length === 1 ? '這是唯一的版本，刪除後頁籤會是空的。' : isCurrent ? '刪除後會改顯示上一個版本。' : '')
    : undefined

  return (
    <div className="max-w-7xl mx-auto px-4 pb-6">
      {/* 工具列：標題＋生效月份＋歷史版本切換＋（可編輯）刪除/上傳 */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {selectedMeta ? (
            <>
              <span className="text-sm font-semibold text-[#2c1e12] truncate">{selectedMeta.title}</span>
              <span className="text-xs text-[#6b4f38] bg-white border border-[#e8ddd0] rounded-full px-2 py-0.5 whitespace-nowrap">
                生效 {formatMonth(selectedMeta.effective_date)}
              </span>
              {isCurrent
                ? <span className="text-xs text-white bg-[#7a5230] rounded-full px-2 py-0.5 whitespace-nowrap">現行</span>
                : <span className="text-xs text-[#8a5a1c] bg-[#fdf3e3] rounded-full px-2 py-0.5 whitespace-nowrap">歷史版本</span>}
              {selectedMeta.updated_at && (
                <span className="text-xs text-[#a08060] whitespace-nowrap" title="細節修改不會新增版本">
                  最後修改 {formatDateTime(selectedMeta.updated_at)} · {emailName(selectedMeta.updated_by)}
                </span>
              )}
            </>
          ) : (
            <span className="text-sm text-[#a08060]">{listLoading ? '載入中…' : '尚未上傳價目表'}</span>
          )}
        </div>

        {sheets.length > 1 && (
          <label className="flex items-center gap-1.5 text-sm text-[#6b4f38]">
            <History className="h-4 w-4 text-[#a08060]" />
            <select
              value={selectedId ?? ''}
              onChange={e => setSelectedId(e.target.value)}
              className="h-9 border border-[#e8ddd0] rounded-md text-sm bg-white text-[#2c1e12] px-2 focus:outline-none focus:ring-1 focus:ring-[#c49a72]"
            >
              {sheets.map((s, i) => (
                <option key={s.id} value={s.id}>
                  {formatMonth(s.effective_date)}{i === 0 ? '（現行）' : ''} · {s.title}
                </option>
              ))}
            </select>
          </label>
        )}

        {canEdit && selectedMeta?.updated_at && (
          <button
            onClick={() => setRevisionsOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] transition-colors"
          >
            <ClipboardList className="h-4 w-4" />
            修改紀錄
          </button>
        )}
        {canEdit && selectedMeta && (
          <button
            onClick={() => setDeleteOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#a08060] hover:text-[#b5451b] hover:border-[rgba(181,69,27,.3)] transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            刪除此版本
          </button>
        )}
        {canEdit && selectedSheet && (
          <button
            onClick={openEditor}
            disabled={opening}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#7a5230] hover:border-[#c49a72] disabled:opacity-50 transition-colors"
          >
            {opening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Pencil className="h-4 w-4" />}
            編輯
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => setUploadOpen(true)}
            className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#7a5230] text-white text-sm font-medium hover:bg-[#9c6b42] transition-colors shadow-[0_0_10px_rgba(122,82,48,.3)]"
          >
            <FileUp className="h-4 w-4" />
            上傳新版
          </button>
        )}
      </div>

      {(listError || sheetError) && (
        <div className="flex items-center gap-1.5 text-sm text-[#b5451b] mb-3">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{listError ?? sheetError}</span>
        </div>
      )}

      {/* 價目表本體 */}
      <div className="rounded-xl border border-[#e8ddd0] bg-white overflow-hidden">
        {selectedSheet ? (
          <iframe
            key={selectedSheet.id}
            title={selectedSheet.title}
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-popups"
            className="w-full block"
            style={{ height: 'calc(100vh - 190px)', minHeight: 560 }}
          />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 py-24 text-sm text-[#a08060]">
            {listLoading || (selectedId && !sheetError) ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <span>{canEdit ? '尚未上傳價目表，請按右上角「上傳新版」' : '尚未上傳價目表，如有需要請聯繫 Lala 協助處理。'}</span>
            )}
          </div>
        )}
      </div>

      {canEdit && (
        <SheetUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          onUploaded={(sheet) => { setUploadOpen(false); loadList(sheet.id) }}
        />
      )}

      {editing && (
        <SheetEditor
          initial={editing.data}
          baseMeta={editing.base}
          canOverwrite={editing.current}
          onClose={() => setEditing(null)}
          onSaved={(sheet) => { setEditing(null); afterSaved(sheet) }}
        />
      )}

      {revisionsOpen && selectedMeta && (
        <SheetRevisionsDialog
          sheet={selectedMeta}
          canRestore={isCurrent}
          onClose={() => setRevisionsOpen(false)}
          onRestored={(sheet) => { setRevisionsOpen(false); afterSaved(sheet) }}
        />
      )}

      <ConfirmDialog
        open={deleteOpen}
        title={deleting ? '刪除中…' : '刪除此價目表版本？'}
        message={deleteMessage}
        confirmLabel="刪除"
        danger
        onConfirm={() => { if (!deleting) confirmDelete() }}
        onCancel={() => { if (!deleting) setDeleteOpen(false) }}
      />
    </div>
  )
}
