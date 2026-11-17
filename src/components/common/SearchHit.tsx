'use client'
// 搜尋命中：命中的字用 HighlightText 螢光筆標示，上方只顯示「找到 N 筆」。

export default function SearchHitBanner({ query, count, unit }: { query: string; count: number; unit: string }) {
  if (!query.trim() || count === 0) return null
  return (
    <div className="mb-2 rounded-lg border border-[#e8ddd0] bg-white px-3 py-1.5 text-xs text-[#4a3422]">
      搜尋「<b>{query.trim()}</b>」：找到 <b>{count}</b> {unit}
    </div>
  )
}
