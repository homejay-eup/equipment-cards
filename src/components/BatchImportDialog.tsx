'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2, FileText } from 'lucide-react'
import { AppSettings } from '@/types/equipment'

interface Props {
  open: boolean
  onClose: () => void
  settings: AppSettings
}

interface ParsedRow {
  equipment_id: string
  name: string
  category: string
  vendor: string
  status: string
  tags: string[]
  notes: string
  net_weight?: number
  error?: string
}

// 簡易 CSV 解析（支援雙引號跳脫）
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let current = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
        else { inQuotes = !inQuotes }
      } else if (ch === ',' && !inQuotes) {
        cells.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
    cells.push(current.trim())
    rows.push(cells)
  }
  return rows
}

function csvToRows(text: string, settings: AppSettings): ParsedRow[] {
  // 去除 Excel UTF-8 BOM（﻿），否則第一欄 header 比對會失敗
  const raw = parseCSV(text.replace(/^﻿/, ''))
  if (raw.length < 2) return []

  // 第一列為 header
  const headers = raw[0].map(h => h.trim().toLowerCase())

  // header 名稱對應（支援中英文）
  function col(row: string[], ...names: string[]): string {
    for (const name of names) {
      const idx = headers.indexOf(name)
      if (idx !== -1) return row[idx]?.trim() ?? ''
    }
    return ''
  }

  const validStatuses = settings.statuses

  return raw.slice(1).map(cols => {
    const equipment_id = col(cols, 'equipment_id', '料號')
    const name = col(cols, 'name', '品名')
    const category = col(cols, 'category', '分類')
    const vendor = col(cols, 'vendor', '廠商')
    const status = col(cols, 'status', '狀態')
    const tagsRaw = col(cols, 'tags', '標籤')
    const notes = col(cols, 'notes', '備註')
    const netWeightRaw = col(cols, 'net_weight', '淨重', '淨重(kg)', '淨重（kg）')

    const tags = tagsRaw ? tagsRaw.split('|').map(t => t.trim()).filter(Boolean) : []
    const net_weight = netWeightRaw ? parseFloat(netWeightRaw) : undefined

    let error: string | undefined
    if (!equipment_id) error = '料號為必填'
    else if (!name) error = '品名為必填'
    else if (status && !validStatuses.includes(status)) error = `狀態「${status}」無效，請填 ${validStatuses.join(' 或 ')}`
    else if (netWeightRaw && (isNaN(net_weight!) || net_weight! < 0)) error = `淨重「${netWeightRaw}」格式錯誤，請填數字`

    return {
      equipment_id,
      name,
      category,
      vendor,
      status: status || validStatuses[0],
      tags,
      notes,
      net_weight,
      error,
    }
  })
}

type Step = 'upload' | 'preview' | 'done'

interface ImportResult {
  inserted: number
  updated: number
  skipped: string[]
  errors: string[]
}

