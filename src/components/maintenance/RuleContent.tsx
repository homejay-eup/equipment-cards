'use client'

import { useState, useRef, useLayoutEffect, useCallback, Fragment } from 'react'
import LinkifiedText from '@/components/tracker/LinkifiedText'
import RichTable from '@/components/tracker/RichTable'
import type { RichImage, TableData } from '@/components/tracker/richContentTypes'

const CLAMP_LINES = 3
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

function isOverflowing(el: HTMLElement): boolean {
  const lh = parseFloat(getComputedStyle(el).lineHeight) || 22
  return el.scrollHeight > lh * CLAMP_LINES + 2
}

interface Props {
  content: string
  images: RichImage[]
  table: TableData | null
  /** 搜尋關鍵字（原樣字串，內部不分大小寫比對） */
  searchQuery: string
  /** 搜尋命中被收合的表格時由父層傳入；內文被收合的命中由本元件自行量測 */
  forceExpanded: boolean
  onImageClick: (index: number) => void
}

// 規則內容：文字預設收合 3 行（超過才出現「展開全文」）、圖片縮圖列、表格預設隱藏（顯示列數提示）。
export default function RuleContent({ content, images, table, searchQuery, forceExpanded, onImageClick }: Props) {
  const [expanded, setExpanded] = useState(false)
  const [overflowing, setOverflowing] = useState(false)
  const textRef = useRef<HTMLDivElement>(null)
  const autoKeyRef = useRef('')
  // 這個展開是否由搜尋自動觸發（清除搜尋時只還原自動展開的，使用者手動操作過就不動）
  const autoExpandedRef = useRef(false)

  const measure = useCallback(() => {
    const el = textRef.current
    setOverflowing(!!el && isOverflowing(el))
  }, [])

  // 內容或展開狀態變動時重新量測；視窗寬度改變（換行位置不同）時也要重新量測
  useLayoutEffect(() => { measure() }, [content, expanded, measure])
  useLayoutEffect(() => {
    const el = textRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measure())
    ro.observe(el)
    return () => ro.disconnect()
  }, [measure, content])

  // 搜尋命中被收合的內文或表格時預設展開。只在「搜尋字串／命中型態」改變時判斷一次，
  // 使用者之後手動收合會被尊重（不會在每次 render 又強制展開）。
  useLayoutEffect(() => {
    const q = searchQuery.trim()
    if (!q) {
      autoKeyRef.current = ''
      if (autoExpandedRef.current) { autoExpandedRef.current = false; setExpanded(false) }
      return
    }
    const key = `${q}|${forceExpanded}`
    if (autoKeyRef.current === key) return
    autoKeyRef.current = key
    let need = forceExpanded
    const el = textRef.current
    if (!need && el && isOverflowing(el)) {
      const marks = el.querySelectorAll('mark')
      if (marks.length > 0) {
        const limit = el.getBoundingClientRect().top + el.clientHeight + 1
        need = !Array.from(marks).some(m => m.getBoundingClientRect().bottom <= limit)
      }
    }
    if (need) { autoExpandedRef.current = true; setExpanded(true) }
  }, [searchQuery, forceExpanded, content])

  const hasText = content.trim() !== ''
  const tableRows = table?.rows?.length ?? 0
  const canToggle = overflowing || tableRows > 0
  if (!hasText && images.length === 0 && tableRows === 0) return null

  return (
    <div className="mt-1.5 min-w-0">
      {hasText && (
        <div
          ref={textRef}
          className="relative text-[13px] leading-[1.75] text-[#4a3422] whitespace-pre-wrap break-words [overflow-wrap:anywhere]"
          style={expanded ? undefined : {
            display: '-webkit-box',
            WebkitLineClamp: CLAMP_LINES,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
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
              className={`${expanded ? 'h-24 w-24' : 'h-16 w-16'} flex-shrink-0 overflow-hidden rounded-md border border-[rgba(122,82,48,.15)] bg-[#f6efe4] hover:border-[#c49a72] transition-colors`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      )}

      {expanded && table && tableRows > 0 && (
        <div className="mt-2 max-w-full overflow-x-auto">
          <RichTable data={table} />
        </div>
      )}

      {canToggle && (
        <div className="mt-[3px] flex flex-wrap items-center gap-x-2.5">
          <button
            type="button"
            onClick={() => { autoExpandedRef.current = false; setExpanded(v => !v) }}
            aria-expanded={expanded}
            className="text-xs text-[#7a5230] hover:text-[#9c6b42] hover:underline underline-offset-2"
          >
            {expanded ? '收合' : (overflowing ? '展開全文' : '展開表格')}
          </button>
          {!expanded && tableRows > 0 && <span className="text-xs text-[#a08060]">含表格 {tableRows} 列</span>}
        </div>
      )}
    </div>
  )
}
