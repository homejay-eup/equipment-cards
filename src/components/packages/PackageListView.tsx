'use client'

import { useState } from 'react'
import {
  Folder, Trash2, AlertTriangle, Copy, ChevronRight, ChevronDown, GripVertical, ArrowLeftRight,
} from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import QuantityStepper from '@/components/QuantityStepper'
import EquipmentQuickPick from '@/components/documents/EquipmentQuickPick'
import { EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import { unlinkKey } from './unlinkKey'

type DisplayMode = 'list' | 'photo'

// 依套餐列表：展開/摺疊、重命名、複製、刪除、批次取消掛載、新增掛載、拖曳排序（套餐本身＋套餐內料卡）。
// 從 PackageExplorer.tsx 拆出（純呈現＋既有 callback 轉發，行為不變）。
export default function PackageListView({
  filteredPackages, allCards, cardMap, expanded, toggleExpand, busyIds, isShared, canEdit, canShare,
  selectedPackageIds, togglePackageSelect, duplicateGroups, alignmentBadge, sharedDeptLabel, display,
  renamingId, renameValue, setRenameValue, submitRename, startRename, setRenamingId,
  selectedUnlinkKeys, toggleUnlinkSelect, running,
  handleBatchUnlink, handleAddManyToPackage, onUpdateQuantity, onReplace,
  setDuplicateTarget, askDeleteSingle,
  canReorderPackages, draggingPackageId, dragOverPackageId,
  onPackageDragStart, onPackageDragEnd, onPackageDragOver, onPackageDragLeave, onPackageDrop,
  onReorderItems,
}: {
  filteredPackages: (EquipmentPackage | SharedEquipmentPackage)[]
  allCards: EquipmentCard[]
  cardMap: Map<string, EquipmentCard>
  expanded: Set<string>
  toggleExpand: (key: string) => void
  busyIds: Set<string>
  isShared: boolean
  canEdit: boolean
  canShare: boolean
  selectedPackageIds: Set<string>
  togglePackageSelect: (id: string) => void
  duplicateGroups: Map<string, string[]>
  alignmentBadge: (pkg: EquipmentPackage | SharedEquipmentPackage) => React.ReactNode
  sharedDeptLabel: (pkg: EquipmentPackage | SharedEquipmentPackage) => React.ReactNode
  display: DisplayMode
  renamingId: string | null
  renameValue: string
  setRenameValue: (v: string) => void
  submitRename: (packageId: string) => void
  startRename: (pkg: EquipmentPackage | SharedEquipmentPackage) => void
  setRenamingId: (id: string | null) => void
  selectedUnlinkKeys: Set<string>
  toggleUnlinkSelect: (packageId: string, equipmentId: string) => void
  running: boolean
  handleBatchUnlink: (targets: { packageId: string; equipmentId: string }[]) => void | Promise<void>
  handleAddManyToPackage: (packageId: string, equipmentIds: string[]) => void | Promise<void>
  onUpdateQuantity: (packageId: string, equipmentId: string, quantity: number) => void | Promise<void>
  // Step 37：跨套餐批次替換料卡，開啟 ReplacePackageItemDialog
  onReplace: (equipmentId: string, equipmentName: string) => void
  setDuplicateTarget: (pkg: EquipmentPackage | SharedEquipmentPackage) => void
  askDeleteSingle: (pkg: EquipmentPackage | SharedEquipmentPackage) => void
  // Step 36：套餐本身拖曳排序（只在無搜尋關鍵字、!isShared && canEdit 時才允許，由 PackageExplorer 算好傳入）
  canReorderPackages: boolean
  draggingPackageId: string | null
  dragOverPackageId: string | null
  onPackageDragStart: (id: string) => void
  onPackageDragEnd: () => void
  onPackageDragOver: (id: string) => void
  onPackageDragLeave: () => void
  onPackageDrop: (fromId: string, toId: string) => void
  // Step 36：套餐內料卡拖曳排序（清單模式才能拖，只允許同一個套餐內部重排）
  onReorderItems: (packageId: string, fromEquipmentId: string, toEquipmentId: string) => void
}) {
  // 套餐內料卡拖曳的暫存狀態：只在拖曳互動期間需要，不用往上層 PackageExplorer 傳，
  // 邏輯跟 GroupsPanel.tsx 的 draggingItem/dragOverItem 平行
  const [draggingItem, setDraggingItem] = useState<{ packageId: string; equipmentId: string } | null>(null)
  const [dragOverItem, setDragOverItem] = useState<{ packageId: string; equipmentId: string } | null>(null)

  if (filteredPackages.length === 0) {
    return <p className="text-xs text-[#a08060] py-6 text-center">沒有符合的套餐</p>
  }

  return (
    <div className="border border-[#e8ddd0] rounded-lg divide-y divide-[#f0e8dc]">
      {filteredPackages.map(pkg => {
        const isExpanded = expanded.has(pkg.id)
        const isBusy = busyIds.has(pkg.id)
        const duplicates = duplicateGroups.get(pkg.id)
        const sharedDept = (pkg as SharedEquipmentPackage).source_department_name
        const scopedUnlinkCount = pkg.package_items.filter(i => selectedUnlinkKeys.has(unlinkKey(pkg.id, i.equipment_id))).length
        const sortedItems = [...pkg.package_items].sort((a, b) => a.sort_order - b.sort_order)
        const equipmentCards = sortedItems
          .map(i => cardMap.get(i.equipment_id))
          .filter((c): c is EquipmentCard => !!c)

        const isDraggingThisPackage = draggingPackageId === pkg.id
        const isDragOverThisPackage = !isDraggingThisPackage && dragOverPackageId === pkg.id

        return (
          <div
            key={pkg.id}
            className={`${isBusy ? 'opacity-60' : ''} ${isDraggingThisPackage ? 'opacity-40' : ''} ${isDragOverThisPackage ? 'ring-2 ring-[#c49a72] ring-inset' : ''}`}
            onDragOver={canReorderPackages ? e => {
              e.preventDefault()
              if (draggingPackageId && draggingPackageId !== pkg.id) onPackageDragOver(pkg.id)
            } : undefined}
            onDragLeave={canReorderPackages ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) onPackageDragLeave() } : undefined}
            onDrop={canReorderPackages ? e => {
              e.preventDefault()
              if (draggingPackageId) onPackageDrop(draggingPackageId, pkg.id)
            } : undefined}
          >
            <div className="group/header flex items-center gap-2 px-3 py-2 text-xs">
              {canReorderPackages && (
                <span
                  draggable
                  onDragStart={e => { e.stopPropagation(); onPackageDragStart(pkg.id) }}
                  onDragEnd={onPackageDragEnd}
                  className="opacity-0 group-hover/header:opacity-100 transition-opacity cursor-grab text-[#c0a882] hover:text-[#a08060] flex-shrink-0"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </span>
              )}
              {!isShared && (canEdit || canShare) && (
                <input type="checkbox" checked={selectedPackageIds.has(pkg.id)}
                  onChange={() => togglePackageSelect(pkg.id)} className="accent-[#7a5230]" />
              )}
              <button type="button" onClick={() => toggleExpand(pkg.id)} className="text-[#a08060] hover:text-[#7a5230] transition-colors">
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
              <Folder className="h-3.5 w-3.5 text-[#c49a72] flex-shrink-0" />
              {renamingId === pkg.id ? (
                <input
                  autoFocus
                  value={renameValue}
                  onChange={e => setRenameValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') submitRename(pkg.id); if (e.key === 'Escape') setRenamingId(null) }}
                  onBlur={() => submitRename(pkg.id)}
                  className="flex-1 min-w-0 border border-[#c49a72] rounded px-1.5 py-0.5 text-xs bg-white focus:outline-none"
                />
              ) : (
                <button type="button" onClick={() => toggleExpand(pkg.id)} className="flex-1 min-w-0 flex items-center gap-1.5 text-left truncate">
                  <span className="font-medium text-[#4a3422] truncate">{pkg.name}</span>
                </button>
              )}
              {sharedDept && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)] flex-shrink-0">
                  來自：{sharedDept}
                </span>
              )}
              {!isShared && sharedDeptLabel(pkg)}
              {alignmentBadge(pkg)}
              {duplicates && duplicates.length > 0 && (
                <span title={`與「${duplicates.join('、')}」內容完全相同`}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(217,119,6,.1)] text-amber-600 border border-[rgba(217,119,6,.25)] flex-shrink-0">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  與「{duplicates[0]}」{duplicates.length > 1 ? `等 ${duplicates.length} 份` : ''}內容相同
                </span>
              )}
              <span className="text-[#a08060] flex-shrink-0">{pkg.package_items.length} 筆</span>
              {!isShared && canEdit && renamingId !== pkg.id && (
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button onClick={() => startRename(pkg)} title="重命名" className="p-1 text-[#a08060] hover:text-[#7a5230] transition-colors">
                    <span className="text-[10px]">改名</span>
                  </button>
                  <button onClick={() => setDuplicateTarget(pkg)} title="複製套餐" className="p-1 text-[#a08060] hover:text-[#7a5230] transition-colors">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => askDeleteSingle(pkg)} title="刪除套餐" className="p-1 text-[#a08060] hover:text-red-500 transition-colors">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>

            {isExpanded && (
              <div className="px-3 pb-3 pl-9 bg-[rgba(122,82,48,.03)]">
                {pkg.package_items.length === 0 ? (
                  <p className="text-xs text-[#a08060] py-1.5">此套餐尚無料卡</p>
                ) : display === 'photo' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 py-2">
                    {equipmentCards.map(card => {
                      // 照片模式改用跟清單模式對等的複選＋批次取消掛載（沿用同一份 selectedUnlinkKeys），
                      // 不再是單張單顆「－」立即移除，維持跟清單模式一致的操作方式
                      const k = unlinkKey(pkg.id, card.equipment_id)
                      return (
                        <EquipmentCardItem
                          key={card.equipment_id}
                          card={card}
                          onClick={() => {}}
                          isAdmin={false}
                          activeStatus={card.status}
                          selectMode={!isShared && canEdit}
                          isSelected={selectedUnlinkKeys.has(k)}
                          onSelect={() => toggleUnlinkSelect(pkg.id, card.equipment_id)}
                          quantity={pkg.package_items.find(i => i.equipment_id === card.equipment_id)?.quantity}
                        />
                      )
                    })}
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 py-1.5">
                    {sortedItems.map(item => {
                      const card = cardMap.get(item.equipment_id)
                      const k = unlinkKey(pkg.id, item.equipment_id)
                      const canDragItem = !isShared && canEdit
                      const isDraggingThisItem = draggingItem?.packageId === pkg.id && draggingItem.equipmentId === item.equipment_id
                      const isDragOverThisItem = !isDraggingThisItem && dragOverItem?.packageId === pkg.id && dragOverItem.equipmentId === item.equipment_id
                      return (
                        <label
                          key={item.equipment_id}
                          className={`group/item flex items-center justify-between gap-2 text-xs py-0.5 cursor-pointer ${isDraggingThisItem ? 'opacity-40' : ''} ${isDragOverThisItem ? 'ring-2 ring-[#c49a72] ring-inset' : ''}`}
                          onDragOver={canDragItem ? e => {
                            e.preventDefault()
                            if (draggingItem && draggingItem.packageId === pkg.id && draggingItem.equipmentId !== item.equipment_id) {
                              setDragOverItem({ packageId: pkg.id, equipmentId: item.equipment_id })
                            }
                          } : undefined}
                          onDragLeave={canDragItem ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverItem(null) } : undefined}
                          onDrop={canDragItem ? e => {
                            e.preventDefault()
                            if (draggingItem && draggingItem.packageId === pkg.id) {
                              onReorderItems(pkg.id, draggingItem.equipmentId, item.equipment_id)
                            }
                            setDragOverItem(null)
                          } : undefined}
                        >
                          <span className="flex items-center gap-1.5 min-w-0">
                            {canDragItem && (
                              <span
                                draggable
                                onDragStart={e => { e.stopPropagation(); setDraggingItem({ packageId: pkg.id, equipmentId: item.equipment_id }) }}
                                onDragEnd={() => { setDraggingItem(null); setDragOverItem(null) }}
                                className="opacity-0 group-hover/item:opacity-100 transition-opacity cursor-grab text-[#c0a882] hover:text-[#a08060] flex-shrink-0"
                              >
                                <GripVertical className="h-3.5 w-3.5" />
                              </span>
                            )}
                            <span className="text-[#4a3422] truncate">{item.equipment_id} {card?.name ?? '（找不到此料卡）'}</span>
                          </span>
                          <span className="flex items-center gap-3 flex-shrink-0">
                            {!isShared && canEdit ? (
                              <QuantityStepper
                                value={item.quantity ?? 1}
                                onChange={v => onUpdateQuantity(pkg.id, item.equipment_id, v)}
                                disabled={isBusy}
                              />
                            ) : (
                              (item.quantity ?? 1) !== 1 && (
                                <span className="text-[#a08060]">×{item.quantity}</span>
                              )
                            )}
                            {!isShared && canEdit && (
                              // ⚠️ 整列是 <label>（尾端綁定取消掛載 checkbox），點擊按鈕務必 stopPropagation，
                              // 避免點擊冒泡到 <label> 觸發瀏覽器預設行為誤切換 checkbox（比照 QuantityStepper.tsx 的防呆模式）
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); onReplace(item.equipment_id, card?.name ?? item.equipment_id) }}
                                disabled={isBusy}
                                title="替換料卡"
                                className="p-1 text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors"
                              >
                                <ArrowLeftRight className="h-3.5 w-3.5" />
                              </button>
                            )}
                            {!isShared && canEdit && (
                              <span className="flex items-center gap-1.5 text-[#a08060]">
                                取消掛載
                                <input type="checkbox" checked={selectedUnlinkKeys.has(k)}
                                  onChange={() => toggleUnlinkSelect(pkg.id, item.equipment_id)}
                                  disabled={isBusy} className="accent-[#b5451b]" />
                              </span>
                            )}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
                {!isShared && canEdit && (
                  <div className="flex items-center gap-3 flex-wrap pt-1">
                    {scopedUnlinkCount > 0 && (
                      <button type="button" onClick={() => handleBatchUnlink(
                        pkg.package_items
                          .filter(i => selectedUnlinkKeys.has(unlinkKey(pkg.id, i.equipment_id)))
                          .map(i => ({ packageId: pkg.id, equipmentId: i.equipment_id })),
                      )} disabled={isBusy || running}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors">
                        <Trash2 className="h-3 w-3" />
                        批次取消掛載（{scopedUnlinkCount}）
                      </button>
                    )}
                    <EquipmentQuickPick
                      allCards={allCards}
                      excludeIds={pkg.package_items.map(i => i.equipment_id)}
                      disabled={isBusy}
                      onPickMany={ids => handleAddManyToPackage(pkg.id, ids)}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
