'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Upload, Download, X, CheckCircle2, AlertCircle, Loader2, FileText, Trash2 } from 'lucide-react'
import { AppSettings } from '@/types/equipment'

interface Props {
  open: boolean
  onClose: () => void
  settings: AppSettings
}

interface ParsedRow {
  equipment_id: string
  name: string
  category: string | null | undefined
  vendor: string | null | undefined
  status: string
  tags: string[] | null | undefined
  notes: string | null | undefined
  net_weight: number | null | undefined
  is_new?: boolean
  error?: string
  categoryWarning?: string
}

// CSV 解析（支援雙引號跳脫、引號內換行的多行欄位）
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let cells: string[] = []
  let current = ''
  let inQuotes = false
  // 先統一換行符，再逐字元掃描（不預先 split，才能正確處理引號內換行）
  const src = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (ch === '"') {
      if (inQuotes && src[i + 1] === '"') { current += '"'; i++ }
      else { inQuotes = !inQuotes }
    } else if (ch === ',' && !inQuotes) {
      cells.push(current.trim())
      current = ''
    } else if (ch === '\n' && !inQuotes) {
      cells.push(current.trim())
      current = ''
      if (cells.some(c => c !== '')) rows.push(cells)
      cells = []
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  if (cells.some(c => c !== '')) rows.push(cells)
  return rows
}

interface ExistingCard {
  equipment_id: string
  name: string
  category: string | null
  vendor: string | null
  status: string
  notes: string | null
  tags: string[] | null
  net_weight: number | null
  is_new: boolean
}

type ClearableField = 'category' | 'vendor' | 'notes' | 'tags' | 'net_weight'

// CSV 欄位為 null（空白）且 DB 有現有值 → 真正的清空警告
function isClear(
  csvVal: string | string[] | number | null | undefined,
  field: ClearableField,
  equipmentId: string,
  existing: Map<string, ExistingCard>,
): boolean {
  if (csvVal !== null) return false
  const dbRow = existing.get(equipmentId)
  if (!dbRow) return false
  const dbVal = dbRow[field]
  if (Array.isArray(dbVal)) return dbVal.length > 0
  return dbVal !== null && dbVal !== undefined && dbVal !== ''
}

// CSV 有值且與 DB 值不同 → 黃底標示（不含清空，清空走 isClear 橘色）
function isValueChanged(
  csvVal: string | string[] | number | boolean | null | undefined,
  field: keyof Omit<ExistingCard, 'equipment_id'>,
  equipmentId: string,
  existing: Map<string, ExistingCard>,
): boolean {
  if (csvVal === undefined || csvVal === null) return false
  const db = existing.get(equipmentId)
  if (!db) return false
  const dbVal = db[field]
  if (Array.isArray(csvVal)) {
    const csvT = [...csvVal].sort().join('|')
    const dbT = [...((dbVal as string[] | null) ?? [])].sort().join('|')
    return csvT !== dbT
  }
  return String(csvVal) !== String(dbVal ?? '')
}

// 任一欄位與 DB 值不同（含新料號）→ 需顯示在預覽清單
function hasChanges(row: ParsedRow, existing: Map<string, ExistingCard>): boolean {
  const db = existing.get(row.equipment_id)
  if (!db) return true // 新料號

  if (row.name !== db.name) return true
  if (row.status !== db.status) return true

  const strFields: ClearableField[] = ['category', 'vendor', 'notes']
  for (const f of strFields) {
    const csv = row[f]
    if (csv === undefined) continue
    if ((csv ?? '') !== (db[f] ?? '')) return true
  }

  if (row.net_weight !== undefined) {
    if ((row.net_weight ?? null) !== (db.net_weight ?? null)) return true
  }

  if (row.tags !== undefined) {
    const csvT = [...(row.tags ?? [])].sort().join('|')
    const dbT = [...(db.tags ?? [])].sort().join('|')
    if (csvT !== dbT) return true
  }

  if (row.is_new !== undefined && row.is_new !== db.is_new) return true

  return false
}

