import type { UsageHeatmapPoint } from './analytics'

export interface CumulativeDurationPoint {
  period: string // 日粒度用 'yyyy-MM-dd'，月粒度用 'yyyy-MM'
  cumulativeMinutes: number
}

// 把「每日原始分鐘數」轉換成「累計分鐘數」序列，日/月兩種粒度。
// 純函式，不呼叫任何資料庫或非同步 API，僅在前端對現有的 heatmap 資料做彙總運算。
export function buildCumulativeDurationSeries(
  heatmap: UsageHeatmapPoint[],
): { daily: CumulativeDurationPoint[]; monthly: CumulativeDurationPoint[] } {
  if (heatmap.length === 0) {
    return { daily: [], monthly: [] }
  }

  // 日粒度：heatmap 已依日期排序、每天一筆（缺資料日期已補 0），逐日累加即可
  let runningTotal = 0
  const daily: CumulativeDurationPoint[] = heatmap.map((point) => {
    runningTotal += point.totalMinutes
    return { period: point.date, cumulativeMinutes: runningTotal }
  })

  // 月粒度：先依 'yyyy-MM' 分組加總，再依月份排序後累加
  const monthlyTotals = new Map<string, number>()
  for (const point of heatmap) {
    const monthKey = point.date.slice(0, 7)
    monthlyTotals.set(monthKey, (monthlyTotals.get(monthKey) ?? 0) + point.totalMinutes)
  }

  const sortedMonthKeys = Array.from(monthlyTotals.keys()).sort()

  let runningMonthlyTotal = 0
  const monthly: CumulativeDurationPoint[] = sortedMonthKeys.map((monthKey) => {
    runningMonthlyTotal += monthlyTotals.get(monthKey) ?? 0
    return { period: monthKey, cumulativeMinutes: runningMonthlyTotal }
  })

  return { daily, monthly }
}
