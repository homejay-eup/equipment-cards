'use client'

import { Fragment } from 'react'
import { ChevronRight, PackageOpen, Stethoscope, Truck, Trash2, Inbox } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MaintenanceStage } from '@/types/maintenance'

export interface FlowStageStat {
  /** 該區塊全部規則數（未套用搜尋） */
  total: number
  /** 搜尋後仍適用（顯示）的規則數 */
  visible: number
  /** 建議覆核數（未套用搜尋） */
  reviewCount: number
  /** 搜尋時是否有命中的專屬規則（顯示圓點） */
  hit: boolean
}

interface StageMeta {
  key: Exclude<MaintenanceStage, '待歸類'>
  title: string
  subtitle: string
  Icon: LucideIcon
}

const STAGE_META: StageMeta[] = [
  { key: '回廠', title: '回廠', subtitle: '收件、分流', Icon: PackageOpen },
  { key: '檢測', title: '檢測', subtitle: '年限判斷、是否檢測', Icon: Stethoscope },
  { key: '送修', title: '送修', subtitle: '廠商規則', Icon: Truck },
  { key: '報廢', title: '報廢', subtitle: '成本、國稅局', Icon: Trash2 },
]

interface Props {
  current: MaintenanceStage
  stats: Record<MaintenanceStage, FlowStageStat>
  searching: boolean
  onSelect: (stage: MaintenanceStage) => void
}

// 回廠流程圖：4 個區塊（編號圓圈、圖示、標題、副標題、筆數、待覆核徽章、搜尋命中圓點），
// 尾端有規則時才顯示「待歸類 N 筆」小標籤。窄螢幕時流程圖在自己的容器內橫向捲動，不撐開整頁。
export default function FlowStages({ current, stats, searching, onSelect }: Props) {
  const pending = stats['待歸類']
  return (
    <div className="space-y-1.5">
      <div className="overflow-x-auto pt-2 pr-2 pb-1 -mt-2">
        <div className="flex items-stretch gap-1.5 min-w-[560px]">
          {STAGE_META.map((meta, i) => {
            const s = stats[meta.key]
            const on = current === meta.key
            return (
              <Fragment key={meta.key}>
                {i > 0 && (
                  <span className="self-center flex-shrink-0 text-[#c49a72]" aria-hidden="true">
                    <ChevronRight className="h-4 w-4" />
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(meta.key)}
                  aria-pressed={on}
                  className={`relative flex-1 min-w-0 text-left rounded-[14px] border px-3 py-[11px] transition-all ${
                    on
                      ? 'bg-[#7a5230] border-[#7a5230] text-white'
                      : 'bg-[#fff9f4] border-[#e8ddd0] text-[#2c1e12] hover:border-[#c49a72]'
                  }`}
                >
                  {searching && s.hit && (
                    <span
                      className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-[#c49a72] border-2 border-[#faf6f0]"
                      title="有此搜尋的專屬規則"
                      aria-label="有此搜尋的專屬規則"
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <span className={`h-[22px] w-[22px] rounded-full flex items-center justify-center text-xs font-medium flex-shrink-0 ${
                      on ? 'bg-white/20 text-white' : 'bg-[rgba(122,82,48,.1)] text-[#7a5230]'
                    }`}>{i + 1}</span>
                    <meta.Icon className={`h-[18px] w-[18px] ml-auto ${on ? 'text-[#e8cfae]' : 'text-[#c49a72]'}`} aria-hidden="true" />
                  </div>
                  <b className="block text-[15px] font-medium mt-2">{meta.title}</b>
                  <small className={`block text-[11px] mt-px truncate ${on ? 'text-white/70' : 'text-[#a08060]'}`}>{meta.subtitle}</small>
                  <div className={`mt-[9px] flex flex-wrap items-center gap-1.5 text-[11px] ${on ? 'text-white/80' : 'text-[#a08060]'}`}>
                    <span>{searching ? `${s.visible} 筆適用` : `${s.total} 筆`}</span>
                    {s.reviewCount > 0 && !searching && (
                      <span className={`px-2 rounded-full leading-[1.5] ${on ? 'bg-white/20 text-white' : 'bg-[#fdf0d5] text-[#8a5a12]'}`}>
                        {s.reviewCount} 待覆核
                      </span>
                    )}
                  </div>
                </button>
              </Fragment>
            )
          })}
        </div>
      </div>

      {pending.total > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => onSelect('待歸類')}
            aria-pressed={current === '待歸類'}
            title="尚未歸類的舊規則，可用批次「改區塊」處理"
            className={`inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
              current === '待歸類'
                ? 'bg-[#7a5230] border-[#7a5230] text-white'
                : 'bg-[#fdf0d5] border-[#f0dcae] text-[#8a5a12] hover:border-[#c49a72]'
            }`}
          >
            <Inbox className="h-3 w-3" aria-hidden="true" />
            待歸類 {searching ? pending.visible : pending.total} 筆
          </button>
        </div>
      )}
    </div>
  )
}
