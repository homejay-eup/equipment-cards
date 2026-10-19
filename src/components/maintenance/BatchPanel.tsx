'use client'

import { useState, useMemo } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceVendor, MaintenanceStage } from '@/types/maintenance'
import { MAX_AGE_LIMIT_BASIS_LENGTH, STAGE_SUBCATEGORIES, displayToMonths, type PeriodUnit, type BatchFieldKey } from '@/lib/maintenanceFormat'
import EquipmentQuickPick from '@/components/documents/EquipmentQuickPick'
import ThemedSelect from '@/components/maintenance/ThemedSelect'
import { PeriodInput, SELECTABLE_STAGES } from '@/components/maintenance/RuleEditPanel'

/** 需要展開面板的批次操作（標示已確認、批次刪除不需要面板，由父層直接處理） */
export type BatchPanelMode = 'stage' | 'equipment' | 'vendor' | 'fields'

export const BATCH_PANEL_TITLE: Record<BatchPanelMode, string> = {
  stage: '改區塊',
  equipment: '掛載／移除料號',
  vendor: '改廠商',
  fields: '改共用欄位',
}

interface Props {
  mode: BatchPanelMode
  count: number
  currentStage: MaintenanceStage
  allCards: EquipmentCard[]
  vendors: MaintenanceVendor[]
  /** 「改共用欄位」可用的欄位（依勾選規則的區塊判斷，可能為空） */
  fieldOptions: BatchFieldKey[]
  onCancel: () => void
  /** 送出批次動作；回傳 true 代表成功（父層會關閉面板），false 則保持開啟讓使用者重試或調整 */
  onApply: (action: 'move_stage' | 'link' | 'unlink' | 'set_vendor' | 'set_fields', payload: Record<string, unknown>) => Promise<boolean>
}

const FIELD_INPUT = 'w-full border border-[#e8ddd0] rounded-lg px-2.5 py-1.5 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50'
const VENDOR_CLEAR = '__clear__'
const SUB_AUTO = ''
const FIELD_LABEL: Record<BatchFieldKey, string> = { warranty: '保固期間', age: '年限', basis: '年限起算依據' }

