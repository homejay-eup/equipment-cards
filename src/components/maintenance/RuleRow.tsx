'use client'

import { useState, useRef, useEffect, type MouseEvent as ReactMouseEvent } from 'react'
import { CheckCircle2, Pencil, Trash2, Loader2, ChevronRight } from 'lucide-react'
import { MaintenanceRule, MaintenanceVendor } from '@/types/maintenance'
import {
  formatWarrantyPeriod, fmtDateTime, emailPrefix, equipmentChipHit, ruleTableHit, contentHiddenHit,
} from '@/lib/maintenanceFormat'
import type { RichImage } from '@/components/tracker/richContentTypes'
import RuleContent, { HighlightText } from '@/components/maintenance/RuleContent'

interface Props {
  rule: MaintenanceRule
  vendor: MaintenanceVendor | undefined
  canManage: boolean
  selected: boolean
  /** 搜尋時，這筆是否為命中的專屬規則 */
  highlight: boolean
  /** 搜尋字串（已 trim；空字串＝沒有搜尋），用於標籤反色與文字標示 */
  searchQuery: string
  onToggleSelect: () => void
  onImageClick: (images: RichImage[], index: number) => void
  onEdit: () => void
  onDelete: () => void
  onConfirmLatest: () => Promise<void>
}

const PILL = 'inline-block text-[11px] leading-[1.5] px-2 rounded-full whitespace-nowrap max-w-full truncate align-middle'
const PILL_TAG = `${PILL} bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]`
const PILL_GRAY = `${PILL} bg-[#f2ebe0] text-[#a08060]`
const PILL_EXIT = `${PILL} text-[#7a5230] border border-[rgba(122,82,48,.3)]`
const PILL_NO_EXIT = `${PILL} text-[#b5451b] border border-dashed border-[rgba(181,69,27,.4)]`
// 搜尋命中的標籤：棕底白字反色
const PILL_HIT = `${PILL} bg-[#7a5230] text-white border border-[#7a5230]`

const ICON_BTN = 'inline-flex items-center justify-center p-1 text-[#a08060] hover:text-[#7a5230] transition-colors rounded disabled:opacity-40'

