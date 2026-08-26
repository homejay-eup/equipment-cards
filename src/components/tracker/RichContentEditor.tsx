'use client'

import { useCallback, type Dispatch, type SetStateAction } from 'react'
import { X, Loader2 } from 'lucide-react'
import type { PendingImage, TableData } from './richContentTypes'
import { parseHtmlTable } from './richContentUtils'
import RichTable from './RichTable'

interface Props {
  content: string
  onContentChange: (value: string) => void
  images: PendingImage[]
  onImagesChange: Dispatch<SetStateAction<PendingImage[]>>
  table: TableData | null
  onTableChange: Dispatch<SetStateAction<TableData | null>>
  uploadImage: (file: File) => Promise<{ public_id: string; url: string } | null>
  placeholder?: string
  rows?: number
  disabled?: boolean
  onSubmitShortcut?: () => void
}

// 可編輯版本：textarea + 貼上偵測（圖片→上傳／Excel 表格→解析）+ 待上傳圖片縮圖/移除 +
// 表格預覽/移除。EditIssueDialog／NewIssueDialog 的「說明」欄位、IssueDetailDialog 的
// 新增與編輯更新紀錄都共用這個元件。
//
// onImagesChange／onTableChange 沿用 useState setter 的型別（支援 updater function），
// 呼叫端可以直接把 useState 回傳的 setter 傳進來。這裡貼上多張圖片時用 prev => ... 疊加，
// 避免非同步上傳過程中互相覆蓋彼此的結果（上傳期間使用者可能連續貼上多張）。
export default function RichContentEditor({
  content, onContentChange, images, onImagesChange, table, onTableChange,
  uploadImage, placeholder, rows = 5, disabled = false, onSubmitShortcut,
}: Props) {
  const handlePaste = useCallback(async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items
    const imageFiles: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) imageFiles.push(file)
      }
    }
    const html = e.clipboardData.getData('text/html')
    const parsedTable = html ? parseHtmlTable(html) : null

    if (imageFiles.length === 0 && !parsedTable) return // 純文字：交給預設行為

    e.preventDefault()

    if (parsedTable) onTableChange(parsedTable)

    for (const file of imageFiles) {
      const tempId = `pending-img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      onImagesChange((prev) => [...prev, { tempId, uploading: true }])
      const result = await uploadImage(file)
      onImagesChange((prev) => prev.map((p) => {
        if (p.tempId !== tempId) return p
        return result
          ? { ...p, uploading: false, public_id: result.public_id, url: result.url }
          : { ...p, uploading: false, error: '上傳失敗' }
      }))
    }
  }, [onImagesChange, onTableChange, uploadImage])

  const removeImage = useCallback((tempId: string) => {
    onImagesChange((prev) => prev.filter((p) => p.tempId !== tempId))
  }, [onImagesChange])

  return (
    <div className="space-y-2">
      <textarea
        value={content}
        onChange={(e) => onContentChange(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault()
            onSubmitShortcut?.()
          }
        }}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all resize-none"
      />

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img) => (
            <div
              key={img.tempId}
              className="relative w-16 h-16 rounded-lg overflow-hidden border border-[#e8ddd0] bg-white"
            >
              {img.uploading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-[#a08060]" />
                </div>
              ) : img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={img.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-center text-[9px] text-[#b5451b] px-1 leading-tight">
                  {img.error ?? '失敗'}
                </div>
              )}
              <button
                type="button"
                onClick={() => removeImage(img.tempId)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
                title="移除"
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {table && (
        <div className="relative border border-[#e8ddd0] rounded-lg overflow-x-auto bg-white">
          <button
            type="button"
            onClick={() => onTableChange(null)}
            className="absolute top-1 right-1 z-10 p-0.5 rounded-full bg-black/50 text-white hover:bg-black/70 transition-colors"
            title="移除表格"
          >
            <X className="h-2.5 w-2.5" />
          </button>
          <RichTable data={table} />
        </div>
      )}
    </div>
  )
}
