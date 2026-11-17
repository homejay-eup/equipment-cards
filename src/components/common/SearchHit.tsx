'use client'
// 搜尋命中：命中的字用 HighlightText 螢光筆標示、命中列左側一條細線（data-search-hit）、上方顯示「找到 N 筆」。
// 不再自動捲動或閃動；要跳到第一筆由使用者按「定位到第一筆」。

export function locateFirstHit(root: HTMLElement | null) {
  const el = root?.querySelector<HTMLElement>('[data-search-hit]')
  el?.scrollIntoView({ block: 'center' })
}

export default function SearchHitBanner({ query, count, unit, onLocate }: { query: string; count: number; unit: string; onLocate: () => void }) {
  if (!query.trim() || count === 0) return null
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-[#e8ddd0] bg-white px-3 py-1.5 text-xs text-[#4a3422]">
      <span>搜尋「<b>{query.trim()}</b>」：找到 <b>{count}</b> {unit}</span>
      <button type="button" onClick={onLocate} className="ml-auto text-[11px] text-[#7a5230] underline">定位到第一筆 ↓</button>
    </div>
  )
}
