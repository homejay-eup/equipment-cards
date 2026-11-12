'use client'

import { useMemo, useRef, useState } from 'react'
import { ArrowLeft, Download, FileUp, Loader2, Pencil, Plus, Search, Trash2, Upload, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import { emailName, formatDateTime } from '@/components/standard-prices/standardPriceUtils'
import { RESIDUAL_LIMITS } from '@/lib/residualValidation'
import { fmt, formatVersion } from '@/lib/residualCalc'
import type { ResidualItem } from '@/types/residual'
import { itemsToCsv, parseDelimited, readError, rowsToImport } from './residualUtils'

interface Props {
  items: ResidualItem[]
  version: string | null
  /** 資料有變動（新增／修改／刪除／匯入成功）後呼叫，由父層重新抓取 */
  onChanged: () => void
  onBack: () => void
}

interface FormState { id: string | null; code: string; name: string; price: string; years: string }
const EMPTY_FORM: FormState = { id: null, code: '', name: '', price: '', years: '' }

const inputCls =
  'w-full border border-[#e8ddd0] rounded-md px-2.5 py-1.5 text-sm text-[#2c1e12] bg-white focus:outline-none focus:ring-1 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50'
const ghostBtn =
  'flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] disabled:opacity-50 transition-colors'

// Step 53：設備殘值「管理品項」（需 edit_residual）。新增／修改／刪除品項、CSV 批次匯入與匯出。
export default function ResidualItemsPanel({ items, version, onChanged, onBack }: Props) {
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<ResidualItem | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [notice, setNotice] = useState<{ text: string; bad: boolean } | null>(null)

  // 匯入
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importErrors, setImportErrors] = useState<{ row: number; message: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q))
  }, [items, query])

  const importRows = useMemo(() => (importText.trim() ? rowsToImport(parseDelimited(importText)) : []), [importText])
  const noPriceCount = items.filter((i) => i.price == null).length

  function startEdit(it: ResidualItem) {
    setFormError(null)
    setForm({ id: it.id, code: it.code, name: it.name, price: it.price == null ? '' : String(it.price), years: it.years == null ? '' : String(it.years) })
  }

  async function saveForm() {
    if (!form) return
    setSaving(true)
    setFormError(null)
    try {
      const res = await fetch(form.id ? `/api/residual/items/${form.id}` : '/api/residual/items', {
        method: form.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: form.code, name: form.name, price: form.price, years: form.years }),
      })
      if (!res.ok) { setFormError(await readError(res, '儲存失敗')); return }
      setNotice({ text: form.id ? `已更新 ${form.code}` : `已新增 ${form.code}`, bad: false })
      setForm(null)
      onChanged()
    } catch {
      setFormError('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      const res = await fetch(`/api/residual/items/${deleting.id}`, { method: 'DELETE' })
      if (!res.ok) { setNotice({ text: await readError(res, '刪除失敗'), bad: true }); return }
      setNotice({ text: `已刪除 ${deleting.code}`, bad: false })
      if (form?.id === deleting.id) setForm(null)
      setDeleting(null)
      onChanged()
    } catch {
      setNotice({ text: '刪除失敗', bad: true })
    } finally {
      setDeleteBusy(false)
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return
    if (file.size > 2 * 1024 * 1024) { setNotice({ text: '檔案太大（上限 2MB）', bad: true }); return }
    setImportText(await file.text())
    setImportErrors([])
    if (fileRef.current) fileRef.current.value = ''
  }

  async function runImport() {
    if (!importRows.length) return
    setImportBusy(true)
    setImportErrors([])
    try {
      const res = await fetch('/api/residual/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: importRows }),
      })
      const json = await res.json().catch(() => null)
      if (!res.ok) {
        setImportErrors(Array.isArray(json?.errors) ? json.errors : [])
        setNotice({ text: typeof json?.error === 'string' ? json.error : '匯入失敗', bad: true })
        return
      }
      setNotice({ text: `匯入完成：新增 ${json.created} 筆、更新 ${json.updated} 筆`, bad: false })
      setImportText('')
      setImportOpen(false)
      onChanged()
    } catch {
      setNotice({ text: '匯入失敗', bad: true })
    } finally {
      setImportBusy(false)
    }
  }

  function exportCsv() {
    const blob = new Blob([itemsToCsv(items)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    const n = new Date()
    const p = (x: number) => String(x).padStart(2, '0')
    a.download = `設備殘值品項_${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}.csv`
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <button onClick={onBack} className={ghostBtn}>
          <ArrowLeft className="h-4 w-4" />回到計算
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-semibold text-[#2c1e12]">管理品項</h2>
          <p className="text-xs text-[#a08060]">
            共 {items.length} 筆（{noPriceCount} 筆報價無資料）｜價格版本 {formatVersion(version)}（任何異動都會自動更新）
          </p>
        </div>
        <button onClick={exportCsv} className={ghostBtn}><Download className="h-4 w-4" />匯出 CSV</button>
        <button onClick={() => { setImportOpen((o) => !o); setImportErrors([]) }} className={ghostBtn}>
          <Upload className="h-4 w-4" />批次匯入
        </button>
        <button
          onClick={() => { setFormError(null); setForm({ ...EMPTY_FORM }) }}
          className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#7a5230] text-white text-sm font-medium hover:bg-[#9c6b42] transition-colors"
        >
          <Plus className="h-4 w-4" />新增品項
        </button>
      </div>

      {notice && (
        <div className={`flex items-center justify-between gap-2 text-sm rounded-md px-3 py-2 mb-3 ${notice.bad ? 'bg-[rgba(181,69,27,.08)] text-[#b5451b]' : 'bg-[#e8f4ec] text-[#1f6b45]'}`} role="status">
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="關閉提示"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* 新增／編輯表單 */}
      {form && (
        <div className="rounded-xl border border-[#c49a72] bg-[#fff9f4] p-4 mb-3 space-y-3">
          <div className="text-sm font-semibold text-[#2c1e12]">{form.id ? '編輯品項' : '新增品項'}</div>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr_140px_140px]">
            <div>
              <label className="block text-xs text-[#a08060] mb-1">品號</label>
              <input value={form.code} maxLength={RESIDUAL_LIMITS.codeMax} onChange={(e) => setForm({ ...form, code: e.target.value })} disabled={saving} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block text-xs text-[#a08060] mb-1">品名</label>
              <input value={form.name} maxLength={RESIDUAL_LIMITS.nameMax} onChange={(e) => setForm({ ...form, name: e.target.value })} disabled={saving} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-[#a08060] mb-1">金額（元）</label>
              <input inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} disabled={saving} className={`${inputCls} font-mono`} />
            </div>
            <div>
              <label className="block text-xs text-[#a08060] mb-1">年限（月）</label>
              <input inputMode="numeric" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} disabled={saving} className={`${inputCls} font-mono`} />
            </div>
          </div>
          <p className="text-xs text-[#a08060]">金額與年限要一起填；兩者都留空＝「報價無資料」，計算時不列入合計。年限單位是月（例：3 年填 36）。</p>
          {formError && <p className="text-xs text-[#b5451b]">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setForm(null)} disabled={saving} className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] transition-colors">取消</button>
            <button onClick={saveForm} disabled={saving} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}儲存
            </button>
          </div>
        </div>
      )}

      {/* 批次匯入 */}
      {importOpen && (
        <div className="rounded-xl border border-[#e8ddd0] bg-white p-4 mb-3 space-y-3">
          <div className="text-sm font-semibold text-[#2c1e12]">批次匯入（以品號比對：已有的更新、沒有的新增）</div>
          <p className="text-xs text-[#a08060]">
            欄位順序：品號、品名、金額、年限(月)。可選 CSV 檔，或直接從 Excel 複製貼上。第一列若是表頭會自動略過。
            建議先「匯出 CSV」當範本。一次最多 {RESIDUAL_LIMITS.importMax} 筆；有任何一列有問題整批都不會匯入。
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={(e) => handleFile(e.target.files?.[0])} disabled={importBusy}
              className="text-sm text-[#6b4f38] file:mr-3 file:rounded-md file:border-0 file:bg-[rgba(122,82,48,.08)] file:px-3 file:py-1.5 file:text-sm file:text-[#7a5230] hover:file:bg-[rgba(122,82,48,.14)]" />
          </div>
          <textarea
            value={importText}
            onChange={(e) => { setImportText(e.target.value); setImportErrors([]) }}
            rows={6}
            disabled={importBusy}
            placeholder={'品號\t品名\t金額\t年限(月)\n1000042\tHS SD-DVR\t12000\t36'}
            className={`${inputCls} font-mono text-xs`}
          />
          {importRows.length > 0 && <p className="text-xs text-[#6b4f38]">已讀到 {importRows.length} 列。</p>}
          {importErrors.length > 0 && (
            <ul className="text-xs text-[#b5451b] list-disc pl-5 max-h-40 overflow-y-auto">
              {importErrors.map((e, i) => <li key={i}>第 {e.row} 列：{e.message}</li>)}
            </ul>
          )}
          <div className="flex justify-end gap-2">
            <button onClick={() => { setImportOpen(false); setImportText(''); setImportErrors([]) }} disabled={importBusy} className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] transition-colors">取消</button>
            <button onClick={runImport} disabled={importBusy || importRows.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {importBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}匯入
            </button>
          </div>
        </div>
      )}

      {/* 品項清單 */}
      <div className="rounded-xl border border-[#e8ddd0] bg-white p-4 space-y-3">
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋品號或品名" className={`${inputCls} pl-9`} aria-label="搜尋品項" />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="text-xs text-[#a08060] text-left">
                <th className="py-1.5 px-2 border-b border-[#e8ddd0] font-medium">品號</th>
                <th className="py-1.5 px-2 border-b border-[#e8ddd0] font-medium">品名</th>
                <th className="py-1.5 px-2 border-b border-[#e8ddd0] font-medium text-right">金額</th>
                <th className="py-1.5 px-2 border-b border-[#e8ddd0] font-medium text-right">年限(月)</th>
                <th className="py-1.5 px-2 border-b border-[#e8ddd0] font-medium">最後修改</th>
                <th className="border-b border-[#e8ddd0]" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((it) => (
                <tr key={it.id} className="hover:bg-[rgba(122,82,48,.03)]">
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] font-mono text-[#6b4f38] whitespace-nowrap">{it.code}</td>
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] text-[#2c1e12]">{it.name}</td>
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] text-right font-mono tabular-nums">
                    {it.price == null ? <span className="text-xs text-[#a4570b] bg-[#fbf0e2] rounded px-1.5 py-0.5">報價無資料</span> : fmt(it.price)}
                  </td>
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] text-right font-mono tabular-nums">{it.years ?? ''}</td>
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] text-xs text-[#a08060] whitespace-nowrap">
                    {formatDateTime(it.updated_at)} · {emailName(it.updated_by)}
                  </td>
                  <td className="py-1.5 px-2 border-b border-[#f0e8dc] whitespace-nowrap text-right">
                    <button onClick={() => startEdit(it)} aria-label={`編輯 ${it.code}`} className="p-1.5 rounded text-[#a08060] hover:text-[#7a5230] transition-colors"><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => setDeleting(it)} aria-label={`刪除 ${it.code}`} className="p-1.5 rounded text-[#a08060] hover:text-[#b5451b] transition-colors"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-sm text-[#a08060]">{items.length === 0 ? '還沒有品項，請按「新增品項」或「批次匯入」' : '沒有符合的品項'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        open={!!deleting}
        title={deleteBusy ? '刪除中…' : '刪除此品項？'}
        message={deleting ? `${deleting.code} ${deleting.name} 將被刪除，無法還原。` : undefined}
        confirmLabel="刪除"
        danger
        onConfirm={() => { if (!deleteBusy) confirmDelete() }}
        onCancel={() => { if (!deleteBusy) setDeleting(null) }}
      />
    </div>
  )
}
