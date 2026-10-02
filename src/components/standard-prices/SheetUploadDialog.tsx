'use client'

import { useRef, useState } from 'react'
import { FileUp, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { StandardPriceSheetMeta } from '@/types/standardPrice'
import { readApiError } from './standardPriceUtils'

interface Props {
  open: boolean
  onClose: () => void
  onUploaded: (sheet: StandardPriceSheetMeta) => void
}

const MAX_BYTES = 2 * 1024 * 1024

// 從 HTML 的 <title> 取預設標題（取不到就用檔名）
function guessTitle(html: string, fileName: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return (m?.[1] ?? '').trim() || fileName.replace(/\.html?$/i, '')
}

// 上傳新版價目表：選 HTML 檔 → 自動帶入標題 → 選生效月份 → 上傳
export default function SheetUploadDialog({ open, onClose, onUploaded }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [html, setHtml] = useState('')
  const [title, setTitle] = useState('')
  const [month, setMonth] = useState('') // YYYY-MM
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function reset() {
    setFileName(''); setHtml(''); setTitle(''); setMonth(''); setError(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (saving) return
    reset()
    onClose()
  }

  async function handleFile(file: File | undefined) {
    setError(null)
    if (!file) return
    if (!/\.html?$/i.test(file.name)) { setError('請選擇 .html 檔案'); return }
    if (file.size > MAX_BYTES) { setError('檔案太大（上限 2MB）'); return }
    const text = await file.text()
    setFileName(file.name)
    setHtml(text)
    setTitle(guessTitle(text, file.name))
  }

  async function handleSubmit() {
    if (!html) { setError('請先選擇 HTML 檔案'); return }
    if (!title.trim()) { setError('請輸入標題'); return }
    if (!/^\d{4}-\d{2}$/.test(month)) { setError('請選擇生效月份'); return }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/standard-prices/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), effective_date: `${month}-01`, file_name: fileName, html }),
      })
      if (!res.ok) { setError(await readApiError(res, '上傳失敗')); return }
      const json = await res.json()
      reset()
      onUploaded(json.sheet)
    } catch {
      setError('上傳失敗')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose() }}>
      <DialogContent className="max-w-md bg-[#fff9f4]">
        <DialogHeader>
          <DialogTitle className="text-[#2c1e12]">上傳新版價目表</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-[#a08060] mb-1">HTML 檔案</label>
            <input
              ref={fileRef}
              type="file"
              accept=".html,.htm,text/html"
              disabled={saving}
              onChange={e => handleFile(e.target.files?.[0])}
              className="block w-full text-sm text-[#6b4f38] file:mr-3 file:rounded-md file:border-0 file:bg-[rgba(122,82,48,.08)] file:px-3 file:py-1.5 file:text-sm file:text-[#7a5230] hover:file:bg-[rgba(122,82,48,.14)]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">標題</label>
            <input value={title} onChange={e => setTitle(e.target.value)} disabled={saving} className={inputCls} placeholder="選檔後自動帶入" />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">生效月份</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={saving} className={inputCls} />
          </div>
          <p className="text-xs text-[#a08060]">上傳後會成為新的現行版本，舊版本會保留在「歷史版本」。</p>
          {error && <p className="text-xs text-[#b5451b]">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={handleClose}
              disabled={saving}
              className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
            >
              取消
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              上傳
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
