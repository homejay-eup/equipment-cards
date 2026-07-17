'use client'

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { UsageGrowthPoint } from '@/lib/analytics'

interface Props {
  trend: UsageGrowthPoint[]
}

// 分鐘數格式化成「X 小時 Y 分」或「X 分鐘」，邏輯比照 AnalyticsClient.tsx 的 formatDuration（該函式輸入是秒數）
function formatMinutes(minutes: number): string {
  const totalMinutes = Math.round(minutes)
  if (totalMinutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours === 0) return `${mins} 分鐘`
  if (mins === 0) return `${hours} 小時`
  return `${hours} 小時 ${mins} 分`
}

// 'yyyy-MM-dd' -> 'M/D'，讓 X 軸標籤精簡
function formatTick(dateStr: string): string {
  const parts = dateStr.split('-')
  if (parts.length !== 3) return dateStr
  const [, m, d] = parts
  return `${Number(m)}/${Number(d)}`
}

const AXIS_COLOR = '#c4b19a'
const GRID_COLOR = 'rgba(122,82,48,.1)'
const LINE_COLOR = '#7a5230'

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm p-4">
      <div className="mb-2 text-sm font-medium text-[#6b4f38]">{title}</div>
      {children}
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex h-[220px] items-center justify-center text-sm text-[#a08060]">
      尚無趨勢資料
    </div>
  )
}

// 依資料點數決定 X 軸標籤間隔，避免日期擠成一團
function computeTickInterval(pointCount: number): number {
  if (pointCount <= 10) return 0
  if (pointCount <= 30) return 1
  if (pointCount <= 60) return 3
  return Math.floor(pointCount / 12)
}

export default function AnalyticsTrendCharts({ trend }: Props) {
  const tickInterval = computeTickInterval(trend.length)

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
      <ChartCard title="累計登入次數">
        {trend.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="loginsFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatTick}
                interval={tickInterval}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: AXIS_COLOR }}
              />
              <YAxis
                allowDecimals={false}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                formatter={(value) => [`${value ?? 0} 次`, '累計登入次數']}
                labelFormatter={(label) => label}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: 'rgba(122,82,48,.2)',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulativeLogins"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#loginsFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      <ChartCard title="累計停留時長">
        {trend.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={trend} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="minutesFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={LINE_COLOR} stopOpacity={0.2} />
                  <stop offset="100%" stopColor={LINE_COLOR} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={formatTick}
                interval={tickInterval}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: AXIS_COLOR }}
              />
              <YAxis
                allowDecimals={false}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={32}
              />
              <Tooltip
                formatter={(value) => [formatMinutes(Number(value ?? 0)), '累計停留時長']}
                labelFormatter={(label) => label}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: 'rgba(122,82,48,.2)',
                  fontSize: 12,
                }}
              />
              <Area
                type="monotone"
                dataKey="cumulativeMinutes"
                stroke={LINE_COLOR}
                strokeWidth={2}
                fill="url(#minutesFill)"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  )
}
