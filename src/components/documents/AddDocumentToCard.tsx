'use client'

import { useState } from 'react'
import { FileText, Loader2, Plus, Upload } from 'lucide-react'
import { useDocumentUpload, DocumentSearchResult } from '@/hooks/useDocumentUpload'

// 新增文件到某張料卡：挑選既有文件（依名稱搜尋既有文件後掛載）／上傳新文件（只掛這一張卡）二選一。
// 抽成獨立元件，因為每一列展開時都各自需要一份獨立的 local state（查詢字串、搜尋結果、上傳中狀態）
export default function AddDocumentToCard({
  documentTypes, disabled, onPickExisting, onUploadNew,
}: {
  documentTypes: string[]
  disabled?: boolean
  onPickExisting: (doc: DocumentSearchResult) => void | Promise<void>
  onUploadNew: (file: File, type: string) => void | Promise<void>
}) {
  const docApi = useDocumentUpload()
  const [mode, setMode] = useState<'closed' | 'search' | 'upload'>('closed')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DocumentSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [uploadType, setUploadType] = useState(documentTypes[0] ?? '規格書')
  const [busy, setBusy] = useState(false)

  async function handleSearch() {
    if (!query.trim()) { setResults([]); return }
    setSearching(true)
    try {
      const found = await docApi.search(query.trim())
      setResults(found)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      await onUploadNew(file, uploadType)
      setMode('closed')
    } finally {
      setBusy(false)
    }
  }

  async function handlePick(doc: DocumentSearchResult) {
    setBusy(true)
    try {
      await onPickExisting(doc)
      setMode('closed')
      setQuery('')
      setResults([])
    } finally {
      setBusy(false)
    }
  }

  if (mode === 'closed') {
    return (
      <div className="flex items-center gap-3 pt-1">
        <button type="button" onClick={() => setMode('search')} disabled={disabled}
          className="flex items-center gap-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
          <Plus className="h-3 w-3" /> 挑選既有文件
        </button>
        <button type="button" onClick={() => setMode('upload')} disabled={disabled}
          className="flex items-center gap-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
          <Plus className="h-3 w-3" /> 上傳新文件
        </button>
      </div>
    )
  }

  if (mode === 'upload') {
    return (
      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <select value={uploadType} onChange={e => setUploadType(e.target.value)} disabled={busy}
          className="border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50">
          {documentTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className={`flex items-center gap-1.5 px-2.5 py-1 text-xs border border-dashed border-[rgba(122,82,48,.35)] rounded-lg text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors ${busy ? 'opacity-50 pointer-events-none' : 'cursor-pointer'}`}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          選擇檔案
          <input type="file" className="hidden" onChange={handleFileChosen} disabled={busy} />
        </label>
        <button type="button" onClick={() => setMode('closed')} disabled={busy}
          className="text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">取消</button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5 pt-1">
      <div className="flex items-center gap-2">
        <input
          type="text" value={query} onChange={e => setQuery(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearch() } }}
          placeholder="輸入文件名稱關鍵字…" autoFocus disabled={busy}
          className="flex-1 border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
        />
        <button type="button" onClick={handleSearch} disabled={busy || searching}
          className="px-2.5 py-1 text-xs font-medium text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-40 transition-colors">
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '搜尋'}
        </button>
        <button type="button" onClick={() => setMode('closed')} disabled={busy}
          className="text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">取消</button>
      </div>
      {results.length > 0 && (
        <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
          {results.map(r => (
            <button key={r.id} type="button" onClick={() => handlePick(r)} disabled={busy}
              className="flex items-center justify-between gap-2 text-left px-2.5 py-1.5 text-xs bg-[#fff9f4] border border-[rgba(122,82,48,.15)] rounded-lg hover:border-[#c49a72] disabled:opacity-40 transition-colors">
              <span className="flex items-center gap-1.5 truncate">
                <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                <span className="truncate">{r.name}</span>
                <span className="text-[#a08060] flex-shrink-0">（{r.type}）</span>
              </span>
              <span className="text-[#a08060] flex-shrink-0">用於 {r.equipment_ids.length} 個品號</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
