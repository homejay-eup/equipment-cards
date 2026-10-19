'use client'

import { useState, useMemo } from 'react'
import { X, Check, Loader2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceRule, MaintenanceVendor, MaintenanceExitOption, MaintenanceStage } from '@/types/maintenance'
import {
  MAX_WARRANTY_PERIOD_MONTHS, MAX_AGE_LIMIT_BASIS_LENGTH, STAGE_SUBCATEGORIES,
  monthsToDisplay, displayToMonths, type PeriodUnit,
} from '@/lib/maintenanceFormat'
import EquipmentQuickPick from '@/components/documents/EquipmentQuickPick'
import DatePicker from '@/components/DatePicker'
import ThemedSelect from '@/components/maintenance/ThemedSelect'
import ExitOptionsManager from '@/components/maintenance/ExitOptionsManager'
import RichContentEditor from '@/components/tracker/RichContentEditor'
import type { PendingImage, TableData, RichImage } from '@/components/tracker/richContentTypes'
import { useUpdateAttachmentUpload } from '@/hooks/useUpdateAttachmentUpload'

/** 編輯面板送出的草稿（由 MaintenanceInfoClient 依區塊決定實際送哪些欄位給 API） */
export interface RuleDraft {
  stage: MaintenanceStage
  sub_category: string | null
  item: string
  content: string
  content_image_urls: RichImage[]
  content_table_data: TableData | null
  equipment_ids: string[]
  vendor_id: string | null
  warranty_period_months: number | null
  warranty_start_date: string | null
  age_limit_months: number | null
  age_limit_basis: string | null
  exit_option: string | null
}

export const SELECTABLE_STAGES: MaintenanceStage[] = ['回廠', '檢測', '送修', '報廢']

const FIELD_INPUT = 'w-full border border-[#e8ddd0] rounded-lg px-2.5 py-1.5 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50'

interface PeriodInputProps {
  value: string
  unit: PeriodUnit
  onChange: (value: string, unit: PeriodUnit) => void
  disabled?: boolean
  placeholder?: string
  ariaLabel: string
}

/** 「數字＋月／年」輸入（保固期間、年限共用），顯示端會自動換算（18 個月 → 1 年 6 個月） */
export function PeriodInput({ value, unit, onChange, disabled, placeholder, ariaLabel }: PeriodInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        max={unit === 'year' ? MAX_WARRANTY_PERIOD_MONTHS / 12 : MAX_WARRANTY_PERIOD_MONTHS}
        value={value}
        onChange={e => onChange(e.target.value, unit)}
        disabled={disabled}
        placeholder={placeholder ?? '數字，選填'}
        aria-label={ariaLabel}
        className={`flex-1 min-w-0 ${FIELD_INPUT}`}
      />
      <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs flex-shrink-0">
        {(['month', 'year'] as PeriodUnit[]).map(u => (
          <button
            key={u}
            type="button"
            onClick={() => onChange(value, u)}
            disabled={disabled}
            aria-pressed={unit === u}
            className={`px-2.5 py-1.5 transition-colors disabled:opacity-50 ${
              unit === u ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'
            }`}
          >
            {u === 'month' ? '月' : '年'}
          </button>
        ))}
      </div>
    </div>
  )
}

interface Props {
  mode: 'create' | 'edit'
  rule?: MaintenanceRule
  defaultStage: MaintenanceStage
  defaultEquipmentIds: string[]
  allCards: EquipmentCard[]
  vendors: MaintenanceVendor[]
  exitOptions: MaintenanceExitOption[]
  onExitOptionsSaved: (options: MaintenanceExitOption[] | null) => void
  onCancel: () => void
  /** 回傳錯誤訊息（顯示在面板底部）；成功回傳 null（由父層關閉面板） */
  onSave: (draft: RuleDraft) => Promise<string | null>
}

