'use client'

import { AlertTriangle, CheckCircle2, Loader2, Truck, ShieldCheck, ArrowRight } from 'lucide-react'
import { MaintenanceEquipmentRule } from '@/types/maintenance'
import { formatWarrantyPeriod } from '@/lib/maintenanceFormat'

interface Props {
  equipmentId: string
  equipmentName: string
  rules: MaintenanceEquipmentRule[]
  loading: boolean
  onJumpToVendor: (vendorId: string, equipmentId: string) => void
}

function fmtDateTime(iso: string | null | undefined) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  } catch { return iso }
}

function emailPrefix(email: string | null | undefined) {
  if (!email) return null
  return email.split('@')[0]
}

const RULE_TYPE_COLOR: Record<string, string> = {
  '送修規則': 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border-[rgba(122,82,48,.2)]',
  '保固說明': 'bg-[rgba(156,107,66,.08)] text-[#9c6b42] border-[rgba(156,107,66,.25)]',
  '報廢條件': 'bg-[rgba(181,69,27,.08)] text-[#b5451b] border-[rgba(181,69,27,.25)]',
  '其他': 'bg-[rgba(122,82,48,.05)] text-[#a08060] border-[rgba(122,82,48,.15)]',
}

// 依料號查詢的維修規則唯讀清單：可能橫跨多個廠商，每筆補上「前往廠商頁編輯」連結
export default function EquipmentRulesPanel({ equipmentId, equipmentName, rules, loading, onJumpToVendor }: Props) {
  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg overflow-hidden">
      <div className="p-4 border-b border-[rgba(122,82,48,.1)]">
        <h3 className="text-base font-bold text-[#5a3820]">{equipmentName}</h3>
        <p className="text-xs text-[#a08060] font-mono mt-0.5">{equipmentId}</p>
      </div>

      <div className="p-3 space-y-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : rules.length === 0 ? (
          <p className="text-center py-8 text-sm text-[#a08060]">此料號尚無維修資訊</p>
        ) : (
          rules.map(rule => (
            <div key={rule.id} className="bg-white border border-[#e8ddd0] rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-2">
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
                  onClick={() => onJumpToVendor(rule.vendor_id, equipmentId)}
                  className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:border-[rgba(122,82,48,.45)] transition-colors flex-shrink-0"
                >
                  前往廠商頁編輯<ArrowRight className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