export default function BatchImportDialog({ open, onClose, settings }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [step, setStep] = useState<Step>('upload')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [fileName, setFileName] = useState('')

  const validRows = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r => r.error)

  function handleClose() {
    setStep('upload')
    setRows([])
    setResult(null)
    setFileName('')
    onClose()
  }

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { alert('請上傳 .csv 檔案'); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const parsed = csvToRows(text, settings)
      if (parsed.length === 0) { alert('CSV 無有效資料，請確認格式'); return }
      setRows(parsed)
      setStep('preview')
    }
    reader.readAsText(file, 'UTF-8')
  }, [settings])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) processFile(file)
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

  async function handleImport() {
    if (validRows.length === 0) return
    setImporting(true)
    try {
      const res = await fetch('/api/cards/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows }),
      })
      const data = await res.json()
      setResult(data)
      setStep('done')
      if (data.inserted > 0 || data.updated > 0) router.refresh()
    } catch {
      alert('匯入失敗，請重試')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">批次匯入料卡</h2>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600 transition-colors focus:outline-none">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step: upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="text-sm text-gray-600 space-y-1">
                <p>上傳 CSV 檔案，一次新增多筆料卡。</p>
                <p className="text-gray-400">tags 欄位用 <code className="bg-gray-100 px-1 rounded">|</code> 分隔，例如：<code className="bg-gray-100 px-1 rounded">HS昇銳|GPS</code></p>
              </div>

              {/* Download template */}
              <a
                href="/batch-import-template.csv"
                download
                className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                <Download className="h-4 w-4" />
                下載 CSV 範本
              </a>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400 hover:bg-gray-50'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">點擊或拖曳 CSV 檔案至此</p>
                <p className="text-gray-400 text-sm mt-1">僅支援 .csv 格式，UTF-8 編碼</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">{fileName}</span>
                <span className="text-gray-400">·</span>
                <span className="text-green-600 font-medium">{validRows.length} 筆可匯入</span>
                {invalidRows.length > 0 && (
                  <>
                    <span className="text-gray-400">·</span>
                    <span className="text-red-500 font-medium">{invalidRows.length} 筆有錯誤（將跳過）</span>
                  </>
                )}
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium w-8">#</th>
                      <th className="px-3 py-2 text-left font-medium">料號</th>
                      <th className="px-3 py-2 text-left font-medium">品名</th>
                      <th className="px-3 py-2 text-left font-medium">分類</th>
                      <th className="px-3 py-2 text-left font-medium">廠商</th>
                      <th className="px-3 py-2 text-left font-medium">狀態</th>
                      <th className="px-3 py-2 text-left font-medium">標籤</th>
                      <th className="px-3 py-2 text-left font-medium w-32">備註</th>
                      <th className="px-3 py-2 text-left font-medium">淨重（kg）</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {rows.map((row, i) => (
                      <tr key={i} className={row.error ? 'bg-red-50' : 'bg-white'}>
                        <td className="px-3 py-2 text-gray-400">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-gray-800">{row.equipment_id || <span className="text-red-400">（空）</span>}</td>
                        <td className="px-3 py-2 text-gray-800">{row.name || <span className="text-red-400">（空）</span>}</td>
                        <td className="px-3 py-2 text-gray-600">{row.category}</td>
                        <td className="px-3 py-2 text-gray-600">{row.vendor}</td>
                        <td className="px-3 py-2 text-gray-600">{row.status}</td>
                        <td className="px-3 py-2 text-gray-500 text-xs">{row.tags.join('、')}</td>
                        <td className="px-3 py-2 text-gray-500 truncate max-w-[8rem]" title={row.notes}>{row.notes}</td>
                        <td className="px-3 py-2 text-gray-500">{row.net_weight ?? '—'}</td>
                        {row.error && (
                          <td className="px-3 py-2">
                            <span className="flex items-center gap-1 text-red-500 text-xs whitespace-nowrap">
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              {row.error}
                            </span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Step: done */}
          {step === 'done' && result && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-xl">
                <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-green-800">匯入完成</p>
                  <p className="text-sm text-green-700 mt-0.5">成功新增 {result.inserted} 筆料卡</p>
                  {result.updated > 0 && (
                    <p className="text-sm text-green-700 mt-0.5">更新 {result.updated} 筆料卡</p>
                  )}
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="p-4 bg-yellow-50 rounded-xl text-sm">
                  <p className="font-medium text-yellow-800 mb-1">跳過（料號已存在）{result.skipped.length} 筆</p>
                  <p className="text-yellow-700 font-mono text-xs">{result.skipped.join('、')}</p>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="p-4 bg-red-50 rounded-xl text-sm">
                  <p className="font-medium text-red-800 mb-1">寫入失敗 {result.errors.length} 筆</p>
                  <ul className="text-red-700 text-xs space-y-0.5">
                    {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50 rounded-b-2xl">
          {step === 'upload' && (
            <button onClick={handleClose} className="text-sm text-gray-500 hover:text-gray-700">取消</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="text-sm text-gray-500 hover:text-gray-700">
                重新上傳
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors focus:outline-none"
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                確認匯入 {validRows.length} 筆
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={handleClose}
              className="ml-auto px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors focus:outline-none"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
