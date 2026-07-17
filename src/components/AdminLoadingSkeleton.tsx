import type { CSSProperties } from 'react'
import { ArrowLeft, type LucideIcon } from 'lucide-react'

interface Props {
  icon: LucideIcon
  title: string
  maxWidthClassName?: string
  rows?: number
}

// Admin 子頁面共用的載入骨架畫面：先渲染跟目標頁一致的 header，只讓內容區塊呈現 pulse skeleton，
// 讓頁面切換/返回時立即有視覺回饋，不用空白等 RSC 資料回來
export default function AdminLoadingSkeleton({ icon: Icon, title, maxWidthClassName = 'max-w-4xl', rows = 6 }: Props) {
  return (
    <main className="min-h-screen bg-[#faf6f0]">
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className={`${maxWidthClassName} mx-auto px-4 py-4 flex items-center gap-3`}>
          <span className="text-[#a08060]">
            <ArrowLeft className="h-5 w-5" />
          </span>
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-[#7a5230] skeleton-icon-pulse" />
            <h1 className="text-xl font-bold text-[#7a5230]">{title}</h1>
          </div>
        </div>
      </header>

      <div className={`${maxWidthClassName} mx-auto px-4 py-8 flex flex-col gap-2`}>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="skeleton-shimmer-admin h-14 rounded-lg border border-[rgba(122,82,48,.1)] bg-white shadow-sm"
            style={{ '--skeleton-delay': `${i * 0.12}s` } as CSSProperties}
          />
        ))}
      </div>
    </main>
  )
}
