'use client'

import { useState, useRef, useEffect } from 'react'
import { CheckCircle2, Pencil, Trash2, Loader2 } from 'lucide-react'
import { MaintenanceRule, MaintenanceVendor } from '@/types/maintenance'
import { formatWarrantyPeriod, fmtDateTime, emailPrefix } from '@/lib/maintenanceFormat'

interface Props {
  rule: MaintenanceRule
  vendor: MaintenanceVendor | undefined
  canManage: boolean
  selected: boolean
  /** 搜尋時，這筆是否為命中的專屬規則 */
  highlight: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onConfirmLatest: () => Promise<void>
}

const PILL = 'inline-block text-[11px] leading-[1.5] px-2 rounded-full whitespace-nowrap max-w-full truncate align-middle'
const PILL_TAG = `${PILL} bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]`
const PILL_GRAY = `${PILL} bg-[#f2ebe0] text-[#a08060]`
const PILL_EXIT = `${PILL} text-[#7a5230] border border-[rgba(122,82,48,.3)]`

const ICON_BTN = 'inline-flex items-center justify-center p-1 text-[#a08060] hover:text-[#7a5230] transition-colors rounded disabled:opacity-40'

// 單筆規則列：標題＋內容、標籤列（料號／通用／去向／年限／期間／廠商）、最後確認時間、
// 確認狀態、圖示按鈕（編輯／標示已確認最新／刪除）。
export default function RuleRow({
  rule, vendor, canManage, selected, highlight, onToggleSelect, onEdit, onDelete, onConfirmLatest,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const [vendorOpen, setVendorOpen] = useState(false)
  const [alignRight, setAlignRight] = useState(false)
  const vendorWrapRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!vendorOpen) return
    function onDown(e: MouseEvent) {
      if (vendorWrapRef.current && !vendorWrapRef.current.contains(e.target as Node)) setVendorOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [vendorOpen])

  async function handleConfirm() {
    setConfirming(true)
    try {
      await onConfirmLatest()
    } finally {
      setConfirming(false)
    }
  }

  const equipments = rule.equipment_ids ?? []
  const ageText = formatWarrantyPeriod(rule.age_limit_months)
  const warrantyText = formatWarrantyPeriod(rule.warranty_period_months)

  // 「最後確認」取 last_updated_at 與 confirmed_at 較新者（與後端過時判斷同一基準）
  const updatedTime = rule.last_updated_at ? new Date(rule.last_updated_at).getTime() : 0
  const confirmedTime = rule.confirmed_at ? new Date(rule.confirmed_at).getTime() : 0
  const useConfirmed = confirmedTime > updatedTime
  const lastIso = useConfirmed ? rule.confirmed_at : rule.last_updated_at
  const lastBy = emailPrefix(useConfirmed ? rule.confirmed_by : rule.last_updated_by)

  const vendorName = rule.vendor_name ?? vendor?.name ?? null

  return (
    <div className={`flex items-start gap-2.5 px-3.5 py-[11px] border-t border-[rgba(122,82,48,.1)] ${highlight ? 'bg-[rgba(196,154,114,.07)]' : ''}`}>
      {canManage && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`選取「${rule.item}」`}
          className="mt-1 accent-[#7a5230]"
        />
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[13px] leading-[1.55] text-[#2c1e12] whitespace-pre-wrap break-words">
          <b className="font-medium">{rule.item}</b>
          {rule.content ? `　${rule.content}` : ''}
        </p>

        <div className="mt-[5px] flex flex-wrap items-center gap-1 leading-[1.55]">
          {equipments.length > 0 ? (
            <>
              {equipments.slice(0, 2).map(e => (
                <span key={e.equipment_id} className={PILL_TAG} title={`${e.equipment_id} ${e.name}`}>{e.equipment_id} {e.name}</span>
              ))}
              {equipments.length > 2 && (
                <span
                  className={PILL_GRAY}
                  title={equipments.slice(2).map(e => `${e.equipment_id} ${e.name}`).join('\n')}
                >+{equipments.length - 2}</span>
              )}
            </>
          ) : (
            <span className={PILL_GRAY}>通用</span>
          )}
          {rule.exit_option && <span className={PILL_EXIT}>→ {rule.exit_option}</span>}
          {ageText && <span className={PILL_GRAY}>{ageText}・自 {rule.age_limit_basis || '進貨日'} 起算</span>}
          {warrantyText && <span className={PILL_GRAY} title="保固期間">保固 {warrantyText}</span>}
          {rule.warranty_start_date && <span className={PILL_GRAY}>{rule.warranty_start_date} 後到貨適用</span>}
          {vendorName && (
            <span ref={vendorWrapRef} className="relative inline-block">
              <button
                type="button"
                onClick={() => {
                  // 小卡寬 240px；靠右的廠商標籤改成右對齊，避免手機寬度超出視窗右緣造成橫向捲動
                  const rect = vendorWrapRef.current?.getBoundingClientRect()
                  setAlignRight(!!rect && rect.left + 240 > window.innerWidth - 8)
                  setVendorOpen(v => !v)
                }}
                title="查看廠商基本資料"
                aria-label={`查看廠商「${vendorName}」基本資料`}
                className={`${PILL_GRAY} hover:text-[#7a5230] cursor-pointer`}
              >
                {vendorName}
              </button>
              {vendorOpen && (
                <div className={`absolute z-20 ${alignRight ? 'right-0' : 'left-0'} top-full mt-1 w-60 p-2.5 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-[10px] shadow-[0_8px_30px_rgba(122,82,48,.18)] text-xs text-[#4a3422] space-y-1`}>
                  <p className="font-medium text-[#7a5230]">{vendorName}</p>
                  {vendor ? (
                    <>
                      {vendor.vendor_code && <p>代號：{vendor.vendor_code}</p>}
                      <p>地址：{vendor.address || '—'}</p>
                      <p>聯絡人：{vendor.contact_name || '—'}</p>
                      <p>電話：{vendor.contact_phone || '—'}</p>
                    </>
                  ) : (
                    <p className="text-[#a08060]">找不到廠商基本資料</p>
                  )}
                </div>
              )}
            </span>
          )}
        </div>

        <p className="mt-[3px] flex items-center gap-0.5 text-xs text-[#a08060]">
          <span className="truncate">
            最後確認 {fmtDateTime(lastIso)}{lastBy ? `（${lastBy}）` : ''}
          </span>
          <span className="flex-1" />
          {canManage && (
            <>
              <button type="button" onClick={onEdit} title="編輯規則" aria-label="編輯規則" className={ICON_BTN}>
                <Pencil className="h-[15px] w-[15px]" />
              </button>
              <button type="button" onClick={handleConfirm} disabled={confirming} title="標示已確認最新" aria-label="標示已確認最新" className={ICON_BTN}>
                {confirming ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <CheckCircle2 className="h-[15px] w-[15px]" />}
              </button>
              <button type="button" onClick={onDelete} title="刪除規則" aria-label="刪除規則" className={`${ICON_BTN} hover:!text-[#b5451b]`}>
                <Trash2 className="h-[15px] w-[15px]" />
              </button>
            </>
          )}
        </p>
      </div>

      {rule.needs_review ? (
        <span className={`${PILL} bg-[#fdf0d5] text-[#8a5a12] flex-shrink-0`}>建議覆核</span>
      ) : (
        <span className={`${PILL} bg-[#eaf0df] text-[#4a6b2e] flex-shrink-0`}>已確認</span>
      )}
    </div>
  )
}
