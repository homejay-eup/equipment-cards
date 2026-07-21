'use client'

import { useMemo, useState } from 'react'
import {
  AreaChart,
  Area,
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

const AREA_COLOR = '#7a5230'
const AXIS_COLOR = '#c4b19a'
const GRID_COLOR = 'rgba(122,82,48,.1)'
const MAX_VISIBLE_TICKS = 12

// Y 軸刻度用：累計值皆為小時級（不會低於 1 小時），統一顯示整數「X 小時」，
// 包含 0 也顯示「0 小時」，不再出現分鐘單位。傳入值為分鐘，換算成小時後四捨五入。
function formatHoursAxis(minutes: number): string {
  return `${Math.round(minutes / 60)} 小時`
}

// 依資料最大值算出整齊的 Y 軸上限與刻度（皆以分鐘為單位，供 recharts domain/ticks 使用）。
// 級距（step）從候選整數小時中挑選，讓刻度數量落在約 4~5 個之間，避免 recharts 自動產生
// 67/133/267 這種怪數。上限往上取整到 step 的倍數；若剛好等於最大值再加一個 step，
// 確保頂端資料點上方一定有留白、不會被切到。
function computeHoursAxis(maxMinutes: number): { domainMax: number; ticks: number[] } {
  const maxHours = maxMinutes / 60
  const candidateSteps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
  let step = candidateSteps[candidateSteps.length - 1]
  for (const candidate of candidateSteps) {
    if (Math.ceil(maxHours / candidate) <= 5) {
      step = candidate
      break
    }
  }
  let upperHours = Math.ceil(maxHours / step) * step
  if (upperHours <= maxHours) upperHours += step
  if (upperHours <= 0) upperHours = step

  const ticks: number[] = []
  for (let h = 0; h <= upperHours + 1e-9; h += step) {
    ticks.push(h * 60)
  }
  return { domainMax: upperHours * 60, ticks }
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

  // Y 軸整齊化：以資料最大累計值算出整齊的上限與刻度（累計值只增不減，最大值即最後一點）
  const maxMinutes = data.reduce((m, p) => Math.max(m, p.cumulativeMinutes), 0)
  const { domainMax, ticks } = computeHoursAxis(maxMinutes)

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
            <AreaChart data={data} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="cumulativeDurationFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={AREA_COLOR} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={AREA_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
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
                domain={[0, domainMax]}
                ticks={ticks}
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
              <Area
                type="monotone"
                dataKey="cumulativeMinutes"
                stroke={AREA_COLOR}
                strokeWidth={2}
                fill="url(#cumulativeDurationFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
