'use client'

import { useEffect, useState } from 'react'
import { Eye, Loader2, RotateCcw, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { StandardPriceSheetMeta, StandardPriceSheetRevision } from '@/types/standardPrice'
import { emailName, formatDateTime, readApiError } from './standardPriceUtils'

interface Props {
  sheet: StandardPriceSheetMeta
  canRestore: boolean // 只有現行版本可還原
  onClose: () => void
  onRestored: (sheet: StandardPriceSheetMeta) => void
}

const forceLight = (html: string) => html.replace(/<html(?=[\s>])/i, '<html data-theme="light"')

// Step 48b：價目表修改紀錄。清單新到舊，第一筆＝目前內容；可預覽任一筆，現行版本可還原到較早的內容
// （還原也是一次「儲存修改」，會再新增一筆紀錄，所以還原本身也能再還原回來）。
export default function SheetRevisionsDialog({ sheet, canRestore, onClose, onRestored }: Props) {
  const [revisions, setRevisions] = useState<StandardPriceSheetRevision[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [previewHtml, setPreviewHtml] = useState<Record<string, string>>({})
  const [restoreTarget, setRestoreTarget] = useState<StandardPriceSheetRevision | null>(null)
  const [restoring, setRestoring] = useState(false)

  useEffect(() => {
    fetch(`/api/standard-prices/sheets/${sheet.id}/revisions`)
      .then(async res => {
        if (!res.ok) { setError(await readApiError(res, '讀取修改紀錄失敗')); return }
        setRevisions((await res.json()).revisions ?? [])
      })
      .catch(() => setError('讀取修改紀錄失敗'))
  }, [sheet.id])

  async function loadHtml(revId: string): Promise<string | null> {
    if (previewHtml[revId]) return previewHtml[revId]
    const res = await fetch(`/api/standard-prices/sheets/${sheet.id}/revisions/${revId}`)
    if (!res.ok) { setError(await readApiError(res, '讀取內容失敗')); return null }
    const html: string = (await res.json()).revision.html
    setPreviewHtml(m => ({ ...m, [revId]: html }))
    return html
  }

  async function preview(revId: string) {
    if (previewId === revId) { setPreviewId(null); return }
    setError(null)
    if (await loadHtml(revId)) setPreviewId(revId)
  }

  async function restore() {
    if (!restoreTarget) return
    setRestoring(true)
    setError(null)
    try {
      const html = await loadHtml(restoreTarget.id)
      if (!html) return
      const res = await fetch(`/api/standard-prices/sheets/${sheet.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html,
          note: `還原至 ${formatDateTime(restoreTarget.saved_at)} 的內容`,
          base: sheet.updated_at ?? sheet.created_at,
        }),
      })
      if (!res.ok) { setError(await readApiError(res, '還原失敗')); return }
      setRestoreTarget(null)
      onRestored((await res.json()).sheet)
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 px-4" onClick={onClose}>
      <div
        className={`bg-[#fff9f4] rounded-2xl border border-[rgba(122,82,48,.18)] shadow-xl w-full ${previewId ? 'max-w-6xl' : 'max-w-lg'} max-h-[90vh] flex flex-col overflow-hidden`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-5 py-3 border-b border-[#e8ddd0]">
          <h3 className="text-base font-semibold text-[#2c1e12] flex-1">修改紀錄</h3>
          <button type="button" onClick={onClose} aria-label="關閉" className="text-[#a08060] hover:text-[#7a5230]"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 min-h-0 flex">
          <div className={`${previewId ? 'w-80 border-r border-[#e8ddd0]' : 'w-full'} overflow-y-auto p-3`}>
            {error && <p className="text-xs text-[#b5451b] mb-2">{error}</p>}
            {!revisions && !error && <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-[#a08060]" /></div>}
            {revisions?.length === 0 && <p className="text-sm text-[#a08060] py-6 text-center">這個版本上傳後還沒有修改過。</p>}
            <ul className="space-y-1.5">
              {revisions?.map((r, i) => (
                <li key={r.id} className={`rounded-lg border px-3 py-2 ${previewId === r.id ? 'border-[#c49a72] bg-white' : 'border-[#e8ddd0] bg-white/60'}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-[#2c1e12] font-medium">{formatDateTime(r.saved_at)}</span>
                    <span className="text-xs text-[#6b4f38]">{emailName(r.saved_by)}</span>
                    {i === 0 && <span className="text-[11px] text-white bg-[#7a5230] rounded-full px-1.5">目前內容</span>}
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-[#a08060] flex-1 truncate">{r.note}</span>
                    <button type="button" onClick={() => preview(r.id)} className="flex items-center gap-1 text-xs text-[#7a5230] hover:underline">
                      <Eye className="h-3.5 w-3.5" />{previewId === r.id ? '收合' : '預覽'}
                    </button>
                    {canRestore && i > 0 && (
                      <button type="button" onClick={() => setRestoreTarget(r)} className="flex items-center gap-1 text-xs text-[#7a5230] hover:underline">
                        <RotateCcw className="h-3.5 w-3.5" />還原
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
          {previewId && previewHtml[previewId] && (
            <iframe
              title="修改紀錄預覽"
              srcDoc={forceLight(previewHtml[previewId])}
              sandbox="allow-scripts"
              className="flex-1 min-h-[70vh] bg-white"
            />
          )}
        </div>
      </div>
    </div>

      <ConfirmDialog
        open={!!restoreTarget}
        title={restoring ? '還原中…' : '還原成這個內容？'}
        message={restoreTarget ? `價目表內容會改回 ${formatDateTime(restoreTarget.saved_at)}（${emailName(restoreTarget.saved_by)}）存的樣子。目前的內容會留在修改紀錄，之後還能再還原回來。` : undefined}
        confirmLabel="還原"
        onConfirm={() => { if (!restoring) restore() }}
        onCancel={() => { if (!restoring) setRestoreTarget(null) }}
      />
    </>
  )
}
