'use client'

import { useCallback, useEffect } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'

interface ImageItem {
  public_id: string
  url: string
}

interface Props {
  images: ImageItem[]
  index: number
  onIndexChange: (index: number) => void
  onClose: () => void
}

// 更新紀錄圖片的獨立輕量放大檢視元件。
// 不沿用 CardDetailDialog（核心保護元件，用途是料卡照片輪播），
// 這裡只需要「全螢幕看單張圖＋左右切換」，全黑遮罩讓圖片本身更清楚。
export default function UpdateImageLightbox({ images, index, onIndexChange, onClose }: Props) {
  const hasMultiple = images.length > 1

  const goPrev = useCallback(() => {
    if (!hasMultiple) return
    onIndexChange((index - 1 + images.length) % images.length)
  }, [hasMultiple, index, images.length, onIndexChange])

  const goNext = useCallback(() => {
    if (!hasMultiple) return
    onIndexChange((index + 1) % images.length)
  }, [hasMultiple, index, images.length, onIndexChange])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, goPrev, goNext])

  const current = images[index]
  if (!current) return null

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 px-4 py-6"
      onClick={onClose}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onClose() }}
        className="absolute top-4 right-4 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
        title="關閉"
      >
        <X className="h-5 w-5" />
      </button>

      {hasMultiple && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); goPrev() }}
            className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="上一張"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); goNext() }}
            className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 rounded-full text-white/80 hover:text-white hover:bg-white/10 transition-colors"
            title="下一張"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        </>
      )}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current.url}
        alt=""
        className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      />

      {hasMultiple && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-xs text-white/70 bg-black/40 px-3 py-1 rounded-full">
          {index + 1} / {images.length}
        </div>
      )}
    </div>
  )
}
