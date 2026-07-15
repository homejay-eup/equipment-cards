'use client'

import { useState, useMemo } from 'react'
import {
  FileText, Loader2, Search, Trash2, AlertTriangle, X,
  ChevronRight, ChevronDown, Download,
} from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useDocumentUpload, DocumentAllRecord } from '@/hooks/useDocumentUpload'
import EquipmentQuickPick from './EquipmentQuickPick'
import AddDocumentToCard from './AddDocumentToCard'
import SortHeader, { SortDir } from './SortHeader'

type ViewMode = 'byDoc' | 'byCard'
type DocSortKey = 'name' | 'type' | 'count' | 'updated_at'
type CardSortKey = 'equipment_id' | 'name' | 'count'

interface CardDocGroup {
  equipment_id: string
  name: string
  docs: DocumentAllRecord[]
}

interface UnlinkConfirmState {
  documentId: string
  documentName: string
  equipmentId: string
}

interface DeleteDocsConfirmState {
  docs: DocumentAllRecord[]
}

interface Props {
  documents: DocumentAllRecord[]
  allCards: EquipmentCard[]
  documentTypes: string[]
  loading: boolean
  error: string | null
  formatDateTime: (iso: string) => string
  onChanged: () => void | Promise<void>
  onBusyChange?: (busy: boolean) => void
}

