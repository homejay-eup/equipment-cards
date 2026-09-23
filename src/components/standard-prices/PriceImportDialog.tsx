'use client'

import { useMemo, useRef, useState } from 'react'
import { Download, FileUp, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { STANDARD_PRICE_LIMITS as L } from '@/lib/standardPriceFormat'
import type { StandardPriceImportResult, StandardPriceImportRowError, StandardPriceItem } from '@/types/standardPrice'
import { analyzeCsv, buildTemplateCsv, type CsvAnalysis, type RowStatus } from './priceCsv'
import { formatDate } from './standardPriceUtils'

interface Props {
  open: boolean
  existing: StandardPriceItem[]
  onClose: () => void
  onImported: (items: StandardPriceItem[]) => void
}

const STATUS_LABEL: Record<RowStatus, { text: string; cls: string }> = {
  new_product: { text: '新增產品', cls: 'bg-[#e6f2e6] text-[#3f6b3f]' },
  new_version: { text: '新版本', cls: 'bg-[#e8eef8] text-[#3d5a8a]' },
  overwrite: { text: '覆蓋同一版', cls: 'bg-[#fdf3e3] text-[#8a5a1c]' },
  error: { text: '錯誤', cls: 'bg-[rgba(181,69,27,.1)] text-[#b5451b]' },
}

export default function PriceImportDialog({ open, existing, onClose, onImported }: Props) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [analysis, setAnalysis] = useState<CsvAnalysis | null>(null)
  const [serverErrors, setServerErrors] = useState<Map<number, string>>(new Map()) // 列號 → 訊息
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ inserted: number; updated: number } | null>(null)

  const validRows = useMemo(() => (analysis?.rows ?? []).filter((r) => r.row && !serverErrors.has(r.line)), [analysis, serverErrors])
  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { new_product: 0, new_version: 0, overwrite: 0, error: 0 }
    for (const r of analysis?.rows ?? []) c[serverErrors.has(r.line) ? 'error' : r.status]++
    return c
  }, [analysis, serverErrors])

  function reset() {
    setFileName('')
    setAnalysis(null)
    setServerErrors(new Map())
    setError(null)
    setResult(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  function handleClose() {
    if (submitting) return
    reset()
    onClose()
  }

  function downloadTemplate() {
    const blob = new Blob([buildTemplateCsv()], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '標準售價匯入範本.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleFile(file: File) {
    if (!file.name.toLowerCase().endsWith('.csv')) { setError('請上傳 .csv 檔案'); return }
    reset()
    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => setAnalysis(analyzeCsv(String(e.target?.result ?? ''), existing))
    reader.onerror = () => setError('讀取檔案失敗')
    reader.readAsText(file, 'UTF-8')
  }

  async function handleImport() {
    if (validRows.length === 0) return
    if (validRows.length > L.importRowsMax) {
      setError(`一次最多匯入 ${L.importRowsMax} 列（目前 ${validRows.length} 列），請分批匯入`)
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/standard-prices/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.map((r) => r.row) }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        const rowErrors = (data?.row_errors ?? []) as StandardPriceImportRowError[]
        if (rowErrors.length > 0) {
          setServerErrors((prev) => {
            const next = new Map(prev)
            for (const e of rowErrors) {
              const r = validRows[e.index]
              if (r) next.set(r.line, e.message)
            }
            return next
          })
        }
        setError(`${data?.error ?? '匯入失敗'}${rowErrors.length > 0 ? '（錯誤列已標示，可再次按匯入只送出其餘正確列）' : ''}`)
        return
      }
      const ok = data as StandardPriceImportResult
      onImported(ok.items ?? [])
      setResult({ inserted: ok.inserted, updated: ok.updated })
    } catch {
      setError('匯入失敗，請檢查網路後重試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-4xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#5a3820]">批次匯入標準售價</DialogTitle>
        </DialogHeader>

        {result ? (
          <div className="py-6 text-center space-y-3">
            <CheckCircle2 className="h-10 w-10 text-[#5d8a5d] mx-auto" />
            <p className="text-sm text-[#2c1e12]">匯入完成：新增 {result.inserted} 筆、覆蓋 {result.updated} 筆</p>
            <div className="flex justify-center gap-2">
              <button type="button" onClick={reset}
                className="px-3 py-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.35)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors">
                再匯入一份
              </button>
              <button type="button" onClick={handleClose}
                className="px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors">
                完成
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg bg-[#faf6f0] border border-[#e8ddd0] px-3 py-2 text-xs text-[#6b4f38] space-y-1 leading-relaxed">
              <p>依「產品名稱＋生效日期」判斷：不存在 → 新增；已存在 → 覆蓋該版本。產品名稱完全相同才算同一產品。</p>
              <p>生效日期格式 YYYY-MM-DD 或 YYYY/MM/DD；其他費用格式 <code>名稱=金額/單位</code>，多筆以「、」分隔（例：加裝4G模組=4500/台、校驗=500/次）。</p>
              <p>覆蓋同一版時：CSV 有的欄位若留空會<strong>清空</strong>既有值，唯獨「備註」留空會保留既有備註；CSV 沒有的欄位、備註圖片/表格一律保留。</p>
              <p>用 Excel 編輯後請「另存新檔」選 <strong>CSV UTF-8（逗號分隔）</strong>；一般的「CSV（逗號分隔）」在繁中 Windows 會存成 Big5 編碼，匯入後中文會變亂碼。</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={downloadTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.35)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors">
                <Download className="h-3.5 w-3.5" />下載範本
              </button>
              <button type="button" onClick={() => fileRef.current?.click()} disabled={submitting}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
                <FileUp className="h-3.5 w-3.5" />選擇 CSV 檔
              </button>
              {fileName && <span className="text-xs text-[#a08060] truncate max-w-[200px]">{fileName}</span>}
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
            </div>

            {analysis?.fatal && <p className="text-sm text-[#b5451b]">{analysis.fatal}</p>}

            {analysis && !analysis.fatal && (
              <>
                {analysis.unknownHeaders.length > 0 && (
                  <p className="flex items-start gap-1 text-xs text-[#8a5a1c]">
                    <AlertTriangle className="h-3.5 w-3.5 mt-px flex-shrink-0" />
                    無法辨識的欄位（將忽略）：{analysis.unknownHeaders.join('、')}
                  </p>
                )}
                {analysis.missingOptional.length > 0 && (
                  <p className="text-xs text-[#a08060]">CSV 未包含欄位：{analysis.missingOptional.join('、')}（新增時為空；覆蓋時沿用既有值）</p>
                )}
                <div className="flex flex-wrap gap-1.5 text-xs">
                  {(Object.keys(STATUS_LABEL) as RowStatus[]).map((s) => (
                    <span key={s} className={`px-2 py-0.5 rounded-full ${STATUS_LABEL[s].cls}`}>{STATUS_LABEL[s].text} {counts[s]}</span>
                  ))}
                </div>
                <div className="border border-[#e8ddd0] rounded-lg overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-[#faf6f0] text-[#a08060] text-left">
                        <th className="px-2 py-1.5 font-semibold whitespace-nowrap">列</th>
                        <th className="px-2 py-1.5 font-semibold whitespace-nowrap">狀態</th>
                        <th className="px-2 py-1.5 font-semibold">產品名稱</th>
                        <th className="px-2 py-1.5 font-semibold whitespace-nowrap">生效日期</th>
                        <th className="px-2 py-1.5 font-semibold">說明</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.rows.map((r) => {
                        const serverErr = serverErrors.get(r.line)
                        const status: RowStatus = serverErr ? 'error' : r.status
                        const msgs = [...r.errors, ...(serverErr ? [serverErr] : [])]
                        return (
                          <tr key={r.line} className="border-t border-[#f0e8dc] align-top">
                            <td className="px-2 py-1.5 text-[#a08060]">{r.line}</td>
                            <td className="px-2 py-1.5 whitespace-nowrap">
                              <span className={`px-1.5 py-px rounded-full ${STATUS_LABEL[status].cls}`}>{STATUS_LABEL[status].text}</span>
                            </td>
                            <td className="px-2 py-1.5 text-[#2c1e12] break-words">{r.name || <span className="text-[#c0a882]">（空白）</span>}</td>
                            <td className="px-2 py-1.5 text-[#2c1e12] whitespace-nowrap">{r.effective_date ? formatDate(r.effective_date) : ''}</td>
                            <td className="px-2 py-1.5">
                              {msgs.map((m) => <p key={m} className="text-[#b5451b]">{m}</p>)}
                              {r.warnings.map((w) => (
                                <p key={w} className="flex items-start gap-1 text-[#8a5a1c]"><AlertTriangle className="h-3 w-3 mt-px flex-shrink-0" />{w}</p>
                              ))}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {error && <p className="text-xs text-[#b5451b]">{error}</p>}

            <div className="flex justify-end gap-2 pt-1">
              <button type="button" onClick={handleClose} disabled={submitting}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors disabled:opacity-40">
                取消
              </button>
              <button type="button" onClick={handleImport} disabled={submitting || validRows.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                匯入 {validRows.length} 筆{counts.error > 0 ? '（略過錯誤列）' : ''}
              </button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
