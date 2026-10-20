'use client'

import { Fragment, type ReactNode } from 'react'
import {
  CheckCheck, CheckCircle2, ArrowLeftRight, Tags, Store, SlidersHorizontal, Trash2, X,
} from 'lucide-react'
import { MaintenanceRule, MaintenanceVendor, MaintenanceStage } from '@/types/maintenance'
import type { RichImage } from '@/components/tracker/richContentTypes'
import { STAGE_SUBCATEGORIES } from '@/lib/maintenanceFormat'
import RuleRow from '@/components/maintenance/RuleRow'

export type BatchAction = 'confirm' | 'stage' | 'equipment' | 'vendor' | 'fields' | 'delete'

interface Props {
  stage: MaintenanceStage
  /** 已套用搜尋、並排序（專屬在前、通用在後）的規則 */
  rules: MaintenanceRule[]
  vendorsById: Map<string, MaintenanceVendor>
  highlightIds: Set<string>
  canManage: boolean
  selected: Set<string>
  selectedCount: number
  searching: boolean
  /** 搜尋字串（已 trim），傳給規則列做標籤反色與文字標示 */
  searchQuery: string
  /** 勾選的規則是否有共同適用的「共用欄位」（沒有則停用該批次圖示） */
  fieldsAvailable: boolean
  /** 批次面板（顯示在批次工具列下方、清單上方） */
  panels: ReactNode
  /** 正在編輯的規則 id；'new'＝新增；null＝沒有在編輯（其餘規則在編輯時變淡且不可點） */
  editingId: string | 'new' | null
  /** 編輯表單（含未儲存提示條）；原地顯示在被編輯規則的位置，新增時顯示在清單最上方 */
  editSlot: ReactNode
  onToggle: (id: string) => void
  onImageClick: (images: RichImage[], index: number) => void
  onSelectAll: () => void
  onClearSelection: () => void
  onBatchAction: (action: BatchAction) => void
  onEdit: (rule: MaintenanceRule) => void
  onDelete: (rule: MaintenanceRule) => void
  onConfirmLatest: (rule: MaintenanceRule) => Promise<void>
}

const BAR_ACTIONS: { action: BatchAction; title: string; Icon: typeof CheckCircle2; danger?: boolean }[] = [
  { action: 'confirm', title: '標示已確認最新', Icon: CheckCircle2 },
  { action: 'stage', title: '修改所屬區塊', Icon: ArrowLeftRight },
  { action: 'equipment', title: '掛載或移除料號', Icon: Tags },
  { action: 'vendor', title: '修改廠商', Icon: Store },
  { action: 'fields', title: '修改共用欄位', Icon: SlidersHorizontal },
  { action: 'delete', title: '批次刪除', Icon: Trash2, danger: true },
]

const BAR_BTN = 'inline-flex items-center justify-center p-1 text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.07)] rounded transition-colors'

function emptyMessage(stage: MaintenanceStage, searching: boolean): ReactNode {
  if (searching) return '這個區塊沒有適用的規則'
  if (stage === '報廢') {
    return (
      <>
        報廢的規則之後再新增
        <br />
        <span className="text-xs">入口：超過年限、廠商過保或無法維修、維修成本過高</span>
      </>
    )
  }
  if (stage === '待歸類') return '沒有待歸類的規則'
  return '這個區塊還沒有規則'
}

