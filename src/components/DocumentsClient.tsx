'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import {
  RefreshCw, ExternalLink, Upload, X, Trash2, Loader2, FileText,
  Search, ChevronDown, AlertTriangle,
} from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useDocumentUpload, DocumentAllRecord } from '@/hooks/useDocumentUpload'

interface Props {
  allCards: EquipmentCard[]
  documentTypes: string[]
  onBusyChange?: (busy: boolean) => void
}

type RowStatus = 'pending' | 'uploading' | 'done' | 'error'

interface BatchRow {
  localId: string
  file: File
  displayName: string
  type: string
  equipmentIds: string[]
  duplicateOfId: string | null    // 「取代（更新版本）」：目標既有文件 id
  replaceDeleteId: string | null  // 「先刪除舊的再上傳」：要整個報廢的既有文件 id
  status: RowStatus
  error?: string
}

interface DuplicatePromptState {
  file: File
  displayName: string
  match: DocumentAllRecord
  resolve: () => void
}

interface DeleteReuploadConfirmState {
  file: File
  displayName: string
  match: DocumentAllRecord
  resolve: () => void
}

interface DeleteDocsConfirmState {
  docs: DocumentAllRecord[]
}

// 料卡多選挑選器：搜尋 + 勾選清單，樣式比照全站既有下拉/彈窗風格（FieldSelect / SubfilterTagBar）
function EquipmentPicker({
  allCards, selectedIds, onChange, disabled,
}: {
  allCards: EquipmentCard[]
  selectedIds: string[]
  onChange: (ids: string[]) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const fuse = useMemo(() => new Fuse(allCards, {
    keys: [{ name: 'equipment_id', weight: 2 }, { name: 'name', weight: 2 }],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [allCards])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return allCards.slice(0, 50)
    if (/^\d+$/.test(q)) return allCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q)).slice(0, 50)
    return fuse.search(q).map(r => r.item).slice(0, 50)
  }, [query, allCards, fuse])

  function toggle(id: string) {
    onChange(selectedIds.includes(id) ? selectedIds.filter(i => i !== id) : [...selectedIds, id])
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => !disabled && setOpen(v => !v)} disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-[#faf6f0] text-[#6b4f38] hover:border-[rgba(122,82,48,.35)] disabled:opacity-50 transition-colors">
        <Search className="h-3 w-3" />
        選擇料卡{selectedIds.length > 0 ? `（已選 ${selectedIds.length}）` : ''}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 left-0 w-64 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden">
          <div className="p-2 border-b border-[rgba(122,82,48,.1)]">
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜尋料號、品名…" autoFocus
              className="w-full border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#a08060]">沒有符合的料卡</p>
            ) : results.map(c => {
              const checked = selectedIds.includes(c.equipment_id)
              return (
                <label key={c.equipment_id} className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.06)]">
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.equipment_id)} className="accent-[#7a5230]" />
                  <span className="truncate text-[#4a3422]">{c.equipment_id} {c.name}</span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default function DocumentsClient({ allCards, documentTypes, onBusyChange }: Props) {
  const docApi = useDocumentUpload()
  const cardNameById = useMemo(() => new Map(allCards.map(c => [c.equipment_id, c.name])), [allCards])

  function formatDateTime(iso: string) {
    try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) } catch { return iso }
  }

  // ── 重新產生目錄檔（無讀取用 API，僅能顯示本次工作階段內產生過的時間） ──
  const [regenerating, setRegenerating] = useState(false)
  const [regenResult, setRegenResult] = useState<{ generated_at: string; sheet_url: string } | null>(null)
  const [regenError, setRegenError] = useState<string | null>(null)

  async function handleRegenerate() {
    setRegenerating(true)
    setRegenError(null)
    try {
      const result = await docApi.regenerateIndex()
      setRegenResult(result)
    } catch (e) {
      setRegenError(e instanceof Error ? e.message : '重新產生目錄檔失敗')
    } finally {
      setRegenerating(false)
    }
  }

  // ── 文件清單 ────────────────────────────────────────────
  const [documents, setDocuments] = useState<DocumentAllRecord[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState<string | null>(null)
  const [listQuery, setListQuery] = useState('')

  async function refreshDocuments() {
    setDocsLoading(true)
    setDocsError(null)
    try {
      const all = await docApi.listAll()
      setDocuments(all)
    } catch (e) {
      setDocsError(e instanceof Error ? e.message : '查詢文件清單失敗')
    } finally {
      setDocsLoading(false)
    }
  }

  useEffect(() => { refreshDocuments() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const filteredDocuments = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    if (!q) return documents
    return documents.filter(d => d.name.toLowerCase().includes(q))
  }, [documents, listQuery])

  // ── 批次刪除 ────────────────────────────────────────────
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteDocsConfirmState | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteRunning, setDeleteRunning] = useState(false)
  // 批次刪除逐筆真實結果：unlink 若中途失敗，不能靜默吞掉——記錄下來明確告知使用者
  // 哪些文件沒有完全解除關聯，避免誤以為「按了刪除＝已經刪乾淨」
  const [deleteErrors, setDeleteErrors] = useState<string[]>([])

  function toggleSelectDoc(id: string) {
    setSelectedDocIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function askBatchDelete() {
    const docs = documents.filter(d => selectedDocIds.has(d.id))
    if (docs.length === 0) return
    setDeleteConfirm({ docs })
  }

  async function handleConfirmBatchDelete() {
    if (!deleteConfirm) return
    const { docs } = deleteConfirm
    setDeleteConfirm(null)
    setDeleteRunning(true)
    setDeleteErrors([])
    onBusyChange?.(true)
    const failedNames: string[] = []
    for (const doc of docs) {
      setDeletingIds(prev => new Set([...Array.from(prev), doc.id]))
      let hadFailure = false
      // 逐張料卡各自 try/catch：同一份文件掛載多張料卡時，其中一張解除失敗
      // 不該連帶擋住其他張的解除（否則會卡在「怎麼解除都解除不完」）
      for (const card of doc.linked_cards) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await docApi.unlink(doc.id, card.equipment_id)
        } catch (e) {
          hadFailure = true
          console.error('[DocumentsClient] batch delete unlink failed', doc.id, card.equipment_id, e)
        }
      }
      if (hadFailure) failedNames.push(doc.name)
      setDeletingIds(prev => {
        const n = new Set(prev)
        n.delete(doc.id)
        return n
      })
    }
    setSelectedDocIds(new Set())
    setDeleteRunning(false)
    onBusyChange?.(false)
    if (failedNames.length > 0) setDeleteErrors(failedNames)
    await refreshDocuments()
  }

  // ── 批次上傳 ────────────────────────────────────────────
  const batchFileRef = useRef<HTMLInputElement>(null)
  const [rows, setRows] = useState<BatchRow[]>([])
  // rows 的同步鏡像：handleBatchFilesChosen 在同一個事件 closure 裡連續 await 處理多個檔案，
  // 中間沒有機會等 React state 提交/重新渲染，讀 rows state 會讀到還沒加入前一個檔案的舊值。
  // 這個 ref 在每次 setRows 的當下同步更新，讓 addBatchFile 的本批次內查重可以讀到最新結果
  // （比照 CardFormDialog.tsx 的 pendingDocUploadsRef 模式）。
  const rowsRef = useRef<BatchRow[]>([])
  const [batchNotice, setBatchNotice] = useState<string | null>(null)
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [duplicatePrompt, setDuplicatePrompt] = useState<DuplicatePromptState | null>(null)
  const [deleteReuploadConfirm, setDeleteReuploadConfirm] = useState<DeleteReuploadConfirmState | null>(null)

  function addRow(partial: Omit<BatchRow, 'localId' | 'status'>) {
    setRows(prev => {
      const next = [...prev, { ...partial, localId: `${Date.now()}_${prev.length}`, status: 'pending' as const }]
      rowsRef.current = next
      return next
    })
  }

  function removeRow(localId: string) {
    setRows(prev => {
      const next = prev.filter(r => r.localId !== localId)
      rowsRef.current = next
      return next
    })
  }

  function updateRowType(localId: string, type: string) {
    setRows(prev => {
      const next = prev.map(r => r.localId === localId ? { ...r, type } : r)
      rowsRef.current = next
      return next
    })
  }

  function updateRowEquipmentIds(localId: string, ids: string[]) {
    setRows(prev => {
      const next = prev.map(r => r.localId === localId ? { ...r, equipmentIds: ids } : r)
      rowsRef.current = next
      return next
    })
  }

  async function handleBatchFilesChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    setBatchNotice(null)
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await addBatchFile(file)
    }
  }

  // 查重：本批次內尚未送出的其他列 + 目前已載入的文件清單（listAll 的快照，非即時，
  // 但這個頁面本來就需要 manage_documents 權限才看得到，跟 documents state 是同一份資料）
  async function addBatchFile(file: File) {
    const displayName = file.name.replace(/\.[^/.]+$/, '')
    const defaultType = documentTypes[0] ?? '規格書'

    const dupRowIdx = rowsRef.current.findIndex(r =>
      r.status === 'pending' && r.displayName.trim().toLowerCase() === displayName.trim().toLowerCase(),
    )
    if (dupRowIdx !== -1) {
      setBatchNotice(`「${file.name}」與本批次第 ${dupRowIdx + 1} 列同名，請直接在該列勾選要掛載的料卡，未另外加入新的一列`)
      return
    }

    const duplicate = documents.find(d => d.name.trim().toLowerCase() === displayName.trim().toLowerCase()) ?? null

    if (!duplicate) {
      addRow({ file, displayName, type: defaultType, equipmentIds: [], duplicateOfId: null, replaceDeleteId: null })
      return
    }

    await new Promise<void>(resolve => {
      setDuplicatePrompt({ file, displayName, match: duplicate, resolve })
    })
  }

  function handleDupReplace() {
    if (!duplicatePrompt) return
    const { file, displayName, match, resolve } = duplicatePrompt
    setDuplicatePrompt(null)
    addRow({ file, displayName, type: match.type, equipmentIds: [], duplicateOfId: match.id, replaceDeleteId: null })
    resolve()
  }

  async function handleDupDeleteReupload() {
    if (!duplicatePrompt) return
    const { file, displayName, match, resolve } = duplicatePrompt
    setDuplicatePrompt(null)
    if (match.linked_cards.length === 0) {
      addRow({ file, displayName, type: documentTypes[0] ?? '規格書', equipmentIds: [], duplicateOfId: null, replaceDeleteId: match.id })
      resolve()
      return
    }
    setDeleteReuploadConfirm({ file, displayName, match, resolve })
  }

  async function submitRow(row: BatchRow) {
    setRows(prev => {
      const next = prev.map(r => r.localId === row.localId ? { ...r, status: 'uploading' as const, error: undefined } : r)
      rowsRef.current = next
      return next
    })
    try {
      if (row.replaceDeleteId) {
        const oldDoc = documents.find(d => d.id === row.replaceDeleteId)
        if (oldDoc) {
          for (const card of oldDoc.linked_cards) {
            // eslint-disable-next-line no-await-in-loop
            await docApi.unlink(oldDoc.id, card.equipment_id)
          }
        }
      }
      if (row.duplicateOfId) {
        if (row.equipmentIds.length === 0) throw new Error('請至少選擇一張要掛載的料卡')
        await docApi.updateVersion(row.duplicateOfId, row.file)
        const oldDoc = documents.find(d => d.id === row.duplicateOfId)
        const alreadyLinked = new Set((oldDoc?.linked_cards ?? []).map(c => c.equipment_id))
        for (const eid of row.equipmentIds) {
          if (!alreadyLinked.has(eid)) {
            // eslint-disable-next-line no-await-in-loop
            await docApi.link(row.duplicateOfId, eid)
          }
        }
      } else {
        if (row.equipmentIds.length === 0) throw new Error('請至少選擇一張要掛載的料卡')
        await docApi.upload(row.file, row.type, row.equipmentIds, row.displayName)
      }
      setRows(prev => {
        const next = prev.map(r => r.localId === row.localId ? { ...r, status: 'done' as const } : r)
        rowsRef.current = next
        return next
      })
    } catch (e) {
      setRows(prev => {
        const next = prev.map(r => r.localId === row.localId
          ? { ...r, status: 'error' as const, error: e instanceof Error ? e.message : '上傳失敗' }
          : r)
        rowsRef.current = next
        return next
      })
    }
  }

  async function handleSubmitBatch() {
    setBatchSubmitting(true)
    onBusyChange?.(true)
    const pending = rows.filter(r => r.status === 'pending' || r.status === 'error')
    for (const row of pending) {
      // eslint-disable-next-line no-await-in-loop
      await submitRow(row)
    }
    setBatchSubmitting(false)
    onBusyChange?.(false)
    await refreshDocuments()
  }

  function clearDoneRows() {
    setRows(prev => {
      const next = prev.filter(r => r.status !== 'done')
      rowsRef.current = next
      return next
    })
  }

  const hasPendingRows = rows.some(r => r.status === 'pending' || r.status === 'error')

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16 space-y-6">
      {/* 重新產生目錄檔 */}
      <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-sm font-semibold text-[#6b4f38]">文件目錄表（Google Sheet）</h3>
            <p className="text-xs text-[#a08060] mt-0.5">
              {regenResult
                ? `本次工作階段已於 ${formatDateTime(regenResult.generated_at)} 產生`
                : '尚未在本次工作階段產生過，點擊右方按鈕重新產生'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {regenResult && (
              <a href={regenResult.sheet_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors">
                <ExternalLink className="h-3.5 w-3.5" />
                開啟目錄表
              </a>
            )}
            <button onClick={handleRegenerate} disabled={regenerating}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {regenerating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              {regenResult ? '重新產生' : '產生目錄檔'}
            </button>
          </div>
        </div>
        {regenError && <p className="text-xs text-[#b5451b] mt-2">{regenError}</p>}
      </div>

      {/* 批次上傳 */}
      <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-[#6b4f38]">批次上傳</h3>
          <button onClick={() => batchFileRef.current?.click()} disabled={batchSubmitting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7a5230] border border-dashed border-[rgba(122,82,48,.35)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-50 transition-colors">
            <Upload className="h-3.5 w-3.5" />
            選擇檔案（可多選）
          </button>
          <input ref={batchFileRef} type="file" multiple className="hidden" onChange={handleBatchFilesChosen} />
        </div>

        {batchNotice && (
          <div className="flex items-start gap-2 text-xs text-[#8a5a12] bg-[rgba(196,154,114,.15)] border border-[rgba(196,154,114,.4)] rounded-lg px-3 py-2 mb-3">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>{batchNotice}</span>
          </div>
        )}

        {rows.length === 0 ? (
          <p className="text-xs text-[#a08060]">尚未選擇檔案</p>
        ) : (
          <div className="space-y-2">
            {rows.map((row, idx) => (
              <div key={row.localId} className={`flex flex-col gap-2 p-2.5 rounded-lg border ${
                row.status === 'error' ? 'bg-[rgba(181,69,27,.05)] border-[rgba(181,69,27,.25)]'
                : row.status === 'done' ? 'bg-[rgba(122,82,48,.05)] border-[rgba(122,82,48,.15)]'
                : 'bg-[#f2ebe0] border-[#c49a72]'
              }`}>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-[#a08060] w-5 flex-shrink-0">{idx + 1}.</span>
                  <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                  <span className="flex-1 text-xs text-[#4a3422] truncate">{row.file.name}</span>
                  {row.duplicateOfId && <span className="text-[10px] text-[#7a5230] flex-shrink-0">取代版本</span>}
                  {row.replaceDeleteId && <span className="text-[10px] text-[#b5451b] flex-shrink-0">舊文件將移除</span>}
                  {row.status === 'uploading' && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#7a5230] flex-shrink-0" />}
                  {row.status === 'done' && <span className="text-[10px] text-[#7a5230] flex-shrink-0">已完成</span>}
                  <button type="button" onClick={() => removeRow(row.localId)} disabled={row.status === 'uploading'}
                    className="text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-30 transition-colors flex-shrink-0">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={row.type} onChange={e => updateRowType(row.localId, e.target.value)}
                    disabled={row.status === 'uploading' || row.status === 'done'}
                    className="border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50">
                    {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <EquipmentPicker
                    allCards={allCards}
                    selectedIds={row.equipmentIds}
                    onChange={ids => updateRowEquipmentIds(row.localId, ids)}
                    disabled={row.status === 'uploading' || row.status === 'done'}
                  />
                  {row.equipmentIds.length > 0 && (
                    <span className="text-[10px] text-[#a08060] truncate">
                      {row.equipmentIds.map(id => `${id}${cardNameById.get(id) ? ' ' + cardNameById.get(id) : ''}`).join('、')}
                    </span>
                  )}
                </div>
                {row.status === 'error' && (
                  <p className="text-[10px] text-[#b5451b]">{row.error}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {rows.length > 0 && (
          <div className="flex items-center gap-2 mt-3">
            <button onClick={handleSubmitBatch} disabled={batchSubmitting || !hasPendingRows}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {batchSubmitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              確認上傳
            </button>
            <button onClick={clearDoneRows} disabled={batchSubmitting || !rows.some(r => r.status === 'done')}
              className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] disabled:opacity-40 transition-colors">
              清除已完成
            </button>
          </div>
        )}
      </div>

      {/* 文件清單 + 批次刪除 */}
      <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-sm font-semibold text-[#6b4f38]">文件清單（共 {documents.length} 份）</h3>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
              <input value={listQuery} onChange={e => setListQuery(e.target.value)} placeholder="搜尋文件名稱…"
                className="pl-7 pr-2 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]" />
            </div>
            <button onClick={askBatchDelete} disabled={selectedDocIds.size === 0 || deleteRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#b5451b] border border-[rgba(181,69,27,.3)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-40 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              批次刪除（{selectedDocIds.size}）
            </button>
          </div>
        </div>

        {docsError && <p className="text-xs text-[#b5451b] mb-2">{docsError}</p>}

        {deleteErrors.length > 0 && (
          <div className="flex items-start gap-2 text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2 mb-2">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
            <span>以下文件刪除時部分料卡關聯解除失敗，可能仍留有殘留關聯，請確認後重新嘗試：{deleteErrors.join('、')}</span>
          </div>
        )}

        {docsLoading ? (
          <div className="flex items-center gap-2 text-xs text-[#a08060] py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
          </div>
        ) : filteredDocuments.length === 0 ? (
          <p className="text-xs text-[#a08060] py-6 text-center">沒有符合的文件</p>
        ) : (
          <div className="border border-[#e8ddd0] rounded-lg overflow-hidden">
            <div className="grid grid-cols-[28px_1fr_100px_80px_140px] gap-2 px-3 py-2 bg-[#faf6f0] border-b border-[#e8ddd0] text-[10px] font-semibold text-[#a08060]">
              <span />
              <span>檔名</span>
              <span>類型</span>
              <span className="text-right">掛載張數</span>
              <span>更新日期</span>
            </div>
            {filteredDocuments.map(doc => {
              const isDeleting = deletingIds.has(doc.id)
              return (
                <div key={doc.id} className={`grid grid-cols-[28px_1fr_100px_80px_140px] gap-2 px-3 py-2 items-center text-xs border-t border-[#f0e8dc] ${isDeleting ? 'opacity-50' : ''}`}>
                  <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleSelectDoc(doc.id)}
                    disabled={isDeleting} className="accent-[#7a5230]" />
                  <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[#4a3422] hover:text-[#7a5230] truncate">
                    <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                    <span className="truncate">{doc.name}</span>
                  </a>
                  <span className="text-[#6b4f38] truncate">{doc.type}</span>
                  <span className="text-right text-[#6b4f38]">{doc.linked_cards.length}</span>
                  <span className="text-[#a08060]">
                    {isDeleting ? <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />處理中</span> : formatDateTime(doc.updated_at)}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* 同名文件二選一 */}
      <ConfirmDialog
        open={!!duplicatePrompt}
        title="發現同名文件"
        message={duplicatePrompt ? `已有相同名稱的文件「${duplicatePrompt.match.name}」，請選擇處理方式：` : undefined}
        confirmLabel="取代（更新版本）"
        cancelLabel="先刪除舊的再上傳"
        onConfirm={handleDupReplace}
        onCancel={handleDupDeleteReupload}
      />

      {/* 先刪除舊的再上傳：舊文件還掛載在其他料卡的二次確認 */}
      <ConfirmDialog
        open={!!deleteReuploadConfirm}
        title="這份文件掛載在多張料卡"
        message={
          deleteReuploadConfirm
            ? `這份文件目前掛載在以下料卡：${deleteReuploadConfirm.match.linked_cards.map(c => `${c.equipment_id} ${c.name}`).join('、')}，確定要一併移除嗎？`
            : undefined
        }
        confirmLabel="確定一併移除"
        cancelLabel="取消（不處理這份檔案）"
        danger
        onConfirm={() => {
          if (!deleteReuploadConfirm) return
          const { file, displayName, match, resolve } = deleteReuploadConfirm
          setDeleteReuploadConfirm(null)
          addRow({ file, displayName, type: documentTypes[0] ?? '規格書', equipmentIds: [], duplicateOfId: null, replaceDeleteId: match.id })
          resolve()
        }}
        onCancel={() => {
          if (!deleteReuploadConfirm) return
          const { resolve } = deleteReuploadConfirm
          setDeleteReuploadConfirm(null)
          resolve()
        }}
      />

      {/* 批次刪除確認：列出每份文件目前掛載的料卡 */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title={`確定刪除 ${deleteConfirm?.docs.length ?? 0} 份文件？`}
        message="刪除後會解除所有掛載關聯，Google Drive 檔案會移到「_待清除文件」資料夾。"
        detail={deleteConfirm?.docs.map(d =>
          `${d.name}（${d.linked_cards.length > 0 ? d.linked_cards.map(c => `${c.equipment_id} ${c.name}`).join('、') : '未掛載任何料卡'}）`,
        ).join('\n')}
        confirmLabel="確定刪除"
        danger
        onConfirm={handleConfirmBatchDelete}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  )
}
