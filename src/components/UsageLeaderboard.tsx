'use client'

import { useState } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { UsageAnalyticsRow } from '@/lib/analytics'

const COLLAPSED_COUNT = 10

interface Props {
  rows: UsageAnalyticsRow[]
}

// 秒數格式化成「X 小時 Y 分」或「X 分鐘」，邏輯比照 AnalyticsClient.tsx 的 formatDuration
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分鐘`
  if (minutes === 0) return `${hours} 小時`
  return `${hours} 小時 ${minutes} 分`
}

// X 軸刻度用「X 小時」等簡短單位，避免顯示原始秒數
function formatAxisTick(seconds: number): string {
  const hours = seconds / 3600
  if (hours < 1) {
    const minutes = Math.round(seconds / 60)
    return `${minutes} 分`
  }
  const rounded = Math.round(hours * 10) / 10
  return `${rounded} 小時`
}

const BAR_COLOR = '#7a5230'
const AXIS_COLOR = '#c4b19a'
const GRID_COLOR = 'rgba(122,82,48,.1)'

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
      尚無使用者資料
    </div>
  )
}

export default function UsageLeaderboard({ rows }: Props) {
  const [expanded, setExpanded] = useState(false)

  const sortedRows = [...rows].sort(
    (a, b) => b.totalDurationSeconds - a.totalDurationSeconds,
  )
  const displayRows = expanded ? sortedRows : sortedRows.slice(0, COLLAPSED_COUNT)
  const chartHeight = Math.max(240, displayRows.length * 40)
  const hasMore = sortedRows.length > COLLAPSED_COUNT

  return (
    <div className="mb-6">
      <ChartCard title="使用者停留時長排行">
        {sortedRows.length === 0 ? (
          <EmptyState />
        ) : (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart
              data={displayRows}
              layout="vertical"
              margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
            >
              <CartesianGrid stroke={GRID_COLOR} horizontal={false} />
              <XAxis
                type="number"
                dataKey="totalDurationSeconds"
                tickFormatter={formatAxisTick}
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: AXIS_COLOR }}
              />
              <YAxis
                type="category"
                dataKey="email"
                stroke={AXIS_COLOR}
                tick={{ fill: '#a08060', fontSize: 12 }}
                tickLine={false}
                axisLine={false}
                width={160}
                interval={0}
                tickFormatter={(email: string) =>
                  email.length > 20 ? `${email.slice(0, 19)}…` : email
                }
              />
              <Tooltip
                formatter={(value) => [formatDuration(Number(value ?? 0)), '總停留時長']}
                labelFormatter={(label) => label}
                contentStyle={{
                  borderRadius: 8,
                  borderColor: 'rgba(122,82,48,.2)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="totalDurationSeconds" fill={BAR_COLOR} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="mt-2 text-sm font-medium text-[#7a5230] hover:text-[#5c3d24] transition-colors"
          >
            {expanded ? '收合' : `展開全部（共 ${sortedRows.length} 位）`}
          </button>
        )}
      </ChartCard>
    </div>
  )
}
