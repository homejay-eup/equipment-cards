'use client'

import { useCallback, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Search, AlertTriangle, CheckCircle2, Loader2, Truck, ShieldCheck, ArrowRight, Maximize2, Minimize2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceEquipmentStats, MaintenanceEquipmentRule } from '@/types/maintenance'
import { formatWarrantyPeriod, RULE_TYPE_COLOR, fmtDateTime, emailPrefix } from '@/lib/maintenanceFormat'

interface Props {
  allCards: EquipmentCard[]
  equipmentStats: Record<string, MaintenanceEquipmentStats>
  onJumpToVendor: (vendorId: string, equipmentId: string, ruleId: string) => void
}

type RulesState = MaintenanceEquipmentRule[] | 'loading' | 'error'

// 依料號查詢：一進來就列出全部「有維修資訊」的料號，搜尋框只是即時篩選這份清單。
// 每個料號可個別展開/收合，展開時才發 API 抓規則內容並快取，收合再展開不重複打 API。
export default function EquipmentRuleListPanel({ allCards, equipmentStats, onJumpToVendor }: Props) {
  const [query, setQuery] = useState('')
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [rulesCache, setRulesCache] = useState<Record<string, RulesState>>({})

  const withRules = useMemo(
    () => allCards.filter(card => (equipmentStats[card.equipment_id]?.rule_count ?? 0) > 0),
    [allCards, equipmentStats]
  )

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return withRules
    return withRules.filter(card => card.equipment_id.includes(q) || card.name.includes(q))
  }, [withRules, query])

  const fetchRules = useCallback(async (equipmentId: string) => {
    setRulesCache(prev => ({ ...prev, [equipmentId]: 'loading' }))
    try {
      const res = await fetch(`/api/maintenance/rules/by-equipment?equipment_id=${encodeURIComponent(equipmentId)}`)
      const data = await res.json().catch(() => ({}))
      setRulesCache(prev => ({ ...prev, [equipmentId]: res.ok ? (data.rules ?? []) : 'error' }))
    } catch {
      setRulesCache(prev => ({ ...prev, [equipmentId]: 'error' }))
    }
  }, [])

  function toggleExpand(equipmentId: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(equipmentId)) next.delete(equipmentId)
      else next.add(equipmentId)
      return next
    })
    if (!(equipmentId in rulesCache)) fetchRules(equipmentId)
  }

  function expandAll() {
    const ids = filtered.map(c => c.equipment_id)
    setExpandedIds(new Set(ids))
    for (const id of ids) {
      if (!(id in rulesCache)) fetchRules(id)
    }
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg overflow-hidden">
      <div className="p-3 border-b border-[rgba(122,82,48,.1)] flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[10rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜尋料號或品名…"
            className="w-full pl-8 pr-2 py-1.5 border border-[#e8ddd0] rounded-lg text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
          />
        </div>
        <button
          onClick={expandAll}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors flex-shrink-0"
        >
          <Maximize2 className="h-3 w-3" />全部展開
        </button>
        <button
          onClick={collapseAll}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors flex-shrink-0"
        >
          <Minimize2 className="h-3 w-3" />全部收合
        </button>
      </div>

      <div className="p-3 space-y-2">
        {filtered.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#a08060]">
            {withRules.length === 0 ? '尚無任何料號有維修資訊' : '沒有符合的料號，換個關鍵字試試'}
          </p>
        ) : (
          filtered.map(card => {
            const stats = equipmentStats[card.equipment_id]
            const expanded = expandedIds.has(card.equipment_id)
            const cached = rulesCache[card.equipment_id]
            return (
              <div key={card.equipment_id} className="border border-[#e8ddd0] rounded-lg overflow-hidden">
                <button
                  onClick={() => toggleExpand(card.equipment_id)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[rgba(122,82,48,.04)] hover:bg-[rgba(122,82,48,.07)] transition-colors"
                >
                  <span className="flex items-center gap-1.5 min-w-0">
                    {expanded ? <ChevronDown className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" /> : <ChevronRight className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060]" />}
                    <span className="text-sm font-medium text-[#4a3422] truncate">{card.equipment_id} {card.name}</span>
                  </span>
                  <span className="flex items-center gap-1.5 flex-shrink-0">
                    {(stats?.needs_review_count ?? 0) > 0 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(181,69,27,.12)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                        <AlertTriangle className="h-2.5 w-2.5" />{stats?.needs_review_count}
                      </span>
                    )}
                    <span className="text-[10px] text-[#a08060]">{stats?.rule_count ?? 0} 筆規則</span>
                  </span>
                </button>
                {expanded && (
                  <div className="p-2 space-y-2 bg-white">
                    {cached === 'loading' || cached === undefined ? (
                      <div className="flex items-center justify-center py-6 text-[#a08060]">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    ) : cached === 'error' ? (
                      <p className="text-center py-4 text-xs text-[#b5451b]">查詢失敗，請重試</p>
                    ) : cached.length === 0 ? (
                      <p className="text-center py-4 text-xs text-[#a08060]">此料號尚無維修資訊</p>
                    ) : (
                      cached.map(rule => (
                        <div key={rule.id} className="bg-white border border-[#e8ddd0] rounded-lg p-3 space-y-2">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium border ${RULE_TYPE_COLOR[rule.rule_type] ?? RULE_TYPE_COLOR['其他']}`}>
                              {rule.rule_type}
                            </span>
                            <span className="text-xs text-[#a08060]">{rule.item}</span>
                            {rule.needs_review ? (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(181,69,27,.1)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                                <AlertTriangle className="h-3 w-3" />建議覆核
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(74,120,74,.08)] text-[#4a784a] border border-[rgba(74,120,74,.25)]">
                                <CheckCircle2 className="h-3 w-3" />已確認最新
                              </span>
                            )}
                          </div>

                          <p className="text-sm text-[#4a3422] whitespace-pre-wrap leading-relaxed">{rule.content}</p>

                          {rule.warranty_start_date && (
                            <p className="flex items-center gap-1 text-xs text-[#a08060]">
                              <Truck className="h-3 w-3 flex-shrink-0" />{rule.warranty_start_date} 後到貨適用
                            </p>
                          )}

                          {formatWarrantyPeriod(rule.warranty_period_months) && (
                            <p className="flex items-center gap-1 text-xs text-[#a08060]">
                              <ShieldCheck className="h-3 w-3 flex-shrink-0" />保固 {formatWarrantyPeriod(rule.warranty_period_months)}
                            </p>
                          )}

                          <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(122,82,48,.08)]">
                            <div className="text-[11px] text-[#b0967a]">
                              <p>所屬廠商：{rule.vendor_name}</p>
                              <p>
                                最後更新：{fmtDateTime(rule.last_updated_at)}
                                {emailPrefix(rule.last_updated_by) ? `（${emailPrefix(rule.last_updated_by)}）` : ''}
                                {rule.confirmed_at && (
                                  <span className="ml-2">已確認：{fmtDateTime(rule.confirmed_at)}{emailPrefix(rule.confirmed_by) ? `（${emailPrefix(rule.confirmed_by)}）` : ''}</span>
                                )}
                              </p>
                            </div>
                            <button
                              onClick={() => onJumpToVendor(rule.vendor_id, card.equipment_id, rule.id)}
                              className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:border-[rgba(122,82,48,.45)] transition-colors flex-shrink-0"
                            >
                              前往編輯此規則<ArrowRight className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
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
