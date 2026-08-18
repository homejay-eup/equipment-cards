'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Pencil, Trash2, Plus, Loader2, AlertTriangle } from 'lucide-react'
import { MaintenanceRule, MaintenanceVendor } from '@/types/maintenance'
import RuleCard from '@/components/maintenance/RuleCard'

interface EquipmentGroup {
  equipmentId: string
  name: string
  rules: MaintenanceRule[]
}

interface Props {
  vendor: MaintenanceVendor
  rules: MaintenanceRule[]
  rulesLoading: boolean
  canManage: boolean
  expandedIds: Set<string>
  onToggleExpand: (equipmentId: string) => void
  onCollapseAll: () => void
  onEditVendor: () => void
  onDeleteVendor: () => void
  onAddRule: () => void
  onEditRule: (rule: MaintenanceRule) => void
  onDeleteRule: (rule: MaintenanceRule) => void
  onConfirmLatest: (rule: MaintenanceRule) => Promise<void>
}

const GENERAL_KEY = '__general__'

// 廠商基本資料 + 依料號分組的規則列表（可展開/收合），
// 未掛料號的規則歸到「未指定料號的一般規則」分組
export default function VendorDetailPanel({
  vendor, rules, rulesLoading, canManage,
  expandedIds, onToggleExpand, onCollapseAll,
  onEditVendor, onDeleteVendor, onAddRule, onEditRule, onDeleteRule, onConfirmLatest,
}: Props) {
  const [query, setQuery] = useState('')

  const filteredRules = useMemo(() => {
    const q = query.trim()
    if (!q) return rules
    return rules.filter(r =>
      r.item.includes(q) ||
      r.content.includes(q) ||
      (r.equipment_ids ?? []).some(e => e.equipment_id.includes(q) || e.name.includes(q))
    )
  }, [rules, query])

  const { groups, generalRules } = useMemo(() => {
    const map = new Map<string, EquipmentGroup>()
    const general: MaintenanceRule[] = []
    for (const rule of filteredRules) {
      const ids = rule.equipment_ids ?? []
      if (ids.length === 0) {
        general.push(rule)
        continue
      }
      for (const ref of ids) {
        let g = map.get(ref.equipment_id)
        if (!g) {
          g = { equipmentId: ref.equipment_id, name: ref.name, rules: [] }
          map.set(ref.equipment_id, g)
        }
        g.rules.push(rule)
      }
    }
    const groups = Array.from(map.values()).sort((a, b) => a.equipmentId.localeCompare(b.equipmentId))
    return { groups, generalRules: general }
  }, [filteredRules])

  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg overflow-hidden">
      {/* 廠商基本資料 */}
      <div className="p-4 border-b border-[rgba(122,82,48,.1)]">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-[#5a3820]">{vendor.name}</h3>
            {vendor.vendor_code && <p className="text-xs text-[#a08060] font-mono mt-0.5">{vendor.vendor_code}</p>}
          </div>
          {canManage && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button onClick={onEditVendor} title="編輯廠商" className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <button onClick={onDeleteVendor} title="刪除廠商" className="p-1.5 text-[#a08060] hover:text-[#b5451b] transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="mt-2 space-y-0.5">
          {vendor.address && <p className="text-xs text-[#6b4f38]">地址：{vendor.address}</p>}
          {(vendor.contact_name || vendor.contact_phone) && (
            <p className="text-xs text-[#6b4f38]">
              聯絡人：{vendor.contact_name ?? '—'}{vendor.contact_phone ? `／${vendor.contact_phone}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* 搜尋 + 操作列 */}
      <div className="p-3 border-b border-[rgba(122,82,48,.1)] flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜尋料號、品名、內容…"
            className="w-full pl-8 pr-2 py-1.5 border border-[#e8ddd0] rounded-lg text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
          />
        </div>
        <button onClick={onCollapseAll} className="px-2.5 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors flex-shrink-0">
          全部收合
        </button>
        {canManage && (
          <button onClick={onAddRule} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#9c6b42] transition-colors flex-shrink-0">
            <Plus className="h-3.5 w-3.5" />新增規則
          </button>
        )}
      </div>

      {/* 規則列表 */}
      <div className="p-3 space-y-2">
        {rules.length === 0 && rulesLoading ? (
          <div className="flex items-center justify-center py-8 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : groups.length === 0 && generalRules.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#a08060]">尚無規則{query ? '，換個關鍵字試試' : ''}</p>
        ) : (
          <>
            {groups.map(group => {
              const expanded = expandedIds.has(group.equipmentId)
              const hasReview = group.rules.some(r => r.needs_review)
              return (
                <div key={group.equipmentId} className="border border-[#e8ddd0] rounded-lg overflow-hidden">
                  <button
                    onClick={() => onToggleExpand(group.equipmentId)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(122,82,48,.04)] hover:bg-[rgba(122,82,48,.07)] transition-colors"
                  >
                    <span className="flex items-center gap-1.5 min-w-0">
                      {expanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" />}
                      <span className="text-sm font-medium text-[#4a3422] truncate">{group.equipmentId} {group.name}</span>
                    </span>
                    <span className="flex items-center gap-1.5 flex-shrink-0">
                      {hasReview && (
                        <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(181,69,27,.12)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                          <AlertTriangle className="h-2.5 w-2.5" />建議覆核
                        </span>
                      )}
                      <span className="text-[10px] text-[#a08060]">{group.rules.length} 筆</span>
                    </span>
                  </button>
                  {expanded && (
                    <div className="p-2 space-y-2 bg-white">
                      {group.rules.map(rule => (
                        <RuleCard
                          key={rule.id}
                          rule={rule}
                          canManage={canManage}
                          onEdit={() => onEditRule(rule)}
                          onDelete={() => onDeleteRule(rule)}
                          onConfirmLatest={() => onConfirmLatest(rule)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {generalRules.length > 0 && (
              <div className="border border-[#e8ddd0] rounded-lg overflow-hidden">
                <button
                  onClick={() => onToggleExpand(GENERAL_KEY)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(122,82,48,.04)] hover:bg-[rgba(122,82,48,.07)] transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {expandedIds.has(GENERAL_KEY) ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" />}
                    <span className="text-sm font-medium text-[#4a3422]">未指定料號的一般規則</span>
                  </span>
                  <span className="text-[10px] text-[#a08060] flex-shrink-0">{generalRules.length} 筆</span>
                </button>
                {expandedIds.has(GENERAL_KEY) && (
                  <div className="p-2 space-y-2 bg-white">
                    {generalRules.map(rule => (
                      <RuleCard
                        key={rule.id}
                        rule={rule}
                        canManage={canManage}
                        onEdit={() => onEditRule(rule)}
                        onDelete={() => onDeleteRule(rule)}
                        onConfirmLatest={() => onConfirmLatest(rule)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export { GENERAL_KEY }
