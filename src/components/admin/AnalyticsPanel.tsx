'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import type { UsageAnalyticsRow, UsageHeatmapPoint } from '@/lib/analytics'
import AnalyticsClient from '@/components/AnalyticsClient'
import UsageHeatmap from '@/components/UsageHeatmap'
import CumulativeDurationChart from '@/components/CumulativeDurationChart'
import UsageLeaderboard from '@/components/UsageLeaderboard'

interface AnalyticsData {
  rows: UsageAnalyticsRow[]
  heatmap: UsageHeatmapPoint[]
}

interface Props {
  isActive: boolean
}

// Step 40：使用統計子分頁。版面照搬原 src/app/admin/analytics/page.tsx 的組裝方式，
// 只是資料來源從 Server Component props 改成 client fetch 既有 GET /api/admin/analytics。
export default function AnalyticsPanel({ isActive }: Props) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/analytics')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? '載入失敗'); return }
      setData(d)
    } catch {
      setError('載入失敗，請重試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#a08060]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!data && error) {
    return <p className="max-w-4xl mx-auto px-4 py-8 text-sm text-[#b5451b]">{error}</p>
  }

  if (!data) return null

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <UsageHeatmap heatmap={data.heatmap} />
      <CumulativeDurationChart heatmap={data.heatmap} />
      <UsageLeaderboard rows={data.rows} />
      <AnalyticsClient initialData={data.rows} />
    </div>
  )
}
