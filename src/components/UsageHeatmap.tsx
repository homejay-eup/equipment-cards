'use client'

import type { UsageHeatmapPoint } from '@/lib/analytics'

interface Props {
  heatmap: UsageHeatmapPoint[]
}

const BASE_COLOR = '#7a5230'
const WEEKDAY_LABELS = ['日', '一', '二', '三', '四', '五', '六']
const MONTH_LABELS = [
  '1月', '2月', '3月', '4月', '5月', '6月',
  '7月', '8月', '9月', '10月', '11月', '12月',
]
const LEVEL_OPACITIES = [0.06, 0.22, 0.4, 0.65, 1]
const CELL_SIZE = 12
const CELL_GAP = 3

// 分鐘數格式化成「X 小時 Y 分」或「X 分鐘」，邏輯比照專案內其他統計元件的 formatDuration 風格
function formatMinutes(minutes: number): string {
  const totalMinutes = Math.round(minutes)
  if (totalMinutes < 1) return '無使用記錄'
  const hours = Math.floor(totalMinutes / 60)
  const mins = totalMinutes % 60
  if (hours === 0) return `${mins} 分鐘`
  if (mins === 0) return `${hours} 小時`
  return `${hours} 小時 ${mins} 分`
}

function hexToRgba(hex: string, alpha: number): string {
  const value = hex.replace('#', '')
  const r = parseInt(value.substring(0, 2), 16)
  const g = parseInt(value.substring(2, 4), 16)
  const b = parseInt(value.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

function getLevel(minutes: number, max: number): number {
  if (minutes <= 0 || max <= 0) return 0
  const ratio = minutes / max
  if (ratio <= 0.25) return 1
  if (ratio <= 0.5) return 2
  if (ratio <= 0.75) return 3
  return 4
}

// 'yyyy-MM-dd' -> Date（用本地時區建構，避免 UTC 位移造成星期幾算錯）
function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

type Cell = UsageHeatmapPoint | null

function buildWeeks(heatmap: UsageHeatmapPoint[]): Cell[][] {
  if (heatmap.length === 0) return []

  const firstDay = parseDate(heatmap[0].date).getDay()
  const cells: Cell[] = [...Array(firstDay).fill(null), ...heatmap]

  const weeks: Cell[][] = []
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7))
  }
  return weeks
}

function getMonthLabels(weeks: Cell[][]): string[] {
  const labels: string[] = []
  let lastMonth = -1

  for (const week of weeks) {
    const firstCell = week.find((cell): cell is UsageHeatmapPoint => cell !== null)
    if (!firstCell) {
      labels.push('')
      continue
    }
    const month = parseDate(firstCell.date).getMonth()
    if (month !== lastMonth) {
      labels.push(MONTH_LABELS[month])
      lastMonth = month
    } else {
      labels.push('')
    }
  }

  return labels
}

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
    <div className="flex h-[160px] items-center justify-center text-sm text-[#a08060]">
      尚無使用紀錄
    </div>
  )
}

export default function UsageHeatmap({ heatmap }: Props) {
  const weeks = buildWeeks(heatmap)
  const monthLabels = getMonthLabels(weeks)
  const max = heatmap.reduce((m, p) => Math.max(m, p.totalMinutes), 0)

  return (
    <div className="mb-6">
      <ChartCard title="每日使用熱點圖">
        {heatmap.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto pb-2">
            <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
              {/* 月份標籤 */}
              <div style={{ display: 'flex', gap: CELL_GAP, paddingLeft: 24 }}>
                {monthLabels.map((label, i) => (
                  <div
                    key={i}
                    style={{ width: CELL_SIZE, fontSize: 10 }}
                    className="text-[#a08060] whitespace-nowrap overflow-visible"
                  >
                    {label}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: CELL_GAP }}>
                {/* 星期標籤 */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP, width: 20 }}>
                  {WEEKDAY_LABELS.map((label, i) => (
                    <div
                      key={i}
                      style={{ height: CELL_SIZE, fontSize: 10, lineHeight: `${CELL_SIZE}px` }}
                      className="text-[#a08060]"
                    >
                      {i % 2 === 1 ? label : ''}
                    </div>
                  ))}
                </div>

                {/* 週欄位 */}
                {weeks.map((week, weekIdx) => (
                  <div key={weekIdx} style={{ display: 'flex', flexDirection: 'column', gap: CELL_GAP }}>
                    {week.map((cell, dayIdx) => {
                      if (!cell) {
                        return (
                          <div
                            key={dayIdx}
                            style={{ width: CELL_SIZE, height: CELL_SIZE }}
                          />
                        )
                      }
                      const level = getLevel(cell.totalMinutes, max)
                      return (
                        <div
                          key={dayIdx}
                          className="group relative"
                          style={{ width: CELL_SIZE, height: CELL_SIZE }}
                        >
                          <div
                            className="rounded-[2px] w-full h-full"
                            style={{ backgroundColor: hexToRgba(BASE_COLOR, LEVEL_OPACITIES[level]) }}
                          />
                          <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded bg-[#3a2a1c] px-2 py-1 text-xs text-white group-hover:block">
                            {cell.date}：{formatMinutes(cell.totalMinutes)}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>

              {/* 圖例 */}
              <div className="flex items-center gap-1 self-end text-xs text-[#a08060]">
                <span>少</span>
                {LEVEL_OPACITIES.map((opacity, i) => (
                  <div
                    key={i}
                    className="rounded-[2px]"
                    style={{
                      width: CELL_SIZE,
                      height: CELL_SIZE,
                      backgroundColor: hexToRgba(BASE_COLOR, opacity),
                    }}
                  />
                ))}
                <span>多</span>
              </div>
            </div>
          </div>
        )}
      </ChartCard>
    </div>
  )
}
