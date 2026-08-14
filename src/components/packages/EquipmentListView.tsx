'use client'

import { Folder, Trash2, ChevronRight, ChevronDown } from 'lucide-react'
import { EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import QuantityStepper from '@/components/QuantityStepper'
import PackageQuickPick from './PackageQuickPick'
import { unlinkKey } from './unlinkKey'

interface EquipmentGroup {
  equipment_id: string
  name: string
  packages: (EquipmentPackage | SharedEquipmentPackage)[]
}

// 依料號列表：展開/摺疊、批次取消掛載、掛載到其他套餐。
// 從 PackageExplorer.tsx 拆出（純呈現＋既有 callback 轉發，行為不變）。
export default function EquipmentListView({
  filteredEquipmentGroups, packages, expanded, toggleExpand, busyIds, isShared, canEdit,
  selectedUnlinkKeys, toggleUnlinkSelect, running,
  handleBatchUnlink, handleAddEquipmentToManyPackages, onUpdateQuantity,
}: {
  filteredEquipmentGroups: EquipmentGroup[]
  packages: (EquipmentPackage | SharedEquipmentPackage)[]
  expanded: Set<string>
  toggleExpand: (key: string) => void
  busyIds: Set<string>
  isShared: boolean
  canEdit: boolean
  selectedUnlinkKeys: Set<string>
  toggleUnlinkSelect: (packageId: string, equipmentId: string) => void
  running: boolean
  handleBatchUnlink: (targets: { packageId: string; equipmentId: string }[]) => void | Promise<void>
  handleAddEquipmentToManyPackages: (equipmentId: string, packageIds: string[]) => void | Promise<void>
  onUpdateQuantity: (packageId: string, equipmentId: string, quantity: number) => void | Promise<void>
}) {
  if (filteredEquipmentGroups.length === 0) {
    return <p className="text-xs text-[#a08060] py-6 text-center">沒有符合的料卡</p>
  }

  return (
    <div className="border border-[#e8ddd0] rounded-lg divide-y divide-[#f0e8dc]">
      {filteredEquipmentGroups.map(g => {
        const isExpanded = expanded.has(g.equipment_id)
        const scopedUnlinkCount = g.packages.filter(p => selectedUnlinkKeys.has(unlinkKey(p.id, g.equipment_id))).length
        return (
          <div key={g.equipment_id}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => toggleExpand(g.equipment_id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(g.equipment_id) }
              }}
              className="flex items-center gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.04)] transition-colors"
            >
              <span className="text-[#a08060] flex-shrink-0">
                {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </span>
              <span className="text-[#4a3422] flex-shrink-0">{g.equipment_id}</span>
              <span className="text-[#6b4f38] truncate flex-1">{g.name}</span>
              <span className="text-[#a08060] flex-shrink-0">{g.packages.length} 份套餐</span>
            </div>
            {isExpanded && (
              <div className="px-3 pb-3 pl-9 bg-[rgba(122,82,48,.03)]">
                {g.packages.length === 0 ? (
                  <p className="text-xs text-[#a08060] py-1.5">尚未掛載任何套餐</p>
                ) : (
                  <div className="flex flex-col gap-1 py-1.5">
                    {g.packages.map(pkg => {
                      const isBusy = busyIds.has(pkg.id)
                      const k = unlinkKey(pkg.id, g.equipment_id)
                      const sharedDept = (pkg as SharedEquipmentPackage).source_department_name
                      const quantity = pkg.package_items.find(i => i.equipment_id === g.equipment_id)?.quantity ?? 1
                      return (
                        <label key={pkg.id} className="flex items-center justify-between gap-2 text-xs py-0.5 cursor-pointer">
                          <span className="flex items-center gap-1.5 text-[#4a3422] truncate">
                            <Folder className="h-3 w-3 text-[#c49a72] flex-shrink-0" />
                            <span className="truncate">{pkg.name}</span>
                            {sharedDept && (
                              <span className="text-[10px] text-[#a08060] flex-shrink-0">（來自：{sharedDept}）</span>
                            )}
                          </span>
                          <span className="flex items-center gap-3 flex-shrink-0">
                            {!isShared && canEdit ? (
                              <QuantityStepper
                                value={quantity}
                                onChange={v => onUpdateQuantity(pkg.id, g.equipment_id, v)}
                                disabled={isBusy}
                              />
                            ) : (
                              quantity !== 1 && <span className="text-[#a08060]">×{quantity}</span>
                            )}
                            {!isShared && canEdit && (
                              <span className="flex items-center gap-1.5 text-[#a08060]">
                                取消掛載
                                <input type="checkbox" checked={selectedUnlinkKeys.has(k)}
                                  onChange={() => toggleUnlinkSelect(pkg.id, g.equipment_id)}
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
                        g.packages
                          .filter(p => selectedUnlinkKeys.has(unlinkKey(p.id, g.equipment_id)))
                          .map(p => ({ packageId: p.id, equipmentId: g.equipment_id })),
                      )} disabled={running}
                        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors">
                        <Trash2 className="h-3 w-3" />
                        批次取消掛載（{scopedUnlinkCount}）
                      </button>
                    )}
                    <PackageQuickPick
                      packages={packages.map(p => ({ id: p.id, name: p.name }))}
                      excludeIds={g.packages.map(p => p.id)}
                      onPickMany={ids => handleAddEquipmentToManyPackages(g.equipment_id, ids)}
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
