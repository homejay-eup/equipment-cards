import { Package } from 'lucide-react'

export default function Loading() {
  return (
    <main className="min-h-screen bg-[#faf6f0]">
      {/* 模擬凍結列：標題列 + 搜尋 + 篩選 */}
      <div className="sticky top-0 z-40 bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] shadow-sm">
        <div className="max-w-7xl mx-auto px-4 pt-2 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-[#7a5230] skeleton-icon-pulse" />
            <h1 className="text-xl font-bold text-[#7a5230] whitespace-nowrap">設備料卡管理系統</h1>
          </div>
          <div className="skeleton-shimmer h-7 w-7 rounded-full" />
        </div>

        <div className="max-w-7xl mx-auto px-4 pt-0 pb-3">
          {/* Tab 骨架 */}
          <div className="flex flex-wrap gap-1 mb-2">
            <div className="skeleton-shimmer h-8 w-24 rounded-full" />
            <div className="skeleton-shimmer h-8 w-20 rounded-full hidden sm:block" />
            <div className="skeleton-shimmer h-8 w-20 rounded-full hidden sm:block" />
          </div>

          {/* 搜尋列骨架 */}
          <div className="flex gap-2 mb-2">
            <div className="skeleton-shimmer flex-1 h-9 rounded-md" />
            <div className="skeleton-shimmer h-9 w-20 rounded-md" />
            <div className="skeleton-shimmer h-9 w-28 rounded-md hidden sm:block" />
            <div className="skeleton-shimmer h-9 w-9 rounded-md" />
          </div>

          {/* 篩選按鈕骨架 */}
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton-shimmer h-7 w-16 rounded-full" />
            ))}
          </div>
        </div>
      </div>

      {/* 卡片網格骨架：欄數比照 PhotoWall 實際網格 */}
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
        <div className="skeleton-shimmer h-4 w-40 rounded mb-4" />
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {Array.from({ length: 18 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
              <div className="skeleton-shimmer aspect-square" />
              <div className="p-2.5 space-y-2">
                <div className="skeleton-shimmer h-3.5 w-3/4 rounded" />
                <div className="skeleton-shimmer h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  )
}