// 批次操作面板：改區塊、掛載／移除料號、改廠商、改共用欄位（保固期間／年限／年限起算依據）。
// 比照規則編輯面板，為清單上方展開的行內面板（不用 Dialog）。
export default function BatchPanel({ mode, count, currentStage, allCards, vendors, fieldOptions, onCancel, onApply }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 改區塊
  const stageChoices = SELECTABLE_STAGES.filter(s => s !== currentStage)
  const [targetStage, setTargetStage] = useState<MaintenanceStage>(stageChoices[0] ?? '回廠')
  const [targetSub, setTargetSub] = useState(SUB_AUTO)

  // 掛載／移除料號
  const [linkMode, setLinkMode] = useState<'add' | 'del'>('add')
  const [pickedIds, setPickedIds] = useState<string[]>([])
  const idToCard = useMemo(() => new Map(allCards.map(c => [c.equipment_id, c])), [allCards])

  // 改廠商
  const [vendorChoice, setVendorChoice] = useState<string | null>(null)

  // 改共用欄位
  const [fieldChoice, setField] = useState<BatchFieldKey>('warranty')
  // 勾選變動可能讓原本選的欄位不再適用，回退到第一個可用欄位
  const field: BatchFieldKey = fieldOptions.includes(fieldChoice) ? fieldChoice : (fieldOptions[0] ?? 'warranty')
  const [periodValue, setPeriodValue] = useState('')
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>('month')
  const [basisText, setBasisText] = useState('')

  const subChoices = STAGE_SUBCATEGORIES[targetStage]

  function changeTargetStage(v: string) {
    setTargetStage(v as MaintenanceStage)
    setTargetSub(SUB_AUTO)
  }

  async function submit(action: Parameters<Props['onApply']>[0], payload: Record<string, unknown>) {
    setBusy(true)
    setError(null)
    try {
      const ok = await onApply(action, payload)
      if (!ok) setError('操作失敗，詳見上方提示')
    } catch {
      setError('操作失敗，請重試')
    } finally {
      setBusy(false)
    }
  }

  async function handleApply() {
    setError(null)
    if (mode === 'stage') {
      const payload: Record<string, unknown> = { stage: targetStage }
      if (targetSub !== SUB_AUTO) payload.sub_category = targetSub
      await submit('move_stage', payload)
      return
    }
    if (mode === 'equipment') {
      if (pickedIds.length === 0) { setError('請先選擇料號'); return }
      await submit(linkMode === 'add' ? 'link' : 'unlink', { equipment_ids: pickedIds })
      return
    }
    if (mode === 'vendor') {
      if (vendorChoice === null) { setError('請先選擇廠商'); return }
      await submit('set_vendor', { vendor_id: vendorChoice === VENDOR_CLEAR ? null : vendorChoice })
      return
    }
    // fields
    if (fieldOptions.length === 0) { setError('勾選的規則沒有共同適用的欄位'); return }
    if (field === 'basis') {
      const text = basisText.trim()
      if (!text) { setError('請輸入起算依據'); return }
      if (text.length > MAX_AGE_LIMIT_BASIS_LENGTH) { setError(`起算依據不可超過 ${MAX_AGE_LIMIT_BASIS_LENGTH} 字`); return }
      await submit('set_fields', { age_limit_basis: text })
      return
    }
    const label = field === 'warranty' ? '保固期間' : '年限'
    if (!periodValue.trim()) { setError(`請輸入${label}`); return }
    const r = displayToMonths(periodValue, periodUnit, label)
    if (r.error || r.months === null) { setError(r.error ?? `請輸入${label}`); return }
    await submit('set_fields', { [field === 'warranty' ? 'warranty_period_months' : 'age_limit_months']: r.months })
  }

  const labelCls = 'text-xs text-[#a08060]'

  return (
    <div className="p-3.5 bg-[#fff9f4] border-b border-[rgba(122,82,48,.15)]">
      <b className="font-medium text-sm text-[#7a5230]">{BATCH_PANEL_TITLE[mode]}（已選 {count} 筆）</b>

      <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-2.5 gap-y-2.5 items-center mt-2.5">
        {mode === 'stage' && (
          <>
            <span className={labelCls}>移到區塊</span>
            <ThemedSelect
              value={targetStage}
              options={stageChoices.map(s => ({ value: s, label: s }))}
              onChange={changeTargetStage}
              disabled={busy}
              ariaLabel="移到區塊"
            />
            {subChoices.length > 1 && (
              <>
                <span className={labelCls}>子類</span>
                <ThemedSelect
                  value={targetSub}
                  options={[{ value: SUB_AUTO, label: '（沿用或自動判斷）' }, ...subChoices.map(s => ({ value: s, label: s }))]}
                  onChange={setTargetSub}
                  disabled={busy}
                  ariaLabel="子類"
                />
              </>
            )}
          </>
        )}

        {mode === 'equipment' && (
          <>
            <span className={labelCls}>動作</span>
            <ThemedSelect
              value={linkMode}
              options={[{ value: 'add', label: '掛載' }, { value: 'del', label: '移除' }]}
              onChange={v => setLinkMode(v as 'add' | 'del')}
              disabled={busy}
              ariaLabel="動作"
            />
            <span className={`${labelCls} self-start pt-1`}>料號</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {pickedIds.map(id => (
                <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)] max-w-full">
                  <span className="truncate">{id} {idToCard.get(id)?.name ?? ''}</span>
                  <button
                    type="button"
                    onClick={() => setPickedIds(prev => prev.filter(i => i !== id))}
                    disabled={busy}
                    title="移除此料號"
                    aria-label={`移除料號 ${id}`}
                    className="hover:text-[#b5451b] flex-shrink-0"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <EquipmentQuickPick
                allCards={allCards}
                excludeIds={pickedIds}
                disabled={busy}
                triggerVariant="icon"
                onPickMany={ids => setPickedIds(prev => [...prev, ...ids.filter(i => !prev.includes(i))])}
              />
            </div>
          </>
        )}

        {mode === 'vendor' && (
          <>
            <span className={labelCls}>廠商</span>
            <ThemedSelect
              value={vendorChoice ?? ''}
              placeholder="請選擇廠商"
              options={[
                { value: VENDOR_CLEAR, label: '（清除廠商）' },
                ...vendors.map(v => ({ value: v.id, label: v.vendor_code ? `${v.name}（${v.vendor_code}）` : v.name })),
              ]}
              onChange={setVendorChoice}
              disabled={busy}
              ariaLabel="廠商"
            />
          </>
        )}

        {mode === 'fields' && (
          <>
            <span className={labelCls}>欄位</span>
            <ThemedSelect
              value={field}
              options={fieldOptions.map(k => ({ value: k, label: FIELD_LABEL[k] }))}
              onChange={v => { setField(v as BatchFieldKey); setError(null) }}
              disabled={busy}
              ariaLabel="欄位"
            />
            <span className={labelCls}>新值</span>
            {field === 'basis' ? (
              <input
                value={basisText}
                onChange={e => setBasisText(e.target.value)}
                disabled={busy}
                maxLength={MAX_AGE_LIMIT_BASIS_LENGTH}
                placeholder="例如 進貨日"
                aria-label="起算依據"
                className={FIELD_INPUT}
              />
            ) : (
              <PeriodInput
                value={periodValue}
                unit={periodUnit}
                onChange={(v, u) => { setPeriodValue(v); setPeriodUnit(u) }}
                disabled={busy}
                placeholder="例如 12（月）"
                ariaLabel={field === 'warranty' ? '保固期間' : '年限'}
              />
            )}
          </>
        )}
      </div>

      {error && <p className="mt-2.5 text-xs text-[#b5451b]" role="alert">{error}</p>}

      <div className="mt-3 flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleApply}
          disabled={busy || (mode === 'fields' && fieldOptions.length === 0)}
          title={`套用到 ${count} 筆`}
          aria-label={`套用到 ${count} 筆`}
          className="inline-flex items-center justify-center gap-1 p-1.5 px-2.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          <span>{count}</span>
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          title="取消"
          aria-label="取消"
          className="inline-flex items-center justify-center p-1.5 px-2.5 text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-40 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
