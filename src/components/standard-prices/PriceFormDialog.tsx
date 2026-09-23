'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Loader2, Plus, X, CopyPlus } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import DatePicker from '@/components/DatePicker'
import RichContentEditor from '@/components/tracker/RichContentEditor'
import type { PendingImage, TableData } from '@/components/tracker/richContentTypes'
import { useUpdateAttachmentUpload } from '@/hooks/useUpdateAttachmentUpload'
import { STANDARD_PRICE_LIMITS as L } from '@/lib/standardPriceFormat'
import type { StandardPriceItem, StandardPriceNumberField } from '@/types/standardPrice'
import { buildPayload, formFromItem, newFeeRow, NUMBER_LABELS, type PriceFormState } from './priceForm'
import { readApiError, formatDate } from './standardPriceUtils'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  item?: StandardPriceItem
  allItems: StandardPriceItem[]
  onClose: () => void
  onSaved: (item: StandardPriceItem, warning: string | null) => void
}

const MAX_NOTES = 5000
const inputCls = 'w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#c0a882] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50'
const labelCls = 'block text-xs text-[#a08060] mb-1'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="rounded-lg border border-[#e8ddd0] px-3 pt-1 pb-3">
      <legend className="px-1 text-xs font-semibold text-[#7a5230]">{title}</legend>
      {children}
    </fieldset>
  )
}

