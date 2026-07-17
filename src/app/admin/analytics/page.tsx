import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requirePermission } from '@/lib/admin'
import { getUsageAnalyticsSummary, getUsageGrowthTrend } from '@/lib/analytics'
import AnalyticsClient from '@/components/AnalyticsClient'
import AnalyticsTrendCharts from '@/components/AnalyticsTrendCharts'
import UsageLeaderboard from '@/components/UsageLeaderboard'
import { ArrowLeft, BarChart3 } from 'lucide-react'

export default async function AnalyticsPage() {
  const user = await requirePermission('view_analytics')
  if (!user) redirect('/')

  const [analyticsData, trendData] = await Promise.all([
    getUsageAnalyticsSummary(),
    getUsageGrowthTrend(),
  ])

  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/" className="text-[#a08060] hover:text-[#7a5230] transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-[#7a5230]" />
            <h1 className="text-xl font-bold text-[#7a5230]">使用統計</h1>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <AnalyticsTrendCharts trend={trendData} />
        <UsageLeaderboard rows={analyticsData} />
        <AnalyticsClient initialData={analyticsData} />
      </div>
    </main>
  )
}
