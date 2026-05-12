'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minimize2, Pencil } from 'lucide-react'

interface Props {
  card: EquipmentCard
  open: boolean
  onClose: () => void
  activeStatus: string
  isAdmin?: boolean
  onEdit?: () => void
}

const SWIPE_THRESHOLD = 50

export default function CardDetailDialog({ card, open, onClose, activeStatus, isAdmin, onEdit }: Props) {
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖' }] : []),
    ...card.detail_photos.map((p, i) => ({ url: p.url, label: `細節 ${i + 1}` })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const thumbScrollRef = useRef<HTMLDivElement>(null)

  const prev = () => setPhotoIndex(i => (i - 1 + allPhotos.length) % allPhotos.length)
  const next = () => setPhotoIndex(i => (i + 1) % allPhotos.length)

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || allPhotos.length <= 1) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) next(); else prev()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  const isActive = card.status === activeStatus || card.status === 'active'

  /* ── 共用照片區 JSX ── */
  function PhotoArea({ sizes, minHeight }: { sizes: string; minHeight?: string }) {
    return (
      <div
        className="relative flex-1"
        style={{ minHeight: minHeight ?? '200px', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {allPhotos.length > 0 ? (
          <>
            <Image
              key={allPhotos[photoIndex].url}
              src={allPhotos[photoIndex].url}
              alt={card.name}
              fill
              sizes={sizes}
              className="object-contain"
              priority
            />
            {allPhotos.length > 1 && (
              <>
                <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.35)] hover:bg-[rgba(44,30,18,.6)] text-white rounded-full p-1.5 transition-colors">
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.35)] hover:bg-[rgba(44,30,18,.6)] text-white rounded-full p-1.5 transition-colors">
                  <ChevronRight className="h-5 w-5" />
                </button>
              </>
            )}
            <span className="absolute top-3 left-3 bg-[rgba(44,30,18,.55)] text-[#f2ebe0] text-xs px-2 py-0.5 rounded-full pointer-events-none">
              {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
            </span>
          </>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[#c49a72]">
            <ImageOff className="h-12 w-12" />
          </div>
        )}
      </div>
    )
  }

  /* ── 縮圖列（含左右按鈕） ── */
  function ThumbnailStrip() {
    if (allPhotos.length <= 1) return null
    return (
      <div className="flex items-center bg-[#e8ddd0] flex-shrink-0 border-t border-[rgba(122,82,48,.1)]">
        <button
          onClick={() => thumbScrollRef.current?.scrollBy({ left: -112, behavior: 'smooth' })}
          className="flex-shrink-0 px-1.5 py-2 text-[#a08060] hover:text-[#7a5230] transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div
          ref={thumbScrollRef}
          className="flex gap-1.5 py-2 overflow-x-auto flex-1"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {allPhotos.map((photo, i) => (
            <button key={i} onClick={() => setPhotoIndex(i)}
              className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-colors ${i === photoIndex ? 'border-[#c49a72]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
              <Image src={photo.url} alt="" fill sizes="56px" className="object-cover" />
            </button>
          ))}
        </div>
        <button
          onClick={() => thumbScrollRef.current?.scrollBy({ left: 112, behavior: 'smooth' })}
          className="flex-shrink-0 px-1.5 py-2 text-[#a08060] hover:text-[#7a5230] transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className={`w-full p-0 transition-all duration-200 ${expanded ? 'max-w-[min(90vh,90vw)] overflow-hidden' : 'max-w-5xl overflow-y-auto max-h-[90vh] md:overflow-hidden'}`}>

        {/* 編輯按鈕（管理員） */}
        {isAdmin && onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-3 right-[4.75rem] z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
            aria-label="編輯料卡"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}

        {/* 放大／縮小按鈕 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="absolute top-3 right-11 z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
          aria-label={expanded ? '縮小視窗' : '放大視窗'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {expanded ? (
          /* ── 放大模式 ── */
          <div className="bg-[#f2ebe0] flex flex-col" style={{ height: 'min(90vh, 90vw)' }}>
            <PhotoArea sizes="min(90vh, 90vw)" minHeight="0" />
            <div className="bg-[#e8ddd0] px-4 py-3 border-t border-[rgba(122,82,48,.2)] text-center flex-shrink-0">
              <p className="text-xs text-[#a08060] font-mono leading-none">{card.equipment_id}</p>
              <p className="text-base font-bold text-[#5a3820] mt-1 leading-snug">{card.name}</p>
            </div>
            <ThumbnailStrip />
          </div>
        ) : (
          /* ── 一般模式 ── */
          /* 手機：上下流動（照片固定高，資訊自適應）；桌機：左右並排固定高 */
          <div className="flex flex-col md:flex-row md:h-[min(85vh,680px)]">

            {/* 照片區：手機固定 60vw 高，桌機佔 3/5 寬 */}
            <div className="bg-[#f2ebe0] flex-shrink-0 flex flex-col h-[60vw] md:h-auto md:w-3/5">
              <PhotoArea sizes="(max-width: 768px) 100vw, 400px" />
            </div>

            {/* 資訊區：手機自適應，桌機固定剩餘空間 */}
            <div className="flex flex-col md:flex-1 md:overflow-hidden md:min-h-0">
              <div className="md:flex-1 md:overflow-y-auto">
                <DialogHeader className="px-4 pt-3 pb-2 md:px-5 md:pt-5 md:pb-3 border-b border-[rgba(122,82,48,.12)] md:pr-14">
                  <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                  <DialogTitle className="text-sm md:text-base font-bold text-[#5a3820] mt-0.5 leading-snug">
                    {card.name}
                  </DialogTitle>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'glow-wood' : ''}>
                      {card.status}
                    </Badge>
                    {card.category && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                        {card.category}
                      </span>
                    )}
                    {card.vendor && (
                      <span className="text-xs text-[#a08060]">· {card.vendor}</span>
                    )}
                  </div>
                </DialogHeader>

                <div className="px-4 py-2 md:px-5 md:py-4 space-y-2 md:space-y-4">
                  {card.tags.length > 0 && (
                    <div>
                      <p className="text-xs text-[#a08060] mb-1">標籤</p>
                      <div className="flex flex-wrap gap-1">
                        {card.tags.map(tag => (
                          <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {card.notes && (
                    <div>
                      <p className="text-xs text-[#a08060] mb-1">備註</p>
                      <p className="text-xs md:text-sm text-[#4a3422] whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* 縮圖列 */}
              <ThumbnailStrip />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