// 文件清單：依文件／依料號雙視圖可展開清單。抽出自 DocumentsClient.tsx，
// 自行管理搜尋、排序、展開/摺疊、掛載/取消掛載、批次刪除（僅依文件視圖）、CSV 匯出，
// 對外只需要 documents 快照與一個「資料異動後請重新整理」的 callback
export default function ExpandableDocumentList({
  documents, allCards, documentTypes, loading, error, formatDateTime, onChanged, onBusyChange,
}: Props) {
  const docApi = useDocumentUpload()
  const [view, setView] = useState<ViewMode>('byDoc')
  const [listQuery, setListQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [docSort, setDocSort] = useState<{ key: DocSortKey; dir: SortDir }>({ key: 'updated_at', dir: 'desc' })
  const [cardSort, setCardSort] = useState<{ key: CardSortKey; dir: SortDir }>({ key: 'equipment_id', dir: 'asc' })
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)
  const [unlinkConfirm, setUnlinkConfirm] = useState<UnlinkConfirmState | null>(null)

  // ── 批次刪除（僅依文件視圖，勾選多筆整批刪除，維持既有功能不變） ──
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set())
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteDocsConfirmState | null>(null)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set())
  const [deleteRunning, setDeleteRunning] = useState(false)
  const [deleteErrors, setDeleteErrors] = useState<string[]>([])

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  function toggleSelectDoc(id: string) {
    setSelectedDocIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // ── 依料號分組：純前端把 documents 的 linked_cards 反過來分組，不用新 API ──
  const cardGroups = useMemo<CardDocGroup[]>(() => {
    const map = new Map<string, CardDocGroup>()
    for (const doc of documents) {
      for (const link of doc.linked_cards) {
        let g = map.get(link.equipment_id)
        if (!g) { g = { equipment_id: link.equipment_id, name: link.name, docs: [] }; map.set(link.equipment_id, g) }
        g.docs.push(doc)
      }
    }
    return Array.from(map.values())
  }, [documents])

  const filteredDocs = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    const base = q ? documents.filter(d => d.name.toLowerCase().includes(q)) : documents
    const dir = docSort.dir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      switch (docSort.key) {
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'type': return a.type.localeCompare(b.type) * dir
        case 'count': return (a.linked_cards.length - b.linked_cards.length) * dir
        case 'updated_at': return (new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()) * dir
        default: return 0
      }
    })
  }, [documents, listQuery, docSort])

  const filteredCardGroups = useMemo(() => {
    const q = listQuery.trim().toLowerCase()
    const base = q
      ? cardGroups.filter(g => g.equipment_id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
      : cardGroups
    const dir = cardSort.dir === 'asc' ? 1 : -1
    return [...base].sort((a, b) => {
      switch (cardSort.key) {
        case 'equipment_id': return a.equipment_id.localeCompare(b.equipment_id) * dir
        case 'name': return a.name.localeCompare(b.name) * dir
        case 'count': return (a.docs.length - b.docs.length) * dir
        default: return 0
      }
    })
  }, [cardGroups, listQuery, cardSort])

  function handleDocSort(key: DocSortKey) {
    setDocSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }
  function handleCardSort(key: CardSortKey) {
    setCardSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  // ── 取消掛載：若這是文件目前唯一僅存的關聯，解除後文件本體會被整個刪除，
  // 比照批次刪除的警告文案先跳確認框，不直接動作 ──
  function requestUnlink(doc: { id: string; name: string; linked_cards: { equipment_id: string; name: string }[] }, equipmentId: string) {
    if (doc.linked_cards.length <= 1) {
      setUnlinkConfirm({ documentId: doc.id, documentName: doc.name, equipmentId })
      return
    }
    doUnlink(doc.id, equipmentId)
  }

  async function doUnlink(documentId: string, equipmentId: string) {
    setActionError(null)
    setBusyIds(prev => new Set([...Array.from(prev), documentId]))
    try {
      await docApi.unlink(documentId, equipmentId)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '解除掛載失敗')
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(documentId); return n })
    }
  }

  async function handleLinkExisting(documentId: string, equipmentId: string) {
    setActionError(null)
    try {
      await docApi.link(documentId, equipmentId)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '掛載失敗')
    }
  }

  async function handleUploadNewToCard(equipmentId: string, file: File, type: string) {
    setActionError(null)
    try {
      const displayName = file.name.replace(/\.[^/.]+$/, '')
      await docApi.upload(file, type, [equipmentId], displayName)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '上傳失敗')
    }
  }

  // ── 批次刪除 ────────────────────────────────────────────
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
      for (const card of doc.linked_cards) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await docApi.unlink(doc.id, card.equipment_id)
        } catch (e) {
          hadFailure = true
          console.error('[ExpandableDocumentList] batch delete unlink failed', doc.id, card.equipment_id, e)
        }
      }
      if (hadFailure) failedNames.push(doc.name)
      setDeletingIds(prev => { const n = new Set(prev); n.delete(doc.id); return n })
    }
    setSelectedDocIds(new Set())
    setDeleteRunning(false)
    onBusyChange?.(false)
    if (failedNames.length > 0) setDeleteErrors(failedNames)
    await onChanged()
  }

  // ── CSV 匯出：純前端把目前顯示（依當下視圖/排序）的清單內容轉成 CSV 下載 ──
  // 檔名/品名等欄位值來自使用者上傳，若剛好以 =+-@ 開頭，Excel/Sheets 開啟時會被當成公式
  // 執行（CSV/公式注入風險）。前面補一個單引號讓該儲存格強制被當成文字，不影響顯示內容。
  function toCsv(rows: string[][]): string {
    const escape = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v
      return `"${safe.replace(/"/g, '""')}"`
    }
    return rows.map(r => r.map(escape).join(',')).join('\r\n')
  }
  function downloadCsv(filename: string, rows: string[][]) {
    // 前面加 UTF-8 BOM，否則中文在 Excel 開啟會變亂碼
    const csv = '﻿' + toCsv(rows)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
  function handleExport() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '')
    if (view === 'byDoc') {
      const rows = [
        ['檔名', '類型', '掛載張數', '更新日期', '掛載料卡'],
        ...filteredDocs.map(d => [
          d.name, d.type, String(d.linked_cards.length), formatDateTime(d.updated_at),
          d.linked_cards.map(c => `${c.equipment_id} ${c.name}`).join('; '),
        ]),
      ]
      downloadCsv(`文件目錄-依文件-${dateStr}.csv`, rows)
    } else {
      const rows = [
        ['料號', '品名', '掛載文件數', '文件清單'],
        ...filteredCardGroups.map(g => [
          g.equipment_id, g.name, String(g.docs.length),
          g.docs.map(d => `${d.name}（${d.type}）`).join('; '),
        ]),
      ]
      downloadCsv(`文件目錄-依料號-${dateStr}.csv`, rows)
    }
  }

  return (
    <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#6b4f38]">
            文件清單（共 {documents.length} 份，掛載 {cardGroups.length} 張料卡）
          </h3>
          <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs">
            <button type="button" onClick={() => setView('byDoc')}
              className={`px-2.5 py-1 transition-colors ${view === 'byDoc' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              依文件
            </button>
            <button type="button" onClick={() => setView('byCard')}
              className={`px-2.5 py-1 transition-colors ${view === 'byCard' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              依料號
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
            <input value={listQuery} onChange={e => setListQuery(e.target.value)}
              placeholder={view === 'byDoc' ? '搜尋文件名稱…' : '搜尋料號、品名…'}
              className="pl-7 pr-2 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]" />
          </div>
          <button onClick={handleExport} disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-40 transition-colors">
            <Download className="h-3.5 w-3.5" />
            匯出 CSV
          </button>
          {view === 'byDoc' && (
            <button onClick={askBatchDelete} disabled={selectedDocIds.size === 0 || deleteRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#b5451b] border border-[rgba(181,69,27,.3)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-40 transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
              批次刪除（{selectedDocIds.size}）
            </button>
          )}
        </div>
      </div>

      {error && <p className="text-xs text-[#b5451b] mb-2">{error}</p>}
      {actionError && <p className="text-xs text-[#b5451b] mb-2">{actionError}</p>}

      {deleteErrors.length > 0 && (
        <div className="flex items-start gap-2 text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2 mb-2">
          <AlertTriangle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>以下文件刪除時部分料卡關聯解除失敗，可能仍留有殘留關聯，請確認後重新嘗試：{deleteErrors.join('、')}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-xs text-[#a08060] py-6 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> 載入中…
        </div>
      ) : view === 'byDoc' ? (
        filteredDocs.length === 0 ? (
          <p className="text-xs text-[#a08060] py-6 text-center">沒有符合的文件</p>
        ) : (
          <div className="border border-[#e8ddd0] rounded-lg overflow-x-auto">
            <div className="min-w-[640px]">
            <div className="grid grid-cols-[24px_28px_1fr_100px_80px_140px] gap-2 px-3 py-2 bg-[#faf6f0] border-b border-[#e8ddd0] text-[10px] font-semibold text-[#a08060]">
              <span />
              <span />
              <SortHeader label="檔名" sortKey="name" active={docSort.key === 'name'} dir={docSort.dir} onSort={handleDocSort} />
              <SortHeader label="類型" sortKey="type" active={docSort.key === 'type'} dir={docSort.dir} onSort={handleDocSort} />
              <SortHeader label="掛載張數" sortKey="count" active={docSort.key === 'count'} dir={docSort.dir} onSort={handleDocSort} className="justify-end" />
              <SortHeader label="更新日期" sortKey="updated_at" active={docSort.key === 'updated_at'} dir={docSort.dir} onSort={handleDocSort} />
            </div>
            {filteredDocs.map(doc => {
              const isDeleting = deletingIds.has(doc.id)
              const isBusy = busyIds.has(doc.id)
              const isExpanded = expanded.has(doc.id)
              return (
                <div key={doc.id} className={`border-t border-[#f0e8dc] ${isDeleting ? 'opacity-50' : ''}`}>
                  <div className="grid grid-cols-[24px_28px_1fr_100px_80px_140px] gap-2 px-3 py-2 items-center text-xs">
                    <input type="checkbox" checked={selectedDocIds.has(doc.id)} onChange={() => toggleSelectDoc(doc.id)}
                      disabled={isDeleting} className="accent-[#7a5230]" />
                    <button type="button" onClick={() => toggleExpand(doc.id)} className="text-[#a08060] hover:text-[#7a5230] transition-colors">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
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
                  {isExpanded && (
                    <div className="px-3 pb-3 pl-12 bg-[rgba(122,82,48,.03)]">
                      {doc.linked_cards.length === 0 ? (
                        <p className="text-xs text-[#a08060] py-1.5">尚未掛載任何料卡</p>
                      ) : (
                        <div className="flex flex-col gap-1 py-1.5">
                          {doc.linked_cards.map(c => (
                            <div key={c.equipment_id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                              <span className="text-[#4a3422] truncate">{c.equipment_id} {c.name}</span>
                              <button type="button" onClick={() => requestUnlink(doc, c.equipment_id)} disabled={isBusy}
                                className="flex items-center gap-1 text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors flex-shrink-0">
                                {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                取消掛載
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      <EquipmentQuickPick
                        allCards={allCards}
                        excludeIds={doc.linked_cards.map(c => c.equipment_id)}
                        disabled={isBusy}
                        onPick={id => handleLinkExisting(doc.id, id)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        )
      ) : (
        filteredCardGroups.length === 0 ? (
          <p className="text-xs text-[#a08060] py-6 text-center">沒有符合的料卡</p>
        ) : (
          <div className="border border-[#e8ddd0] rounded-lg overflow-x-auto">
            <div className="min-w-[480px]">
            <div className="grid grid-cols-[28px_120px_1fr_100px] gap-2 px-3 py-2 bg-[#faf6f0] border-b border-[#e8ddd0] text-[10px] font-semibold text-[#a08060]">
              <span />
              <SortHeader label="料號" sortKey="equipment_id" active={cardSort.key === 'equipment_id'} dir={cardSort.dir} onSort={handleCardSort} />
              <SortHeader label="品名" sortKey="name" active={cardSort.key === 'name'} dir={cardSort.dir} onSort={handleCardSort} />
              <SortHeader label="掛載文件數" sortKey="count" active={cardSort.key === 'count'} dir={cardSort.dir} onSort={handleCardSort} className="justify-end" />
            </div>
            {filteredCardGroups.map(g => {
              const isExpanded = expanded.has(g.equipment_id)
              return (
                <div key={g.equipment_id} className="border-t border-[#f0e8dc]">
                  <div className="grid grid-cols-[28px_120px_1fr_100px] gap-2 px-3 py-2 items-center text-xs">
                    <button type="button" onClick={() => toggleExpand(g.equipment_id)} className="text-[#a08060] hover:text-[#7a5230] transition-colors">
                      {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <span className="text-[#4a3422] truncate">{g.equipment_id}</span>
                    <span className="text-[#6b4f38] truncate">{g.name}</span>
                    <span className="text-right text-[#6b4f38]">{g.docs.length}</span>
                  </div>
                  {isExpanded && (
                    <div className="px-3 pb-3 pl-9 bg-[rgba(122,82,48,.03)]">
                      {g.docs.length === 0 ? (
                        <p className="text-xs text-[#a08060] py-1.5">尚未掛載任何文件</p>
                      ) : (
                        <div className="flex flex-col gap-1 py-1.5">
                          {g.docs.map(doc => {
                            const isBusy = busyIds.has(doc.id)
                            return (
                              <div key={doc.id} className="flex items-center justify-between gap-2 text-xs py-0.5">
                                <a href={doc.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-[#4a3422] hover:text-[#7a5230] truncate">
                                  <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                                  <span className="truncate">{doc.name}</span>
                                  <span className="text-[#a08060] flex-shrink-0">（{doc.type}）</span>
                                </a>
                                <button type="button" onClick={() => requestUnlink(doc, g.equipment_id)} disabled={isBusy}
                                  className="flex items-center gap-1 text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors flex-shrink-0">
                                  {isBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                                  取消掛載
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                      <AddDocumentToCard
                        documentTypes={documentTypes}
                        onPickExisting={r => handleLinkExisting(r.id, g.equipment_id)}
                        onUploadNew={(file, type) => handleUploadNewToCard(g.equipment_id, file, type)}
                      />
                    </div>
                  )}
                </div>
              )
            })}
            </div>
          </div>
        )
      )}

      {/* 批次刪除確認：列出每份文件目前掛載的料卡（一行一個料卡，可捲動） */}
      <ConfirmDialog
        open={!!deleteConfirm}
        title={`確定刪除 ${deleteConfirm?.docs.length ?? 0} 份文件？`}
        message="刪除後會解除所有掛載關聯，Google Drive 檔案會移到「_待清除文件」資料夾。"
        detail={deleteConfirm?.docs.map(d =>
          `${d.name}\n${d.linked_cards.length > 0 ? d.linked_cards.map(c => `  ${c.equipment_id} ${c.name}`).join('\n') : '  未掛載任何料卡'}`,
        ).join('\n\n')}
        confirmLabel="確定刪除"
        danger
        onConfirm={handleConfirmBatchDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {/* 取消掛載安全確認：這是文件目前唯一僅存的關聯，解除後文件本體會被整個刪除 */}
      <ConfirmDialog
        open={!!unlinkConfirm}
        title="這是這份文件唯一僅存的關聯"
        message={
          unlinkConfirm
            ? `解除「${unlinkConfirm.documentName}」與這張料卡的關聯後，文件本體會被整個刪除，Google Drive 檔案會移到「_待清除文件」資料夾，確定嗎？`
            : undefined
        }
        confirmLabel="確定移除"
        cancelLabel="取消"
        danger
        onConfirm={() => {
          if (!unlinkConfirm) return
          const { documentId, equipmentId } = unlinkConfirm
          setUnlinkConfirm(null)
          doUnlink(documentId, equipmentId)
        }}
        onCancel={() => setUnlinkConfirm(null)}
      />
    </div>
  )
}