export default function PriceFormDialog({ open, mode, item, allItems, onClose, onSaved }: Props) {
  const [form, setForm] = useState<PriceFormState>(() => formFromItem(item))
  const [images, setImages] = useState<PendingImage[]>([])
  const [table, setTable] = useState<TableData | null>(null)
  const [submitting, setSubmitting] = useState<'save' | 'saveAs' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { upload } = useUpdateAttachmentUpload('/api/standard-prices/notes-signature')

  useEffect(() => {
    if (!open) return
    setForm(formFromItem(item))
    setImages((item?.notes_image_urls ?? []).map((img) => ({ tempId: img.public_id, uploading: false, public_id: img.public_id, url: img.url })))
    setTable(item?.notes_table_data ?? null)
    setError(null)
    setSubmitting(null)
  }, [open, item])

  const categories = useMemo(
    () => Array.from(new Set(allItems.map((i) => i.category))).sort((a, b) => a.localeCompare(b, 'zh-Hant')),
    [allItems],
  )

  const set = <K extends keyof PriceFormState>(key: K, value: PriceFormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const busy = submitting !== null

  async function submit(kind: 'save' | 'saveAs') {
    setError(null)
    const built = buildPayload(form)
    if (!built.ok) { setError(built.error); return }
    if (form.notes.trim().length > MAX_NOTES) { setError(`備註最多 ${MAX_NOTES} 字`); return }
    if (images.some((p) => p.uploading)) { setError('備註圖片仍在上傳中，請稍候'); return }
    if (images.some((p) => !p.url)) { setError('有備註圖片上傳失敗，請先移除後再儲存'); return }

    const payload = {
      ...built.payload,
      notes_image_urls: images.filter((p) => p.public_id && p.url).map((p) => ({ public_id: p.public_id!, url: p.url! })),
      notes_table_data: table,
    }
    const { name, effective_date } = payload as { name: string; effective_date: string }
    const clash = allItems.find(
      (i) => i.name === name && i.effective_date === effective_date && (kind === 'saveAs' || mode === 'create' || i.id !== item?.id),
    )
    if (clash) {
      setError(
        kind === 'saveAs'
          ? `「${name}」已有 ${formatDate(effective_date)} 的版本，另存為新版本請改用不同的生效日期`
          : `「${name}」已有 ${formatDate(effective_date)} 的版本（產品名稱＋生效日期不可重複）`,
      )
      return
    }

    setSubmitting(kind)
    try {
      const isPatch = mode === 'edit' && kind === 'save' && item
      const res = await fetch(isPatch ? `/api/standard-prices/${item.id}` : '/api/standard-prices', {
        method: isPatch ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        setError(await readApiError(res, '儲存失敗，請重試'))
        return
      }
      const data = await res.json()
      onSaved(data.item as StandardPriceItem, (data.warning as string | null) ?? null)
    } catch {
      setError('儲存失敗，請檢查網路後重試')
    } finally {
      setSubmitting(null)
    }
  }

  const numberInput = (key: StandardPriceNumberField, placeholder = '') => (
    <div>
      <label className={labelCls}>{NUMBER_LABELS[key]}</label>
      <input
        inputMode="decimal"
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={busy}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )

  const textInput = (key: 'warranty' | 'rent_contract' | 'plan_name', label: string, max: number, placeholder: string) => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        value={form[key]}
        onChange={(e) => set(key, e.target.value)}
        disabled={busy}
        maxLength={max}
        placeholder={placeholder}
        className={inputCls}
      />
    </div>
  )

  return (
    // modal=false：DatePicker 用 createPortal 掛到 document.body，不是 DialogContent 的 DOM 子節點，
    // Radix 預設 modal=true 的 FocusScope／RemoveScroll 會攔截它（見 CLAUDE.md 已知問題），比照 RuleFormDialog。
    // onInteractOutside 一律擋掉：modal=false 沒有遮罩，點到視窗外（背後頁面）預設會關閉並丟失整張長表單，
    // 只允許用右上 X／取消／Esc 關閉。DatePicker 的 portal 本身就被 ui/dialog 的 data-portal-popover 判斷放行，不受影響。
    <Dialog open={open} onOpenChange={(v) => !v && !busy && onClose()} modal={false}>
      <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-[#5a3820]">
            {mode === 'create' ? '新增產品售價' : `編輯售價版本（${item ? formatDate(item.effective_date) : ''}）`}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => { e.preventDefault(); submit('save') }} className="space-y-3">
          <Section title="基本">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className={labelCls}>產品名稱 *</label>
                <input value={form.name} onChange={(e) => set('name', e.target.value)} disabled={busy} maxLength={L.name}
                  placeholder="例：DMS 168（名稱完全相同＝同一產品）" className={inputCls} />
                {mode === 'edit' && <p className="text-[11px] text-[#a08060] mt-1">改名只會影響這個版本</p>}
              </div>
              <div>
                <label className={labelCls}>分類 *</label>
                <input value={form.category} onChange={(e) => set('category', e.target.value)} disabled={busy} maxLength={L.category}
                  list="standard-price-categories" placeholder="可自由輸入或選既有分類" className={inputCls} />
                <datalist id="standard-price-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div>
                <label className={labelCls}>生效日期 *</label>
                <DatePicker value={form.effective_date} onChange={(v) => set('effective_date', v)} disabled={busy} />
              </div>
              <div className="sm:col-span-2">
                {textInput('plan_name', '方案名稱（出自哪份文件）', L.plan_name, '例：2025.9 DMS 168 銷售方案')}
              </div>
            </div>
          </Section>

          <Section title="買斷">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {numberInput('buyout_list_price', '元')}
              {numberInput('buyout_sales_price', '元')}
              {numberInput('buyout_manager_price', '元')}
              {textInput('warranty', '保固', L.warranty, '例：三年')}
            </div>
          </Section>

          <Section title="租賃">
            <div className="grid grid-cols-2 gap-2">
              {numberInput('rent_monthly', '元/月')}
              {textInput('rent_contract', '合約期', L.rent_contract, '例：三年約（續租續保）')}
            </div>
          </Section>

          <Section title="共通費用">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {numberInput('platform_fee_buyout', '元/月')}
              {numberInput('platform_fee_rent', '元/月')}
              {numberInput('install_fee', '元/台')}
            </div>
          </Section>

          <Section title="其他費用">
            <div className="space-y-1.5">
              {form.extra_fees.length === 0 && <p className="text-xs text-[#c0a882]">尚無其他費用</p>}
              {form.extra_fees.map((fee) => (
                <div key={fee.key} className="flex items-center gap-1.5">
                  <input value={fee.name} disabled={busy} maxLength={L.extraFeeName} placeholder="名稱（例：加裝4G模組）"
                    onChange={(e) => set('extra_fees', form.extra_fees.map((f) => f.key === fee.key ? { ...f, name: e.target.value } : f))}
                    className={`${inputCls} flex-[2] min-w-0`} />
                  <input value={fee.amount} disabled={busy} inputMode="decimal" placeholder="金額（可空）"
                    onChange={(e) => set('extra_fees', form.extra_fees.map((f) => f.key === fee.key ? { ...f, amount: e.target.value } : f))}
                    className={`${inputCls} flex-1 min-w-0`} />
                  <input value={fee.unit} disabled={busy} maxLength={L.extraFeeUnit} placeholder="單位"
                    onChange={(e) => set('extra_fees', form.extra_fees.map((f) => f.key === fee.key ? { ...f, unit: e.target.value } : f))}
                    className={`${inputCls} w-16 sm:w-20 flex-shrink-0`} />
                  <button type="button" disabled={busy} title="移除"
                    onClick={() => set('extra_fees', form.extra_fees.filter((f) => f.key !== fee.key))}
                    className="p-1 text-[#a08060] hover:text-[#b5451b] transition-colors flex-shrink-0 disabled:opacity-40">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {form.extra_fees.length < L.extraFeesMax && (
                <button type="button" disabled={busy}
                  onClick={() => set('extra_fees', [...form.extra_fees, newFeeRow()])}
                  className="flex items-center gap-1 text-xs text-[#7a5230] hover:text-[#9c6b42] transition-colors disabled:opacity-40">
                  <Plus className="h-3.5 w-3.5" />新增一列
                </button>
              )}
            </div>
          </Section>

          <Section title="業績積分">
            <div className="grid grid-cols-2 gap-2">
              {numberInput('points_buyout', '分/台')}
              {numberInput('points_rent', '分/台')}
            </div>
          </Section>

          <div>
            <label className={labelCls}>備註（可直接貼上圖片或 Excel 表格）</label>
            <RichContentEditor
              content={form.notes}
              onContentChange={(v) => set('notes', v)}
              images={images}
              onImagesChange={setImages}
              table={table}
              onTableChange={setTable}
              uploadImage={upload}
              placeholder="使用條件、搭配說明…"
              rows={4}
              disabled={busy}
            />
          </div>

          {error && <p className="text-xs text-[#b5451b]">{error}</p>}

          <div className="flex flex-wrap gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} disabled={busy}
              className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors disabled:opacity-40">
              取消
            </button>
            {mode === 'edit' && (
              <button type="button" onClick={() => submit('saveAs')} disabled={busy}
                title="用目前表單內容建立一個新版本（需使用不同的生效日期），原版本保留不變"
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-[#7a5230] border border-[rgba(122,82,48,.35)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-50 transition-colors">
                {submitting === 'saveAs' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CopyPlus className="h-3.5 w-3.5" />}
                另存為新版本
              </button>
            )}
            <button type="submit" disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {submitting === 'save' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'create' ? '新增' : '儲存修改'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
