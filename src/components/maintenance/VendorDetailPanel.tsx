'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, Pencil, Trash2, Plus, Loader2, AlertTriangle, Maximize2, Minimize2 } from 'lucide-react'
import { MaintenanceRule, MaintenanceVendor } from '@/types/maintenance'
import RuleCard from '@/components/maintenance/RuleCard'
import { RULE_TYPE_COLOR } from '@/lib/maintenanceFormat'

interface Props {
  vendor: MaintenanceVendor
  rules: MaintenanceRule[]
  rulesLoading: boolean
  canManage: boolean
  expandedIds: Set<string>
  onToggleExpand: (ruleId: string) => void
  onCollapseAll: () => void
  onExpandAll: (ruleIds: string[]) => void
  onEditVendor: () => void
  onDeleteVendor: () => void
  onAddRule: () => void
  onEditRule: (rule: MaintenanceRule) => void
  onDeleteRule: (rule: MaintenanceRule) => void
  onConfirmLatest: (rule: MaintenanceRule) => Promise<void>
}

// 廠商基本資料 + 去重複的規則清單（每筆規則各自可展開/收合）。
// 一筆規則可掛多個料號，過去依料號分組會讓同一筆規則重複出現在多組裡，
// 改成扁平化清單後每筆只出現一次，展開時用 RuleCard 顯示完整內容（含料號標籤）。
export default function VendorDetailPanel({
  vendor, rules, rulesLoading, canManage,
  expandedIds, onToggleExpand, onCollapseAll, onExpandAll,
  onEditVendor, onDeleteVendor, onAddRule, onEditRule, onDeleteRule, onConfirmLatest,
}: Props) {
  const [query, setQuery] = useState('')

  const filteredRules = useMemo(() => {
    const q = query.trim()
    const base = !q ? rules : rules.filter(r =>
      r.item.includes(q) ||
      r.content.includes(q) ||
      (r.equipment_ids ?? []).some(e => e.equipment_id.includes(q) || e.name.includes(q))
    )
    // 未指定料號的規則排最前面，其餘維持原本順序（穩定排序，只依「有無掛料號」分兩段）
    const unassigned = base.filter(r => (r.equipment_ids ?? []).length === 0)
    const assigned = base.filter(r => (r.equipment_ids ?? []).length > 0)
    return [...unassigned, ...assigned]
  }, [rules, query])

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
        <button
          onClick={() => onExpandAll(filteredRules.map(r => r.id))}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors flex-shrink-0"
        >
          <Maximize2 className="h-3 w-3" />全部展開
        </button>
        <button
          onClick={onCollapseAll}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors flex-shrink-0"
        >
          <Minimize2 className="h-3 w-3" />全部收合
        </button>
        {canManage && (
          <button onClick={onAddRule} className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#9c6b42] transition-colors flex-shrink-0">
            <Plus className="h-3.5 w-3.5" />新增規則
          </button>
        )}
      </div>

      {/* 規則列表（去重複，一筆規則只出現一次） */}
      <div className="p-3 space-y-2">
        {rules.length === 0 && rulesLoading ? (
          <div className="flex items-center justify-center py-8 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : filteredRules.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#a08060]">尚無規則{query ? '，換個關鍵字試試' : ''}</p>
        ) : (
          filteredRules.map(rule => {
            const expanded = expandedIds.has(rule.id)
            const equipmentCount = (rule.equipment_ids ?? []).length
            return (
              <div key={rule.id} className="border border-[#e8ddd0] rounded-lg overflow-hidden">
                <button
                  onClick={() => onToggleExpand(rule.id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(122,82,48,.04)] hover:bg-[rgba(122,82,48,.07)] transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" />}
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border flex-shrink-0 ${RULE_TYPE_COLOR[rule.rule_type] ?? RULE_TYPE_COLOR['其他']}`}>
                      {rule.rule_type}
                    </span>
                    <span className="text-sm font-medium text-[#4a3422] truncate">{rule.item}</span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {rule.needs_review && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(181,69,27,.12)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                        <AlertTriangle className="h-2.5 w-2.5" />建議覆核
                      </span>
                    )}
                    <span className="text-[10px] text-[#a08060]">
                      {equipmentCount > 0 ? `${equipmentCount} 個料號` : '未指定料號'}
                    </span>
                  </span>
                </button>
                {expanded && (
                  <div className="p-2 bg-white">
                    <RuleCard
                      rule={rule}
                      canManage={canManage}
                      onEdit={() => onEditRule(rule)}
                      onDelete={() => onDeleteRule(rule)}
                      onConfirmLatest={() => onConfirmLatest(rule)}
                    />
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
