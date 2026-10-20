'use client'

import { Fragment } from 'react'
import LinkifiedText from '@/components/tracker/LinkifiedText'
import RichTable from '@/components/tracker/RichTable'
import type { RichImage, TableData } from '@/components/tracker/richContentTypes'
import { contentSummary } from '@/lib/maintenanceFormat'

// 與 LinkifiedText 內部的網址規則一致：網址整段交給它處理，不被搜尋標示拆開
const URL_SPLIT = /(https?:\/\/[^\s<>"'，。；：！？、）」』】》]+)/g

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 純文字（無連結）的搜尋標示：命中處以淡黃底 <mark> 包起來。 */
export function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  if (!q) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRegExp(q)})`, 'gi'))
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <mark key={i} className="bg-[#fde9a8] text-inherit rounded-[3px] px-px">{p}</mark>
        : <Fragment key={i}>{p}</Fragment>))}
    </>
  )
}

// 內文：先把網址切出來整段交給 LinkifiedText，其餘純文字才做搜尋標示（命中落在網址內則不標示）
function ContentText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <LinkifiedText text={text} />
  const parts = text.split(URL_SPLIT)
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1
        ? <LinkifiedText key={i} text={p} />
        : <HighlightText key={i} text={p} query={query} />))}
    </>
  )
}

interface Props {
  content: string
  images: RichImage[]
  table: TableData | null
  /** 搜尋關鍵字（原樣字串，內部不分大小寫比對） */
  searchQuery: string
  /** 由規則列（RuleRow）控制：收合＝只顯示單行摘要；展開＝完整內文、圖片、表格 */
  expanded: boolean
  onImageClick: (index: number) => void
}

// 規則內容（受控顯示元件，Step 52）：展開／收合與搜尋自動展開都由 RuleRow 負責。
export default function RuleContent({ content, images, table, searchQuery, expanded, onImageClick }: Props) {
  const hasText = content.trim() !== ''
  const tableRows = table?.rows?.length ?? 0

  if (!expanded) {
    if (!hasText) return null
    const { first, multiline } = contentSummary(content)
    return (
      <div className="mt-1.5 flex min-w-0 text-[13px] leading-[1.75] text-[#7a6350]">
        <span className="min-w-0 truncate"><ContentText text={first} query={searchQuery} /></span>
        {multiline && <span className="flex-shrink-0 pl-1" aria-hidden="true">…</span>}
      </div>
    )
  }

  if (!hasText && images.length === 0 && tableRows === 0) return null

  return (
    <div className="mt-1.5 min-w-0">
      {hasText && (
        <div className="text-[13px] leading-[1.75] text-[#4a3422] whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
          <ContentText text={content} query={searchQuery} />
        </div>
      )}

      {images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {images.map((img, i) => (
            <button
              key={img.public_id}
              type="button"
              onClick={() => onImageClick(i)}
              title="點擊放大"
              aria-label={`放大圖片 ${i + 1}`}
              className="h-24 w-24 flex-shrink-0 overflow-hidden rounded-md border border-[rgba(122,82,48,.15)] bg-[#f6efe4] hover:border-[#c49a72] transition-colors"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {table && tableRows > 0 && (
        <div className="mt-2 max-w-full overflow-x-auto">
          <RichTable data={table} />
        </div>
      )}
    </div>
  )
}