function csvToRows(text: string, settings: AppSettings): ParsedRow[] {
  // 去除 Excel UTF-8 BOM（﻿），否則第一欄 header 比對會失敗
  const raw = parseCSV(text.replace(/^﻿/, ''))
  if (raw.length < 2) return []

  // 第一列為 header；去除（必填）/（選填）等修飾詞，支援中文範本與英文 header 並存
  const headers = raw[0].map(h => h.trim().toLowerCase().replace(/[（(][^）)]*[）)]/g, '').trim())

  // header 名稱對應（支援中英文）
  // 回傳三值：string = 有值，null = 欄位存在但空白（清空），undefined = 欄位不存在（保留）
  function col(row: string[], ...names: string[]): string | null | undefined {
    for (const name of names) {
      const idx = headers.indexOf(name)
      if (idx !== -1) {
        const val = (row[idx] ?? '').trim()
        return val === '' ? null : val
      }
    }
    return undefined
  }

  const validStatuses = settings.statuses

  return raw.slice(1).map(cols => {
    const equipment_id = col(cols, 'equipment_id', '料號') ?? ''
    const name = col(cols, 'name', '品名') ?? ''
    const category = col(cols, 'category', '分類')
    const vendor = col(cols, 'vendor', '廠商')
    const statusRaw = col(cols, 'status', '狀態')
    const tagsRaw = col(cols, 'tags', '標籤')
    const notes = col(cols, 'notes', '備註')
    const netWeightRaw = col(cols, 'net_weight', '淨重', '淨重(kg)', '淨重（kg）')
    const isNewRaw = col(cols, 'is_new', '新品')

    const status = (statusRaw && statusRaw !== null) ? statusRaw : validStatuses[0]
    const tags = tagsRaw === undefined ? undefined : tagsRaw === null ? null : tagsRaw.split('|').map(t => t.trim()).filter(Boolean)
    const net_weight: number | null | undefined = netWeightRaw === undefined
      ? undefined
      : netWeightRaw === null
        ? null
        : parseFloat(netWeightRaw)
    let is_new: boolean | undefined
    if (isNewRaw) {
      is_new = ['true', '1', '是', '新品'].includes(isNewRaw.toLowerCase())
    }

    let error: string | undefined
    if (!equipment_id) error = '料號為必填'
    else if (!name) error = '品名為必填'
    else if (statusRaw && statusRaw !== null && !validStatuses.includes(statusRaw)) error = `狀態「${statusRaw}」無效，請填 ${validStatuses.join(' 或 ')}`
    else if (typeof net_weight === 'number' && (isNaN(net_weight) || net_weight < 0)) error = `淨重「${netWeightRaw}」格式錯誤，請填數字`

    const categoryWarning =
      category && !settings.categories.includes(category)
        ? `分類「${category}」不在系統清單內`
        : undefined

    return {
      equipment_id,
      name,
      category,
      vendor,
      status,
      tags,
      notes,
      net_weight,
      is_new,
      error,
      categoryWarning,
    }
  })
}

type Step = 'upload' | 'preview' | 'done'

interface ImportResult {
  inserted: number
  updated: number
  unchanged: number
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
  const [existingData, setExistingData] = useState<Map<string, ExistingCard>>(new Map())
  const [loadingExisting, setLoadingExisting] = useState(false)

  const validRows = rows.filter(r => !r.error)
  const invalidRows = rows.filter(r => r.error)
  const clearCount = validRows.filter(r =>
    isClear(r.category, 'category', r.equipment_id, existingData) ||
    isClear(r.vendor, 'vendor', r.equipment_id, existingData) ||
    isClear(r.notes, 'notes', r.equipment_id, existingData) ||
    isClear(r.tags, 'tags', r.equipment_id, existingData) ||
    isClear(r.net_weight, 'net_weight', r.equipment_id, existingData)
  ).length

