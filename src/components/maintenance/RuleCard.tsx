'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, Pencil, Trash2, Loader2, Truck, ShieldCheck } from 'lucide-react'
import { MaintenanceRule } from '@/types/maintenance'
import { formatWarrantyPeriod, RULE_TYPE_COLOR, fmtDateTime, emailPrefix } from '@/lib/maintenanceFormat'

interface Props {
  rule: MaintenanceRule
  canManage: boolean
  onEdit: () => void
  onDelete: () => void
  onConfirmLatest: () => Promise<void>
}

// 單筆維修規則卡片：類型標籤、內容、掛載料號 chips、最後更新時間+人、
// 確認狀態徽章、標示已確認最新按鈕
export default function RuleCard({ rule, canManage, onEdit, onDelete, onConfirmLatest }: Props) {
  const [confirming, setConfirming] = useState(false)

  async function handleConfirm() {
    setConfirming(true)
    try {
      await onConfirmLatest()
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg p-3 space-y-2">
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
        {canManage && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <button onClick={onEdit} title="編輯規則" className="p-1 text-[#a08060] hover:text-[#7a5230] transition-colors">
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button onClick={onDelete} title="刪除規則" className="p-1 text-[#a08060] hover:text-[#b5451b] transition-colors">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
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

      {(rule.equipment_ids?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {rule.equipment_ids!.map(e => (
            <span key={e.equipment_id} className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-[rgba(122,82,48,.06)] text-[#7a5230] border border-[rgba(122,82,48,.15)]">
              {e.equipment_id} {e.name}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1 border-t border-[rgba(122,82,48,.08)]">
        <p className="text-[11px] text-[#b0967a]">
          最後更新：{fmtDateTime(rule.last_updated_at)}
          {emailPrefix(rule.last_updated_by) ? `（${emailPrefix(rule.last_updated_by)}）` : ''}
          {rule.confirmed_at && (
            <span className="ml-2">已確認：{fmtDateTime(rule.confirmed_at)}{emailPrefix(rule.confirmed_by) ? `（${emailPrefix(rule.confirmed_by)}）` : ''}</span>
          )}
        </p>
        {canManage && (
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:border-[rgba(122,82,48,.45)] disabled:opacity-40 transition-colors flex-shrink-0"
          >
            {confirming ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
            標示已確認最新
          </button>
        )}
      </div>
    </div>
  )
}
