'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minimize2 } from 'lucide-react'

interface Props {
  card: EquipmentCard
  open: boolean
  onClose: () => void
  activeStatus: string
}

const SWIPE_THRESHOLD = 50

export default function CardDetailDialog({ card, open, onClose, activeStatus }: Props) {
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖' }] : []),
    ...card.detail_photos.map((p, i) => ({ url: p.url, label: `細節 ${i + 1}` })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)

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
      dx < 0 ? next() : prev()
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

  function ThumbnailStrip() {
    if (allPhotos.length <= 1) return null
    return (
      <div className="flex gap-1.5 p-2 overflow-x-auto bg-[#e8ddd0] flex-shrink-0">
        {allPhotos.map((photo, i) => (
          <button key={i} onClick={() => setPhotoIndex(i)}
            className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-colors ${i === photoIndex ? 'border-[#c49a72]' : 'border-transparent opacity-60 hover:opacity-100'}`}>
            <Image src={photo.url} alt="" fill sizes="56px" className="object-cover" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className={`w-full p-0 overflow-hidden transition-all duration-200 ${expanded ? 'max-w-[min(90vh,90vw)]' : 'max-w-3xl'}`}>

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
            <ThumbnailStrip />
            <PhotoArea sizes="min(90vh, 90vw)" minHeight="0" />
            <div className="bg-[#e8ddd0] px-4 py-3 border-t border-[rgba(122,82,48,.2)] text-center flex-shrink-0">
              <p className="text-xs text-[#a08060] font-mono leading-none">{card.equipment_id}</p>
              <p className="text-base font-bold text-[#2c1e12] mt-1 leading-snug">{card.name}</p>
            </div>
          </div>
        ) : (
          /* ── 一般模式：左右並排 ── */
          <div className="flex flex-col md:flex-row h-full max-h-[90vh]">
            {/* 左側：照片區 */}
            <div className="bg-[#f2ebe0] md:w-1/2 flex-shrink-0 flex flex-col">
              <ThumbnailStrip />
              <PhotoArea sizes="(max-width: 768px) 100vw, 400px" />
            </div>

            {/* 右側：資訊區 */}
            <div className="flex flex-col flex-1 overflow-y-auto">
              <DialogHeader className="px-5 pt-5 pb-3 border-b border-[rgba(122,82,48,.12)] pr-14">
                <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                <DialogTitle className="text-base font-bold text-[#2c1e12] mt-0.5 leading-snug">
                  {card.name}
                </DialogTitle>
                <div className="mt-1.5">
                  <Badge variant={isActive ? 'default' : 'secondary'} className={isActive ? 'glow-wood' : ''}>
                    {card.status}
                  </Badge>
                </div>
              </DialogHeader>

              <div className="px-5 py-4 space-y-4 flex-1">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                  {card.category && <InfoRow label="分類" value={card.category} />}
                  {card.vendor   && <InfoRow label="廠商" value={card.vendor} />}
                </div>

                {card.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1.5">標籤</p>
                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {card.notes && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">備註</p>
                    <p className="text-sm text-[#4a3422] whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                  </div>
                )}

                <div className="pt-2 border-t border-[rgba(122,82,48,.1)] text-xs text-[#a08060] space-y-0.5">
                  <p>主照片：{card.main_photo ? '1 張' : '無'}</p>
                  <p>細節照片：{card.detail_photos.length} 張</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[#a08060]">{label}</p>
      <p className="text-sm font-medium text-[#2c1e12]">{value}</p>
    </div>
  )
}
