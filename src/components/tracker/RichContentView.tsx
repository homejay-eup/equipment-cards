'use client'

import type { RichImage, TableData } from './richContentTypes'
import RichTable from './RichTable'

interface Props {
  content: string | null
  images: RichImage[]
  table: TableData | null
  onImageClick?: (images: RichImage[], index: number) => void
}

// 唯讀顯示版本：文字 + 圖片縮圖列（可選 lightbox 觸發）+ 真表格渲染。
// 任務「說明」欄位跟更新紀錄清單項目共用，三個區塊各自依有無資料決定是否渲染。
// 文字/圖片/表格樣式固定在這裡，呼叫端只需負責外層是否要加標籤或背景卡片。
export default function RichContentView({ content, images, table, onImageClick }: Props) {
  return (
    <>
      {content && (
        <p className="text-sm text-[#4a3422] leading-relaxed whitespace-pre-wrap">{content}</p>
      )}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {images.map((img, idx) => (
            <button
              key={img.public_id}
              type="button"
              onClick={() => onImageClick?.(images, idx)}
              disabled={!onImageClick}
              className="w-16 h-16 rounded-lg overflow-hidden border border-[rgba(122,82,48,.15)] hover:opacity-80 transition-opacity disabled:cursor-default disabled:hover:opacity-100"
              title={onImageClick ? '點擊放大' : undefined}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.url} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}
      {table && (
        <div className="mt-2 border border-[rgba(122,82,48,.12)] rounded-lg overflow-x-auto">
          <RichTable data={table} />
        </div>
      )}
    </>
  )
}