  // 比對完成才過濾；loading 期間顯示全部讓使用者知道資料已上傳
  const displayRows = loadingExisting ? rows : rows.filter(r => r.error || r.categoryWarning || hasChanges(r, existingData))
  const unchangedCount = loadingExisting ? 0 : rows.filter(r => !r.error && !r.categoryWarning && !hasChanges(r, existingData)).length
  const categoryWarningCount = displayRows.filter(r => !r.error && r.categoryWarning).length

  function handleClose() {
    setStep('upload')
    setRows([])
    setResult(null)
    setFileName('')
    setExistingData(new Map())
    setLoadingExisting(false)
    onClose()
  }

  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) { alert('請上傳 .csv 檔案'); return }
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = async (e) => {
      const text = e.target?.result as string
      const parsed = csvToRows(text, settings)
      if (parsed.length === 0) { alert('CSV 無有效資料，請確認格式'); return }
      setRows(parsed)
      setStep('preview')
      setExistingData(new Map())
      const ids = parsed.filter(r => r.equipment_id).map(r => r.equipment_id)
      if (ids.length > 0) {
        setLoadingExisting(true)
        try {
          const res = await fetch('/api/cards/lookup', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids }),
          })
          if (res.ok) {
            const data: ExistingCard[] = await res.json()
            setExistingData(new Map(data.map(c => [c.equipment_id, c])))
          }
        } finally {
          setLoadingExisting(false)
        }
      }
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
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#e8ddd4]">
          <h2 className="text-lg font-semibold text-[#3d2b1a]">批次匯入料卡</h2>
          <button onClick={handleClose} className="text-[#a08060] hover:text-[#7a5230] transition-colors focus:outline-none">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {/* Step: upload */}
          {step === 'upload' && (
            <div className="space-y-5">
              <div className="text-sm text-[#6b4c2e] space-y-1">
                <p>上傳 CSV 檔案，一次新增多筆料卡。下載範本填入資料後再上傳即可。</p>
              </div>

              {/* Field legend */}
              <div className="rounded-xl border border-[#e8ddd4] bg-[#faf6f0] px-4 py-3 text-sm space-y-1">
                <p className="font-medium text-[#7a5230] mb-1.5">欄位說明</p>
                <div className="flex flex-wrap gap-x-5 gap-y-0.5 text-[#5a3c1e]">
                  <span><span className="font-medium">料號</span>（必填）</span>
                  <span><span className="font-medium">品名</span>（必填）</span>
                  <span className="text-[#8a6a4a]">分類（選填）</span>
                  <span className="text-[#8a6a4a]">廠商（選填）</span>
                  <span className="text-[#8a6a4a]">狀態（選填，預設「現役」）</span>
                  <span className="text-[#8a6a4a]">標籤（選填，用 <code className="bg-[#ede5db] px-1 rounded text-xs">|</code> 分隔）</span>
                  <span className="text-[#8a6a4a]">備註（選填）</span>
                  <span className="text-[#8a6a4a]">淨重kg（選填）</span>
                  <span className="text-[#8a6a4a]">is_new（選填，true/false）</span>
                </div>
              </div>

              {/* Download template */}
              <a
                href="/batch-import-template.csv"
                download="設備料卡批次匯入範本.csv"
                className="inline-flex items-center gap-2 text-sm text-[#7a5230] hover:text-[#5a3010] font-medium"
              >
                <Download className="h-4 w-4" />
                下載 CSV 範本
              </a>

              {/* Drop zone */}
              <div
                className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-[#7a5230] bg-[#faf6f0]' : 'border-[#d5c4b0] hover:border-[#c49a72] hover:bg-[#faf6f0]'
                }`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={handleDrop}
              >
                <Upload className="h-10 w-10 text-[#c49a72] mx-auto mb-3" />
                <p className="text-[#7a5230] font-medium">點擊或拖曳 CSV 檔案至此</p>
                <p className="text-[#a08060] text-sm mt-1">僅支援 .csv 格式，UTF-8 編碼</p>
              </div>
              <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
            </div>
          )}

          {/* Step: preview */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 text-sm flex-wrap">
                <FileText className="h-4 w-4 text-[#a08060]" />
                <span className="text-[#6b4c2e]">{fileName}</span>
                <span className="text-[#c49a72]">·</span>
                <span className="text-emerald-600 font-medium">{validRows.length} 筆可匯入</span>
                {invalidRows.length > 0 && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="text-red-500 font-medium">{invalidRows.length} 筆有錯誤（將跳過）</span>
                  </>
                )}
                {loadingExisting && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="flex items-center gap-1 text-[#a08060]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />比對現有資料中…
                    </span>
                  </>
                )}
                {!loadingExisting && unchangedCount > 0 && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="text-[#a08060] font-medium">{unchangedCount} 筆無差異（略過）</span>
                  </>
                )}
                {!loadingExisting && clearCount > 0 && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="text-amber-600 font-medium">{clearCount} 筆有欄位將被清空</span>
                  </>
                )}
                {!loadingExisting && categoryWarningCount > 0 && (
                  <>
                    <span className="text-[#c49a72]">·</span>
                    <span className="text-yellow-600 font-medium">{categoryWarningCount} 筆分類不在清單內</span>
                  </>
                )}
              </div>
              {clearCount > 0 && (
                <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
                  <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
                  <span><span className="font-medium">橘色欄位</span>：CSV 中為空白，匯入後將清空該欄的現有資料。若非故意清空，請先返回 CSV 補填。</span>
                </div>
              )}

              <div className="overflow-x-auto rounded-lg border border-[#e8ddd4]">
                <table className="w-full min-w-max text-sm">
                  <thead className="bg-[#faf6f0] text-[#7a5230]">
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
                      <th className="px-3 py-2 text-left font-medium">新品</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f0e8e0]">
                    {displayRows.map((row, i) => (
                      <tr key={i} className={row.error ? 'bg-red-50' : 'bg-white hover:bg-[#faf6f0]'}>
                        <td className="px-3 py-2 text-[#a08060]">{i + 1}</td>
                        <td className="px-3 py-2 font-mono text-[#3d2b1a]">{row.equipment_id || <span className="text-red-400">（空）</span>}</td>
                        <td className={`px-3 py-2 text-[#3d2b1a] ${isValueChanged(row.name, 'name', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {row.name || <span className="text-red-400">（空）</span>}
                        </td>
                        <td className={`px-3 py-2 text-[#6b4c2e] ${isClear(row.category, 'category', row.equipment_id, existingData) ? 'bg-amber-50' : (row.categoryWarning || isValueChanged(row.category, 'category', row.equipment_id, existingData)) ? 'bg-yellow-50' : ''}`}>
                          {isClear(row.category, 'category', row.equipment_id, existingData)
                            ? <span className="flex items-center gap-1 text-amber-700 text-xs font-medium"><Trash2 className="h-3 w-3" />清空</span>
                            : row.categoryWarning
                              ? <span className="flex items-center gap-1 text-yellow-700 text-xs font-medium" title={row.categoryWarning}><AlertCircle className="h-3 w-3 shrink-0" />{row.category}</span>
                              : (row.category ?? '—')}
                        </td>
                        <td className={`px-3 py-2 text-[#6b4c2e] ${isClear(row.vendor, 'vendor', row.equipment_id, existingData) ? 'bg-amber-50' : isValueChanged(row.vendor, 'vendor', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {isClear(row.vendor, 'vendor', row.equipment_id, existingData) ? <span className="flex items-center gap-1 text-amber-700 text-xs font-medium"><Trash2 className="h-3 w-3" />清空</span> : (row.vendor ?? '—')}
                        </td>
                        <td className={`px-3 py-2 text-[#6b4c2e] ${isValueChanged(row.status, 'status', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {row.status}
                        </td>
                        <td className={`px-3 py-2 text-[#8a6a4a] text-xs ${isClear(row.tags, 'tags', row.equipment_id, existingData) ? 'bg-amber-50' : isValueChanged(row.tags, 'tags', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {isClear(row.tags, 'tags', row.equipment_id, existingData) ? <span className="flex items-center gap-1 text-amber-700 text-xs font-medium"><Trash2 className="h-3 w-3" />清空</span> : (row.tags?.join('、') ?? '—')}
                        </td>
                        <td className={`px-3 py-2 text-[#8a6a4a] truncate max-w-[8rem] ${isClear(row.notes, 'notes', row.equipment_id, existingData) ? 'bg-amber-50' : isValueChanged(row.notes, 'notes', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`} title={row.notes ?? undefined}>
                          {isClear(row.notes, 'notes', row.equipment_id, existingData) ? <span className="flex items-center gap-1 text-amber-700 text-xs font-medium"><Trash2 className="h-3 w-3" />清空</span> : (row.notes ?? '—')}
                        </td>
                        <td className={`px-3 py-2 text-[#8a6a4a] ${isClear(row.net_weight, 'net_weight', row.equipment_id, existingData) ? 'bg-amber-50' : isValueChanged(row.net_weight, 'net_weight', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {isClear(row.net_weight, 'net_weight', row.equipment_id, existingData) ? <span className="flex items-center gap-1 text-amber-700 text-xs font-medium"><Trash2 className="h-3 w-3" />清空</span> : (row.net_weight ?? '—')}
                        </td>
                        <td className={`px-3 py-2 text-[#8a6a4a] ${isValueChanged(row.is_new, 'is_new', row.equipment_id, existingData) ? 'bg-yellow-50' : ''}`}>
                          {row.is_new === true ? '是' : row.is_new === false ? '否' : '—'}
                        </td>
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
              <div className="flex items-start gap-3 p-4 bg-emerald-50 rounded-xl border border-emerald-100">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-emerald-800">匯入完成</p>
                  <p className="text-sm text-emerald-700 mt-0.5">成功新增 {result.inserted} 筆料卡</p>
                  {result.updated > 0 && (
                    <p className="text-sm text-emerald-700 mt-0.5">更新 {result.updated} 筆料卡</p>
                  )}
                  {(result.unchanged ?? 0) > 0 && (
                    <p className="text-sm text-emerald-700 mt-0.5">{result.unchanged} 筆無變動</p>
                  )}
                </div>
              </div>
              {result.skipped.length > 0 && (
                <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 text-sm">
                  <p className="font-medium text-amber-800 mb-1">跳過（料號已存在）{result.skipped.length} 筆</p>
                  <p className="text-amber-700 font-mono text-xs">{result.skipped.join('、')}</p>
                </div>
              )}
              {result.errors.length > 0 && (
                <div className="p-4 bg-red-50 rounded-xl border border-red-100 text-sm">
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
        <div className="flex items-center justify-between px-6 py-4 border-t border-[#e8ddd4] bg-[#faf6f0] rounded-b-2xl">
          {step === 'upload' && (
            <button onClick={handleClose} className="text-sm text-[#a08060] hover:text-[#7a5230]">取消</button>
          )}
          {step === 'preview' && (
            <>
              <button onClick={() => setStep('upload')} className="text-sm text-[#a08060] hover:text-[#7a5230]">
                重新上傳
              </button>
              <button
                onClick={handleImport}
                disabled={importing || validRows.length === 0}
                className="flex items-center gap-2 px-5 py-2 bg-[#7a5230] hover:bg-[#6a4520] text-white text-sm font-medium rounded-lg disabled:opacity-40 transition-colors focus:outline-none"
              >
                {importing && <Loader2 className="h-4 w-4 animate-spin" />}
                確認匯入 {validRows.length} 筆
              </button>
            </>
          )}
          {step === 'done' && (
            <button
              onClick={handleClose}
              className="ml-auto px-5 py-2 bg-[#7a5230] hover:bg-[#6a4520] text-white text-sm font-medium rounded-lg transition-colors focus:outline-none"
            >
              完成
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
