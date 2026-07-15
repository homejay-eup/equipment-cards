'use client'

import type { UsageAnalyticsRow } from '@/lib/analytics'

interface Props {
  initialData: UsageAnalyticsRow[]
}

// 秒數格式化成「X 小時 Y 分」或「X 分鐘」，避免顯示原始秒數
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分鐘`
  if (minutes === 0) return `${hours} 小時`
  return `${hours} 小時 ${minutes} 分`
}

export default function AnalyticsClient({ initialData }: Props) {
  return (
    <div>
      <div className="mb-3 text-sm text-[#a08060]">
        共 {initialData.length} 位使用者
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
        {initialData.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#a08060]">尚無使用統計資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.12)]">
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">登入次數</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">總停留時長</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">平均停留時長</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">料卡搜尋次數</th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">料卡瀏覽次數</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(122,82,48,.08)]">
                {initialData.map(row => (
                  <tr key={row.email} className="hover:bg-[rgba(122,82,48,.03)] transition-colors">
                    <td className="px-4 py-3 text-[#2c1e12] whitespace-nowrap">{row.email}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.loginCount}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.totalDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.averageDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_search'] ?? 0}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_detail_view'] ?? 0}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
