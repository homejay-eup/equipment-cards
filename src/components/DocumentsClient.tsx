'use client'

import { useState, useEffect, useCallback } from 'react'
import { EquipmentCard } from '@/types/equipment'
import { useDocumentUpload, DocumentAllRecord } from '@/hooks/useDocumentUpload'
import BatchUploadPanel from '@/components/documents/BatchUploadPanel'
import ExpandableDocumentList from '@/components/documents/ExpandableDocumentList'

interface Props {
  allCards: EquipmentCard[]
  documentTypes: string[]
  onBusyChange?: (busy: boolean) => void
  // 頂端工具列 sticky 定位距離（px），由 PhotoWall 量測外層凍結標題列高度後往下傳，預設 0 不影響既有呼叫端
  stickyTop?: number
}

export default function DocumentsClient({ allCards, documentTypes: initialDocumentTypes, onBusyChange, stickyTop = 0 }: Props) {
  const docApi = useDocumentUpload()

  // 文件類型清單：本頁的 SettingsPopover（掛在 BatchUploadPanel 裡）改的是 DB，
  // 這裡用 component-level state 立即反映，不用等父層 PhotoWall 重新整理
  const [documentTypes, setDocumentTypes] = useState<string[]>(initialDocumentTypes)
  useEffect(() => { setDocumentTypes(initialDocumentTypes) }, [initialDocumentTypes])

  function formatDateTime(iso: string) {
    try { return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }) } catch { return iso }
  }

  // ── 文件清單（依文件/依料號雙視圖、批次上傳、批次刪除共用同一份快照） ──
  const [documents, setDocuments] = useState<DocumentAllRecord[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [docsError, setDocsError] = useState<string | null>(null)

  const refreshDocuments = useCallback(async () => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => { refreshDocuments() }, [refreshDocuments])

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16 space-y-6">
      <BatchUploadPanel
        allCards={allCards}
        documentTypes={documentTypes}
        onDocumentTypesChange={setDocumentTypes}
        documents={documents}
        onBusyChange={onBusyChange}
        onUploaded={refreshDocuments}
      />

      <ExpandableDocumentList
        documents={documents}
        allCards={allCards}
        documentTypes={documentTypes}
        loading={docsLoading}
        error={docsError}
        formatDateTime={formatDateTime}
        onChanged={refreshDocuments}
        onBusyChange={onBusyChange}
        stickyTop={stickyTop}
      />
    </div>
  )
}