// 新增／編輯規則的行內面板（清單上方展開，不使用 Dialog，避開 portal 與 Radix 的 pointer-events 踩坑）。
// 欄位依區塊動態顯示：送修＝廠商＋保固期間＋適用進貨日期；檢測／年限判斷＝年限＋起算依據；回廠＝處理後去向。
export default function RuleEditPanel({
  mode, rule, defaultStage, defaultEquipmentIds, allCards, vendors, exitOptions, onExitOptionsSaved, onCancel, onSave,
}: Props) {
  const initialStage: MaintenanceStage = rule?.stage ?? defaultStage
  const [stage, setStage] = useState<MaintenanceStage>(initialStage)
  const [subCategory, setSubCategory] = useState<string | null>(
    rule ? (rule.sub_category ?? null) : (STAGE_SUBCATEGORIES[initialStage][0] ?? null),
  )
  const [item, setItem] = useState(rule?.item ?? '')
  const [content, setContent] = useState(rule?.content ?? '')
  const [images, setImages] = useState<PendingImage[]>(() =>
    (rule?.content_image_urls ?? []).map(img => ({ tempId: img.public_id, uploading: false, public_id: img.public_id, url: img.url })))
  const [table, setTable] = useState<TableData | null>(rule?.content_table_data ?? null)
  const { upload } = useUpdateAttachmentUpload('/api/maintenance/rules/content-signature')
  const [pickedIds, setPickedIds] = useState<string[]>(
    rule ? (rule.equipment_ids ?? []).map(e => e.equipment_id) : defaultEquipmentIds,
  )
  const [vendorId, setVendorId] = useState(rule?.vendor_id ?? '')
  const warrantyInit = monthsToDisplay(rule?.warranty_period_months)
  const [warrantyValue, setWarrantyValue] = useState(warrantyInit.value)
  const [warrantyUnit, setWarrantyUnit] = useState<PeriodUnit>(warrantyInit.unit)
  const [warrantyStart, setWarrantyStart] = useState(rule?.warranty_start_date ?? '')
  const ageInit = monthsToDisplay(rule?.age_limit_months)
  const [ageValue, setAgeValue] = useState(ageInit.value)
  const [ageUnit, setAgeUnit] = useState<PeriodUnit>(ageInit.unit)
  const [ageBasis, setAgeBasis] = useState(rule?.age_limit_basis ?? '')
  const [exitOption, setExitOption] = useState(
    rule ? (rule.exit_option ?? '') : (exitOptions[0]?.label ?? ''),
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const idToCard = useMemo(() => new Map(allCards.map(c => [c.equipment_id, c])), [allCards])
  const nameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of rule?.equipment_ids ?? []) m.set(e.equipment_id, e.name)
    return m
  }, [rule])

  const stageOptions = (stage === '待歸類' ? ['待歸類' as MaintenanceStage, ...SELECTABLE_STAGES] : SELECTABLE_STAGES)
    .map(s => ({ value: s, label: s }))
  const subOptions = STAGE_SUBCATEGORIES[stage].map(s => ({ value: s, label: s }))

  const vendorOptions = [
    { value: '', label: '（不指定廠商）' },
    ...vendors.map(v => ({ value: v.id, label: v.vendor_code ? `${v.name}（${v.vendor_code}）` : v.name })),
    // 規則掛的廠商若不在清單（例如剛被刪除），保留原值避免靜默清空
    ...(vendorId && !vendors.some(v => v.id === vendorId) ? [{ value: vendorId, label: rule?.vendor_name ?? '（未知廠商）' }] : []),
  ]

  // 去向選項被刪除後，既有規則仍保留原文字顯示
  const exitSelectOptions = [
    { value: '', label: '（未指定）' },
    ...exitOptions.map(o => ({ value: o.label, label: o.label })),
    ...(exitOption && !exitOptions.some(o => o.label === exitOption) ? [{ value: exitOption, label: `${exitOption}（已從選項移除）` }] : []),
  ]

  function changeStage(next: string) {
    const s = next as MaintenanceStage
    setStage(s)
    setSubCategory(STAGE_SUBCATEGORIES[s][0] ?? null)
    // 切到回廠時若尚未指定去向，預設第一個選項（比照新增時的預設）
    if (s === '回廠' && !exitOption && exitOptions[0]) setExitOption(exitOptions[0].label)
  }

  const showAge = stage === '檢測' && subCategory === '年限判斷'

  async function handleSave() {
    if (!item.trim()) { setError('請輸入標題'); return }
    if (images.some(p => p.uploading)) { setError('圖片仍在上傳中，請稍候'); return }
    if (images.some(p => !p.url)) { setError('有圖片上傳失敗，請先移除後再儲存'); return }
    const imageList: RichImage[] = images.filter(p => p.public_id && p.url).map(p => ({ public_id: p.public_id!, url: p.url! }))
    const tableRows = table?.rows?.length ?? 0
    if (!content.trim() && imageList.length === 0 && tableRows === 0) { setError('內容為必填（文字、圖片、表格至少一項）'); return }

    let warrantyMonths: number | null = null
    if (stage === '送修') {
      const r = displayToMonths(warrantyValue, warrantyUnit, '保固期間')
      if (r.error) { setError(r.error); return }
      warrantyMonths = r.months
    }
    let ageMonths: number | null = null
    if (showAge) {
      const r = displayToMonths(ageValue, ageUnit, '年限')
      if (r.error) { setError(r.error); return }
      ageMonths = r.months
      if (ageBasis.trim().length > MAX_AGE_LIMIT_BASIS_LENGTH) {
        setError(`年限起算依據不可超過 ${MAX_AGE_LIMIT_BASIS_LENGTH} 字`)
        return
      }
    }

    setSaving(true)
    setError(null)
    try {
      const err = await onSave({
        stage,
        sub_category: subCategory,
        item: item.trim(),
        content: content.trim(),
        content_image_urls: imageList,
        content_table_data: tableRows > 0 ? table : null,
        equipment_ids: pickedIds,
        vendor_id: vendorId || null,
        warranty_period_months: warrantyMonths,
        warranty_start_date: warrantyStart.trim() || null,
        age_limit_months: ageMonths,
        age_limit_basis: ageBasis.trim() || null,
        exit_option: exitOption || null,
      })
      if (err) setError(err)
    } catch {
      setError('儲存失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  const labelCls = 'text-xs text-[#a08060]'

  return (
    <div className="p-3.5 bg-[#fff9f4] border-b border-[rgba(122,82,48,.15)]">
      <b className="font-medium text-sm text-[#7a5230]">{mode === 'edit' ? '編輯規則' : '新增規則'}</b>

      <div className="grid grid-cols-[82px_minmax(0,1fr)] gap-x-2.5 gap-y-2.5 items-center mt-2.5">
        <span className={labelCls}>所屬區塊</span>
        <ThemedSelect value={stage} options={stageOptions} onChange={changeStage} disabled={saving} ariaLabel="所屬區塊" />

        {subOptions.length > 0 && (
          <>
            <span className={labelCls}>子類</span>
            <ThemedSelect value={subCategory ?? ''} options={subOptions} onChange={setSubCategory} disabled={saving} ariaLabel="子類" />
          </>
        )}

        <span className={labelCls}>標題</span>
        <input
          value={item}
          onChange={e => setItem(e.target.value)}
          disabled={saving}
          aria-label="標題"
          className={FIELD_INPUT}
        />

        <span className={`${labelCls} self-start pt-1.5`}>內容</span>
        <div className="min-w-0">
          <RichContentEditor
            content={content}
            onContentChange={setContent}
            images={images}
            onImagesChange={setImages}
            table={table}
            onTableChange={setTable}
            uploadImage={upload}
            placeholder="建議寫成：判斷：… / 處理：…；可 Ctrl+V 貼上截圖或 Excel 表格"
            rows={5}
            disabled={saving}
          />
        </div>

        <span className={`${labelCls} self-start pt-1`}>適用料號</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {pickedIds.length === 0 && <span className="text-xs text-[#a08060]">未選＝通用規則</span>}
          {pickedIds.map(id => {
            const name = idToCard.get(id)?.name ?? nameById.get(id) ?? ''
            return (
              <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)] max-w-full">
                <span className="truncate">{id} {name}</span>
                <button
                  type="button"
                  onClick={() => setPickedIds(prev => prev.filter(i => i !== id))}
                  disabled={saving}
                  title="移除此料號"
                  aria-label={`移除料號 ${id}`}
                  className="hover:text-[#b5451b] flex-shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )
          })}
          <EquipmentQuickPick
            allCards={allCards}
            excludeIds={pickedIds}
            disabled={saving}
            triggerVariant="icon"
            onPickMany={ids => setPickedIds(prev => [...prev, ...ids.filter(i => !prev.includes(i))])}
          />
        </div>

        {stage === '送修' && (
          <>
            <span className={labelCls}>廠商（選填）</span>
            <ThemedSelect value={vendorId} options={vendorOptions} onChange={setVendorId} disabled={saving} ariaLabel="廠商" />

            <span className={labelCls}>保固期間</span>
            <PeriodInput
              value={warrantyValue}
              unit={warrantyUnit}
              onChange={(v, u) => { setWarrantyValue(v); setWarrantyUnit(u) }}
              disabled={saving}
              ariaLabel="保固期間"
            />

            <span className={labelCls}>適用進貨日（起）</span>
            <div>
              <DatePicker value={warrantyStart} onChange={setWarrantyStart} disabled={saving} />
              <p className="text-[10px] text-[#a08060] mt-1">此日期（含）之後到貨的設備才適用，選填</p>
            </div>
          </>
        )}

        {showAge && (
          <>
            <span className={labelCls}>年限</span>
            <PeriodInput
              value={ageValue}
              unit={ageUnit}
              onChange={(v, u) => { setAgeValue(v); setAgeUnit(u) }}
              disabled={saving}
              placeholder="例如 5（年）"
              ariaLabel="年限"
            />

            <span className={labelCls}>起算依據</span>
            <input
              value={ageBasis}
              onChange={e => setAgeBasis(e.target.value)}
              disabled={saving}
              maxLength={MAX_AGE_LIMIT_BASIS_LENGTH}
              placeholder="預設為「進貨日」，可自行修改"
              aria-label="起算依據"
              className={FIELD_INPUT}
            />
          </>
        )}

        {stage === '回廠' && (
          <>
            <span className={labelCls}>處理後去向</span>
            <div className="flex items-center gap-1.5">
              <ThemedSelect value={exitOption} options={exitSelectOptions} onChange={setExitOption} disabled={saving} ariaLabel="處理後去向" />
              <ExitOptionsManager options={exitOptions} onSaved={onExitOptionsSaved} />
            </div>
          </>
        )}
      </div>

      {error && <p className="mt-2.5 text-xs text-[#b5451b]" role="alert">{error}</p>}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          title="儲存"
          aria-label="儲存"
          className="inline-flex items-center justify-center p-1.5 px-2.5 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          title="取消"
          aria-label="取消"
          className="inline-flex items-center justify-center p-1.5 px-2.5 text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-40 transition-colors"
        >
          <X className="h-4 w-4" />
        </button>
        <span className="text-xs text-[#a08060]">儲存會把「最後確認」重置為今天</span>
      </div>
    </div>
  )
}
