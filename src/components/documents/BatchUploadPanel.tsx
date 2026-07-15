'use client'

import { useState, useRef } from 'react'
import { Upload, X, Loader2, FileText, AlertTriangle } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import ConfirmDialog from '@/components/ConfirmDialog'
import SettingsPopover from '@/components/SettingsPopover'
import { useDocumentUpload, DocumentAllRecord } from '@/hooks/useDocumentUpload'
import EquipmentPicker from './EquipmentPicker'

interface Props {
  allCards: EquipmentCard[]
  documentTypes: string[]
  onDocumentTypesChange: (types: string[]) => void
  documents: DocumentAllRecord[]
  onBusyChange?: (busy: boolean) => void
  onUploaded: () => void | Promise<void>
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

// 批次上傳面板：抽出自 DocumentsClient.tsx（原本佔了主檔案接近一半篇幅），
// 獨立管理待上傳列、同名文件偵測二選一、實際送出的流程
export default function BatchUploadPanel({ allCards, documentTypes, onDocumentTypesChange, documents, onBusyChange, onUploaded }: Props) {
  const docApi = useDocumentUpload()
  const cardNameById = new Map(allCards.map(c => [c.equipment_id, c.name]))

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
    await onUploaded()
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
    <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="flex items-center gap-1 text-sm font-semibold text-[#6b4f38]">
          批次上傳
          <SettingsPopover
            settingKey="documentTypes"
            items={documentTypes}
            onConfirm={onDocumentTypesChange}
            disabled={batchSubmitting}
          />
        </h3>
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

      {/* 同名文件二選一 */}
      <ConfirmDialog
        open={!!duplicatePrompt}
        title="發現同名文件"
        message={duplicatePrompt ? `已有相同名稱的文件「${duplicatePrompt.match.name}」，請選擇處理方式：選擇「取代（更新版本）」會連同其他掛載此文件的料號一起更新內容，不是只更新目前這張卡片。` : undefined}
        confirmLabel="取代（更新版本）"
        cancelLabel="先刪除舊的再上傳"
        onConfirm={handleDupReplace}
        onCancel={handleDupDeleteReupload}
      />

      {/* 先刪除舊的再上傳：舊文件還掛載在其他料卡的二次確認 */}
      <ConfirmDialog
        open={!!deleteReuploadConfirm}
        title="這份文件掛載在多張料卡"
        message="這份文件目前掛載在以下料卡，確定要一併移除嗎？"
        detail={deleteReuploadConfirm?.match.linked_cards.map(c => `${c.equipment_id} ${c.name}`).join('\n')}
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
    </div>
  )
}
