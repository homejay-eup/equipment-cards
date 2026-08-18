'use client'

import { useState, useEffect, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, X } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceRule, MaintenanceRuleType, MAINTENANCE_RULE_TYPES } from '@/types/maintenance'
import EquipmentQuickPick from '@/components/documents/EquipmentQuickPick'
import DatePicker from '@/components/DatePicker'
import { MAX_WARRANTY_PERIOD_MONTHS } from '@/lib/maintenanceFormat'

type WarrantyPeriodUnit = 'month' | 'year'

// 既有月數換算回輸入用的「數字＋單位」：優先用年顯示（能整除 12 就用年），
// 否則用月，讓使用者體感自然（例如 24 個月顯示為「2」年，18 個月顯示為「18」月）
function monthsToDisplay(months: number | null | undefined): { value: string; unit: WarrantyPeriodUnit } {
  if (months === null || months === undefined) return { value: '', unit: 'month' }
  if (months > 0 && months % 12 === 0) return { value: String(months / 12), unit: 'year' }
  return { value: String(months), unit: 'month' }
}

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  vendorId: string
  rule?: MaintenanceRule
  allCards: EquipmentCard[]
  onClose: () => void
  onSaved: () => void
}

// 新增/編輯規則 Dialog：類型下拉限定 4 種、內容 textarea、保固起始日選填，
// 用 EquipmentQuickPick 掛載料號（暫存於 local state，按儲存才一次送出，
// 編輯時再比對差異呼叫 link/unlink API）
export default function RuleFormDialog({ open, mode, vendorId, rule, allCards, onClose, onSaved }: Props) {
  const [item, setItem] = useState('')
  const [ruleType, setRuleType] = useState<MaintenanceRuleType>('送修規則')
  const [content, setContent] = useState('')
  const [warrantyStartDate, setWarrantyStartDate] = useState('')
  const [warrantyPeriodValue, setWarrantyPeriodValue] = useState('')
  const [warrantyPeriodUnit, setWarrantyPeriodUnit] = useState<WarrantyPeriodUnit>('month')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 掛載/移除料號失敗時的提示：輕量 toast，比照 PackageExplorer 的作法（無全站共用元件），
  // 2.5 秒後自動消失。渲染在 <Dialog> 外層，即使 Dialog 已關閉也能持續顯示
  const [warningToast, setWarningToast] = useState<string | null>(null)
  const warningToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (warningToastTimerRef.current) clearTimeout(warningToastTimerRef.current) }, [])

  function showWarningToast(message: string) {
    if (warningToastTimerRef.current) clearTimeout(warningToastTimerRef.current)
    setWarningToast(message)
    warningToastTimerRef.current = setTimeout(() => setWarningToast(null), 4000)
  }

  useEffect(() => {
    if (!open) return
    setItem(rule?.item ?? '')
    setRuleType(rule?.rule_type ?? '送修規則')
    setContent(rule?.content ?? '')
    setWarrantyStartDate(rule?.warranty_start_date ?? '')
    const { value, unit } = monthsToDisplay(rule?.warranty_period_months)
    setWarrantyPeriodValue(value)
    setWarrantyPeriodUnit(unit)
    setPickedIds((rule?.equipment_ids ?? []).map(e => e.equipment_id))
    setError(null)
  }, [open, rule])

  const idToCard = new Map(allCards.map(c => [c.equipment_id, c]))

  function removeId(id: string) {
    setPickedIds(prev => prev.filter(i => i !== id))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!item.trim()) { setError('項目/型號為必填'); return }
    if (!content.trim()) { setError('內容為必填'); return }

    const trimmedPeriod = warrantyPeriodValue.trim()
    let warrantyPeriodMonths: number | null = null
    if (trimmedPeriod) {
      const n = Number(trimmedPeriod)
      if (!Number.isInteger(n) || n < 0) { setError('保固期間必須為非負整數'); return }
      const months = warrantyPeriodUnit === 'year' ? n * 12 : n
      if (months > MAX_WARRANTY_PERIOD_MONTHS) {
        setError(`保固期間不可超過 ${MAX_WARRANTY_PERIOD_MONTHS} 個月（100 年）`)
        return
      }
      warrantyPeriodMonths = months
    }

    setSubmitting(true)
    setError(null)
    try {
      let warning: string | null = null
      if (mode === 'create') {
        const res = await fetch('/api/maintenance/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_id: vendorId,
            item: item.trim(),
            rule_type: ruleType,
            content: content.trim(),
            warranty_start_date: warrantyStartDate.trim() || null,
            warranty_period_months: warrantyPeriodMonths,
            equipment_ids: pickedIds,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error ?? '新增失敗'); return }
        // API 在規則建立成功但掛載料號失敗時仍回 2xx 並附 warning，需明確呈現給使用者，
        // 否則使用者會誤以為所有勾選的料號都已成功掛載
        if (typeof data?.warning === 'string') warning = data.warning
      } else if (rule) {
        const res = await fetch(`/api/maintenance/rules/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item: item.trim(),
            rule_type: ruleType,
            content: content.trim(),
            warranty_start_date: warrantyStartDate.trim() || null,
            warranty_period_months: warrantyPeriodMonths,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data?.error ?? '更新失敗'); return }

        const originalIds = new Set((rule.equipment_ids ?? []).map(e => e.equipment_id))
        const nextIds = new Set(pickedIds)
        const toAdd = pickedIds.filter(id => !originalIds.has(id))
        const toRemove = Array.from(originalIds).filter(id => !nextIds.has(id))

        // 內容更新已成功；掛載異動若失敗需明確告知使用者（曾經完全靜默忽略失敗，
        // 造成畫面顯示為成功但實際料號掛載/移除沒有生效）
        if (toAdd.length > 0) {
          const linkRes = await fetch(`/api/maintenance/rules/${rule.id}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipment_ids: toAdd }),
          })
          if (!linkRes.ok) warning = '規則內容已更新，但新增掛載料號時發生錯誤，請重新確認掛載狀態'
        }
        if (toRemove.length > 0) {
          const unlinkRes = await fetch(`/api/maintenance/rules/${rule.id}/link`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ equipment_ids: toRemove }),
          })
          if (!unlinkRes.ok) warning = warning
            ?? '規則內容已更新，但移除掛載料號時發生錯誤，請重新確認掛載狀態'
        }
      }
      onSaved()
      onClose()
      if (warning) {
        // 儲存已完成（規則本體有效），但掛載狀態可能與畫面顯示不一致，用非阻斷 toast 告知
        showWarningToast(warning)
      }
    } catch {
      setError('儲存失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && !submitting && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#5a3820]">{mode === 'create' ? '新增規則' : '編輯規則'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#a08060] mb-1">項目/型號 *</label>
            <input
              value={item} onChange={e => setItem(e.target.value)} autoFocus disabled={submitting}
              placeholder="自由文字，例如型號通稱"
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">類型 *</label>
            <select
              value={ruleType} onChange={e => setRuleType(e.target.value as MaintenanceRuleType)} disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            >
              {MAINTENANCE_RULE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">內容 *</label>
            <textarea
              value={content} onChange={e => setContent(e.target.value)} disabled={submitting} rows={5}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">適用進貨日期（起）</label>
            <p className="text-[10px] text-[#a08060] mb-1.5">此日期（含）之後到貨的設備才適用這條規則，選填</p>
            <DatePicker value={warrantyStartDate} onChange={setWarrantyStartDate} disabled={submitting} />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">保固期間</label>
            <div className="flex items-center gap-2">
              <input
                type="number" min="0" max={warrantyPeriodUnit === 'year' ? MAX_WARRANTY_PERIOD_MONTHS / 12 : MAX_WARRANTY_PERIOD_MONTHS}
                value={warrantyPeriodValue}
                onChange={e => setWarrantyPeriodValue(e.target.value)}
                disabled={submitting}
                placeholder="數字，選填"
                className="flex-1 border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
              />
              <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs flex-shrink-0">
                <button type="button" onClick={() => setWarrantyPeriodUnit('month')} disabled={submitting}
                  className={`px-2.5 py-2 transition-colors ${warrantyPeriodUnit === 'month' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'} disabled:opacity-50`}>
                  月
                </button>
                <button type="button" onClick={() => setWarrantyPeriodUnit('year')} disabled={submitting}
                  className={`px-2.5 py-2 transition-colors ${warrantyPeriodUnit === 'year' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'} disabled:opacity-50`}>
                  年
                </button>
              </div>
            </div>
            <p className="text-[10px] text-[#a08060] mt-1.5">顯示時會自動換算，例如輸入 18 個月會顯示為「1 年 6 個月」</p>
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">掛載料號</label>
            <p className="text-[10px] text-[#a08060] mb-1.5">掛載多筆料號＝這些料號共用同一份內容，編輯此規則會同步影響所有掛載的料號。若某料號規則需要獨立，請先移除掛載再另建一筆規則。</p>
            {pickedIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-1.5">
                {pickedIds.map(id => {
                  const card = idToCard.get(id)
                  return (
                    <span key={id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]">
                      {id}{card ? ` ${card.name}` : ''}
                      <button type="button" onClick={() => removeId(id)} disabled={submitting} className="hover:text-[#b5451b]">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  )
                })}
              </div>
            )}
            <EquipmentQuickPick
              allCards={allCards}
              excludeIds={pickedIds}
              disabled={submitting}
              onPickMany={(ids) => setPickedIds(prev => [...prev, ...ids])}
            />
          </div>
          {error && <p className="text-xs text-[#b5451b]">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors disabled:opacity-40">
              取消
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'create' ? '新增' : '儲存'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>

    {/* 掛載/移除料號失敗提示：輕量 toast，即使 Dialog 已關閉也持續顯示 4 秒 */}
    {warningToast && (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[90] bg-[#b5451b] text-white text-xs font-medium px-4 py-2 rounded-full shadow-lg max-w-[90vw] text-center"
      >
        {warningToast}
      </div>
    )}
    </>
  )
}