// 選中區塊的規則清單：依子類分組（標題列）、批次勾選與批次工具列、空狀態。
export default function RuleListPanel({
  stage, rules, vendorsById, highlightIds, canManage, selected, selectedCount, searching, searchQuery, fieldsAvailable, panels,
  editingId, editSlot, onToggle, onImageClick, onSelectAll, onClearSelection, onBatchAction, onEdit, onDelete, onConfirmLatest,
}: Props) {
  // 依子類分組：照 STAGE_SUBCATEGORIES 的順序，未指定／未知子類排最後
  const order = STAGE_SUBCATEGORIES[stage]
  const groups: { key: string; title: string | null; rules: MaintenanceRule[] }[] = []
  for (const r of rules) {
    const sub = r.sub_category && order.includes(r.sub_category) ? r.sub_category : (r.sub_category ?? '')
    let g = groups.find(x => x.key === sub)
    if (!g) {
      g = { key: sub, title: sub || (stage === '待歸類' ? null : '未指定子類'), rules: [] }
      groups.push(g)
    }
    g.rules.push(r)
  }
  const rank = (key: string) => {
    const i = order.indexOf(key)
    return i === -1 ? order.length : i
  }
  groups.sort((a, b) => rank(a.key) - rank(b.key))

  const showSlotOnTop = !!editSlot && editingId !== null && (editingId === 'new' || !rules.some(r => r.id === editingId))

  return (
    <div className="bg-[#fffdf9] border border-[rgba(122,82,48,.15)] rounded-[14px] [&>:first-child]:rounded-t-[14px] [&>:last-child]:rounded-b-[14px]">
      {canManage && selectedCount > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-3.5 py-[9px] bg-[rgba(122,82,48,.1)] text-[#7a5230]">
          <span className="text-xs font-medium">已選 {selectedCount} 筆</span>
          <button type="button" onClick={onSelectAll} title="本區塊全選" aria-label="本區塊全選" className={BAR_BTN}>
            <CheckCheck className="h-4 w-4" />
          </button>
          <button type="button" onClick={onClearSelection} title="取消選取" aria-label="取消選取" className={BAR_BTN}>
            <X className="h-4 w-4" />
          </button>
          <span className="flex-1" />
          {BAR_ACTIONS.map(({ action, title, Icon, danger }) => {
            const disabled = action === 'fields' && !fieldsAvailable
            const tip = disabled ? '勾選的規則沒有共同適用的欄位' : title
            return (
              <button
                key={action}
                type="button"
                onClick={() => onBatchAction(action)}
                disabled={disabled}
                title={tip}
                aria-label={tip}
                className={`${BAR_BTN} ${danger ? 'hover:!text-[#b5451b]' : ''} disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
              >
                <Icon className="h-4 w-4" />
              </button>
            )
          })}
        </div>
      )}

      {panels}

      {/* 新增（或編輯的規則不在目前清單內）時，編輯表單顯示在清單最上方 */}
      {showSlotOnTop && editSlot}

      <div>
        {rules.length === 0 ? (
          !showSlotOnTop && <div className="px-3.5 py-7 text-center text-sm text-[#a08060]">{emptyMessage(stage, searching)}</div>
        ) : groups.map(g => (
          <div key={g.key || '__none__'}>
            {g.title && (
              <div className="px-3.5 py-[7px] text-xs font-medium text-[#7a5230] bg-[#f6efe4] border-t border-[rgba(122,82,48,.1)]">
                {g.title}
                {stage === '回廠' && g.key === '特殊情境' && (
                  <span className="ml-3 font-normal text-[#a08060]">可自行新增情境</span>
                )}
              </div>
            )}
            {g.rules.map(r => {
              const isEditing = editingId === r.id
              return (
                <Fragment key={r.id}>
                  {/* 原地編輯：編輯表單取代該列的位置；該列保持掛載但隱藏，保留展開狀態 */}
                  {isEditing && editSlot}
                  {/* 編輯中其他列：變淡、不可點，並以 inert 一併擋掉鍵盤聚焦（React 18 型別尚無 inert，用 spread 帶入） */}
                  <div
                    className={isEditing ? 'hidden' : editingId ? 'opacity-50 pointer-events-none transition-opacity' : undefined}
                    {...(editingId && !isEditing ? ({ inert: '' } as object) : {})}
                  >
                    <RuleRow
                      rule={r}
                      vendor={r.vendor_id ? vendorsById.get(r.vendor_id) : undefined}
                      canManage={canManage}
                      selected={selected.has(r.id)}
                      highlight={highlightIds.has(r.id)}
                      searchQuery={searchQuery}
                      onToggleSelect={() => onToggle(r.id)}
                      onImageClick={onImageClick}
                      onEdit={() => onEdit(r)}
                      onDelete={() => onDelete(r)}
                      onConfirmLatest={() => onConfirmLatest(r)}
                    />
                  </div>
                </Fragment>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
