'use client'
// 搜尋命中效果（庫存條碼搜尋同款）：結果標亮、自動捲到第一筆並閃動、上方顯示「找到 N 筆・定位」。
// 用法：命中的列加 data-search-hit；清單外層掛 ref；搜尋狀態傳進 useAutoLocate。
import { useEffect, type RefObject } from 'react'

export function locateFirstHit(root: HTMLElement | null) {
  const el = root?.querySelector<HTMLElement>('[data-search-hit]')
  if (!el) return
  el.scrollIntoView({ block: 'center', behavior: 'smooth' })
  el.classList.remove('search-hit-pulse')
  void el.offsetWidth // 重新啟動動畫
  el.classList.add('search-hit-pulse')
}

/** 搜尋字穩定 350ms 後，自動捲到第一筆命中。signal＝結果有變時會跟著變的字串（視圖、命中數、展開狀態等）。 */
export function useAutoLocate(ref: RefObject<HTMLElement>, query: string, signal: string) {
  useEffect(() => {
    if (!query.trim()) return
    const t = setTimeout(() => locateFirstHit(ref.current), 350)
    return () => clearTimeout(t)
  }, [ref, query, signal])
}

export default function SearchHitBanner({ query, count, unit, onLocate }: { query: string; count: number; unit: string; onLocate: () => void }) {
  if (!query.trim() || count === 0) return null
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border-[1.5px] border-[#7a5230] bg-[#fff8ee] px-3 py-1.5 text-xs text-[#4a3422]">
      <span>搜尋「<b>{query.trim()}</b>」：找到 <b>{count}</b> {unit}</span>
      <button type="button" onClick={onLocate} className="ml-auto text-[11px] text-[#7a5230] underline">定位到第一筆 ↓</button>
    </div>
  )
}