// 單筆規則列（Step 50 新版型）：標題獨立一行（右側為圖示按鈕與確認狀態）、內容（RuleContent）、
// 標籤列（去向｜料號，再依區塊補年限／保固／廠商）、最後確認時間。
export default function RuleRow({
  rule, vendor, canManage, selected, highlight, searchQuery, onToggleSelect, onImageClick, onEdit, onDelete, onConfirmLatest,
}: Props) {
  const [confirming, setConfirming] = useState(false)
  const [expanded, setExpanded] = useState(false)
  // 搜尋自動展開：只在「搜尋字串／命中型態」改變時判斷一次；這個展開是否由搜尋觸發（清除搜尋時只還原自動展開的）
  const autoKeyRef = useRef('')
  const autoExpandedRef = useRef(false)
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
  const images = rule.content_image_urls ?? []
  const ql = searchQuery.trim().toLowerCase()

  // 屬性標籤依區塊顯示：年限／起算依據＝檢測／年限判斷；保固／適用進貨日／廠商＝送修；去向＝回廠
  const showAge = rule.stage === '檢測' && rule.sub_category === '年限判斷'
  const showRepair = rule.stage === '送修'
  const showExit = rule.stage === '回廠'
  const ageText = showAge ? formatWarrantyPeriod(rule.age_limit_months) : null
  const warrantyText = showRepair ? formatWarrantyPeriod(rule.warranty_period_months) : null

  // 料號標籤：命中者一定顯示並排最前，其餘補到最多 2 個，剩下收成「+N」
  const hitEquipments = equipments.filter(e => equipmentChipHit(e, ql))
  const restEquipments = equipments.filter(e => !equipmentChipHit(e, ql))
  const shownEquipments = [...hitEquipments, ...restEquipments.slice(0, Math.max(0, 2 - hitEquipments.length))]
  const hiddenEquipments = equipments.filter(e => !shownEquipments.includes(e))

  // 「最後確認」取 last_updated_at 與 confirmed_at 較新者（與後端過時判斷同一基準）
  const updatedTime = rule.last_updated_at ? new Date(rule.last_updated_at).getTime() : 0
  const confirmedTime = rule.confirmed_at ? new Date(rule.confirmed_at).getTime() : 0
  const useConfirmed = confirmedTime > updatedTime
  const lastIso = useConfirmed ? rule.confirmed_at : rule.last_updated_at
  const lastBy = emailPrefix(useConfirmed ? rule.confirmed_by : rule.last_updated_by)

  const vendorName = showRepair ? (rule.vendor_name ?? vendor?.name ?? null) : null
  const vendorHit = !!ql && !!vendorName && vendorName.toLowerCase().includes(ql)

  const tableRows = rule.content_table_data?.rows?.length ?? 0

  // 搜尋命中落在收合時被隱藏的位置（內文第一行之外、表格儲存格）→ 預設展開
  const hiddenHit = !!ql && (ruleTableHit(rule, ql) || contentHiddenHit(rule.content ?? '', ql))
  useEffect(() => {
    if (!ql) {
      autoKeyRef.current = ''
      if (autoExpandedRef.current) { autoExpandedRef.current = false; setExpanded(false) }
      return
    }
    const key = `${ql}|${hiddenHit}`
    if (autoKeyRef.current === key) return
    autoKeyRef.current = key
    if (hiddenHit) { autoExpandedRef.current = true; setExpanded(true) }
  }, [ql, hiddenHit])

  function toggleExpanded() {
    autoExpandedRef.current = false
    setExpanded(v => !v)
  }

  // 整列點擊展開／收合；點在互動元素（按鈕、勾選框、連結、廠商標籤與小卡）或正在選取文字時不觸發
  function handleRowClick(e: ReactMouseEvent<HTMLDivElement>) {
    const el = e.target as HTMLElement
    if (el.closest('button, input, a, label, [data-no-toggle]')) return
    if (typeof window !== 'undefined' && (window.getSelection()?.toString() ?? '') !== '') return
    toggleExpanded()
  }

  return (
    <div
      onClick={handleRowClick}
      className={`flex items-start gap-2.5 px-3.5 py-3 border-t border-[rgba(122,82,48,.1)] cursor-pointer hover:bg-[rgba(122,82,48,.03)] transition-colors ${highlight ? 'bg-[rgba(196,154,114,.07)]' : ''}`}
    >
      {canManage && (
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`選取「${rule.item}」`}
          className="mt-1 accent-[#7a5230]"
        />
      )}
      <button
        type="button"
        onClick={toggleExpanded}
        aria-expanded={expanded}
        aria-label={expanded ? `收合「${rule.item}」` : `展開「${rule.item}」`}
        title={expanded ? '收合' : '展開'}
        className="mt-[3px] flex-shrink-0 text-[#a08060] hover:text-[#7a5230] transition-colors"
      >
        <ChevronRight className={`h-3.5 w-3.5 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`} />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2">
          <p className="flex-1 min-w-0 m-0 text-sm font-medium leading-[1.4] text-[#2c1e12] break-words [overflow-wrap:anywhere]">
            <HighlightText text={rule.item} query={searchQuery} />
          </p>
          {canManage && (
            <span className="flex flex-shrink-0 items-center gap-0.5">
              <button type="button" onClick={onEdit} title="編輯規則" aria-label="編輯規則" className={ICON_BTN}>
                <Pencil className="h-[15px] w-[15px]" />
              </button>
              <button type="button" onClick={handleConfirm} disabled={confirming} title="標示已確認最新" aria-label="標示已確認最新" className={ICON_BTN}>
                {confirming ? <Loader2 className="h-[15px] w-[15px] animate-spin" /> : <CheckCircle2 className="h-[15px] w-[15px]" />}
              </button>
              <button type="button" onClick={onDelete} title="刪除規則" aria-label="刪除規則" className={`${ICON_BTN} hover:!text-[#b5451b]`}>
                <Trash2 className="h-[15px] w-[15px]" />
              </button>
            </span>
          )}
          {rule.needs_review ? (
            <span className={`${PILL} bg-[#fdf0d5] text-[#8a5a12] flex-shrink-0`}>建議覆核</span>
          ) : (
            <span className={`${PILL} bg-[#eaf0df] text-[#4a6b2e] flex-shrink-0`}>已確認</span>
          )}
        </div>

        <RuleContent
          content={rule.content ?? ''}
          images={images}
          table={rule.content_table_data ?? null}
          searchQuery={searchQuery}
          expanded={expanded}
          onImageClick={i => onImageClick(images, i)}
        />

        <div className="mt-2 flex flex-wrap items-center gap-1.5 leading-[1.5]">
          {showExit && (
            <>
              {rule.exit_option
                ? <span className={PILL_EXIT}>→ {rule.exit_option}</span>
                : <span className={PILL_NO_EXIT}>未設定去向</span>}
              <span className="inline-block h-3 w-px bg-[rgba(122,82,48,.25)]" aria-hidden="true" />
            </>
          )}
          {equipments.length > 0 ? (
            <>
              {shownEquipments.map(e => (
                <span
                  key={e.equipment_id}
                  className={equipmentChipHit(e, ql) ? PILL_HIT : PILL_TAG}
                  title={`${e.equipment_id} ${e.name}`}
                >{e.equipment_id} {e.name}</span>
              ))}
              {hiddenEquipments.length > 0 && (
                <span
                  className={PILL_GRAY}
                  title={hiddenEquipments.map(e => `${e.equipment_id} ${e.name}`).join('\n')}
                >+{hiddenEquipments.length}</span>
              )}
            </>
          ) : (
            <span className={PILL_GRAY}>通用</span>
          )}
          {ageText && <span className={PILL_GRAY}>{ageText}・自 {rule.age_limit_basis || '進貨日'} 起算</span>}
          {!expanded && images.length > 0 && <span className={PILL_GRAY}>含圖片 {images.length} 張</span>}
          {!expanded && tableRows > 0 && <span className={PILL_GRAY}>含表格 {tableRows} 列</span>}
          {warrantyText && <span className={PILL_GRAY} title="保固期間">保固 {warrantyText}</span>}
          {showRepair && rule.warranty_start_date && <span className={PILL_GRAY}>{rule.warranty_start_date} 後到貨適用</span>}
          {vendorName && (
            <span ref={vendorWrapRef} data-no-toggle className="relative inline-block max-w-full">
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
                className={`${vendorHit ? PILL_HIT : `${PILL_GRAY} hover:text-[#7a5230]`} cursor-pointer`}
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
                      <p>窗口：{vendor.contact_name || '—'}</p>
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

        {expanded && (
          <p className="mt-1.5 text-[11px] text-[#b3987a] truncate">
            最後確認 {fmtDateTime(lastIso)}{lastBy ? `　${lastBy}` : ''}
          </p>
        )}
      </div>
    </div>
  )
}
