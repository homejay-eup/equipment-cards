'use client'

import { useMemo, useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { UsageHeatmapPoint } from '@/lib/analytics'
import { buildCumulativeDurationSeries, type CumulativeDurationPoint } from '@/lib/durationTrend'

interface Props {
  heatmap: UsageHeatmapPoint[]
}

type Granularity = 'daily' | 'monthly'

const BAR_COLOR = '#7a5230'
const AXIS_COLOR = '#c4b19a'
const GRID_COLOR = 'rgba(122,82,48,.1)'
const MAX_VISIBLE_TICKS = 12

// Y 軸刻度用：粗略顯示到整數小時。先四捨五入到分鐘再判斷門檻，
// 避免「59.9 分鐘」這種邊界值被 <1 小時分支誤判成「60 分鐘」而非「1 小時」
function formatHoursAxis(minutes: number): string {
  const totalMinutes = Math.round(minutes)
  if (totalMinutes < 60) {
    return `${totalMinutes} 分鐘`
  }
  return `${Math.round(totalMinutes / 60)} 小時`
}

// Tooltip 用：精確顯示「X 小時 Y 分」，比照 UsageHeatmap.tsx/UsageLeaderboard.tsx
// 既有 formatMinutes/formatDuration 的呈現風格，維持專案內統計圖表的一致性
function formatDurationPrecise(minutes: number): string {
  const totalMinutes = Math.round(minutes)
  if (totalMinutes < 1) return '0 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours === 0) return `${mins} 分鐘`
  if (mins === 0) return `${hours} 小時`
  return `${hours} 小時 ${mins} 分`
}

// X 軸刻度：日粒度顯示 'M/D'，月粒度顯示 'yyyy/M'
function formatAxisPeriod(period: string, granularity: Granularity): string {
  if (granularity === 'monthly') {
    const [y, m] = period.split('-')
    return `${y}/${Number(m)}`
  }
  const [, m, d] = period.split('-')
  return `${Number(m)}/${Number(d)}`
}

// Tooltip 標籤：日粒度顯示 'yyyy/M/D'，月粒度顯示 'yyyy/M'
function formatTooltipPeriod(period: string, granularity: Granularity): string {
  if (granularity === 'monthly') {
    const [y, m] = period.split('-')
    return `${y}/${Number(m)}`
  }
  const [y, m, d] = period.split('-')
  return `${y}/${Number(m)}/${Number(d)}`
}

function ChartCard({
  title,
  actions,
  children,
}: {
  title: string
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-sm font-medium text-[#6b4f38]">{title}</div>
        {actions}
      </div>
      {children}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-[#a08060]">
      尚無資料
    </div>
  )
}

function GranularityToggle({
  value,
  onChange,
}: {
  value: Granularity
  onChange: (value: Granularity) => void
}) {
  const options: { key: Granularity; label: string }[] = [
    { key: 'daily', label: '日' },
    { key: 'monthly', label: '月' },
  ]

  return (
    <div className="flex items-center gap-1 rounded-lg border border-[rgba(122,82,48,.2)] p-0.5">
      {options.map((option) => {
        const active = option.key === value
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={
              active
                ? 'rounded-md bg-[#7a5230] px-3 py-1 text-xs font-medium text-white transition-colors'
                : 'rounded-md px-3 py-1 text-xs font-medium text-[#a08060] transition-colors hover:text-[#7a5230]'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export default function CumulativeDurationChart({ heatmap }: Props) {
  const [granularity, setGranularity] = useState<Granularity>('daily')

  const { daily, monthly } = useMemo(() => buildCumulativeDurationSeries(heatmap), [heatmap])
  const data: CumulativeDurationPoint[] = granularity === 'daily' ? daily : monthly

  // 資料點多時稀疏顯示 X 軸標籤，避免全部擠在一起看不清楚
  const tickInterval =
    data.length > MAX_VISIBLE_TICKS ? Math.ceil(data.length / MAX_VISIBLE_TICKS) : 0

  return (
    <div className="mb-6">
      <ChartCard
        title="累計總停留時長"
        actions={<GranularityToggle value={granularity} onChange={setGranularity} />}
      >
        {data.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="period"
                tickFormatter={(period: string) => formatAxisPeriod(period, granularity)}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: AXIS_COLOR }}
                interval={tickInterval}
              />
              <YAxis
                dataKey="cumulativeMinutes"
                tickFormatter={formatHoursAxis}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                formatter={(value) => [formatDurationPrecise(Number(value ?? 0)), '累計停留時長']}
                labelFormatter={(label) => formatTooltipPeriod(String(label), granularity)}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: 'rgba(122,82,48,.2)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="cumulativeMinutes" fill={BAR_COLOR} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
