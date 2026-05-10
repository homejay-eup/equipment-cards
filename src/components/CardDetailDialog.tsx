'use client'

import { useState } from 'react'
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

export default function CardDetailDialog({ card, open, onClose, activeStatus }: Props) {
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖' }] : []),
    ...card.detail_photos.map((p, i) => ({ url: p.url, label: `細節 ${i + 1}` })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const prev = () => setPhotoIndex(i => (i - 1 + allPhotos.length) % allPhotos.length)
  const next = () => setPhotoIndex(i => (i + 1) % allPhotos.length)

  const isActive = card.status === activeStatus || card.status === 'active'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* 放大模式：純照片視窗（約正方形，適合截圖）；一般模式：左右並排 */}
      <DialogContent className={`w-full p-0 overflow-hidden transition-all duration-200 ${expanded ? 'max-w-[min(90vh,90vw)]' : 'max-w-3xl'}`}>

        {/* 放大／縮小按鈕 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="absolute top-3 right-11 z-50 rounded-full bg-white/90 backdrop-blur-sm p-1.5 shadow text-gray-600 opacity-90 hover:opacity-100 hover:text-gray-900 transition-opacity"
          aria-label={expanded ? '縮小視窗' : '放大視窗'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {expanded ? (
          /* ── 放大模式：照片填滿，品號/品名置中在下方 ── */
          <div className="bg-gray-900 flex flex-col" style={{ height: 'min(90vh, 90vw)' }}>
            {/* 縮圖列（上方） */}
            {allPhotos.length > 1 && (
              <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-800 flex-shrink-0">
                {allPhotos.map((photo, i) => (
                  <button key={i} onClick={() => setPhotoIndex(i)}
                    className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-colors ${i === photoIndex ? 'border-blue-400' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                    <Image src={photo.url} alt="" fill sizes="56px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}

            {/* 照片區 */}
            <div className="relative flex-1 min-h-0">
              {allPhotos.length > 0 ? (
                <>
                  <Image
                    key={allPhotos[photoIndex].url}
                    src={allPhotos[photoIndex].url}
                    alt={card.name}
                    fill
                    sizes="min(90vh, 90vw)"
                    className="object-contain"
                    priority
                  />
                  {allPhotos.length > 1 && (
                    <>
                      <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                      <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    </>
                  )}
                  <span className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                    {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
                  </span>
                </>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                  <ImageOff className="h-12 w-12" />
                </div>
              )}
            </div>

            {/* 品號 + 品名 */}
            <div className="bg-gray-900 px-4 py-3 border-t border-gray-700 text-center flex-shrink-0">
              <p className="text-xs text-gray-400 font-mono leading-none">{card.equipment_id}</p>
              <p className="text-base font-bold text-white mt-1 leading-snug">{card.name}</p>
            </div>
          </div>
        ) : (
          /* ── 一般模式：左右並排 ── */
          <div className="flex flex-col md:flex-row h-full max-h-[90vh]">

            {/* 左側：照片區 */}
            <div className="bg-gray-900 md:w-1/2 flex-shrink-0 flex flex-col">
              {/* 縮圖列（上方） */}
              {allPhotos.length > 1 && (
                <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-800 flex-shrink-0">
                  {allPhotos.map((photo, i) => (
                    <button key={i} onClick={() => setPhotoIndex(i)}
                      className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-colors ${i === photoIndex ? 'border-blue-400' : 'border-transparent opacity-60 hover:opacity-100'}`}>
                      <Image src={photo.url} alt="" fill sizes="56px" className="object-cover" />
                    </button>
                  ))}
                </div>
              )}

              <div className="relative flex-1 min-h-[200px]">
                {allPhotos.length > 0 ? (
                  <>
                    <Image
                      key={allPhotos[photoIndex].url}
                      src={allPhotos[photoIndex].url}
                      alt={card.name}
                      fill
                      sizes="(max-width: 768px) 100vw, 400px"
                      className="object-contain"
                      priority
                    />
                    {allPhotos.length > 1 && (
                      <>
                        <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                          <ChevronLeft className="h-5 w-5" />
                        </button>
                        <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors">
                          <ChevronRight className="h-5 w-5" />
                        </button>
                      </>
                    )}
                    <span className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                      {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
                    </span>
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-gray-500">
                    <ImageOff className="h-12 w-12" />
                  </div>
                )}
              </div>

              {/* 品號 + 品名 */}
              <div className="bg-gray-900 px-4 py-3 border-t border-gray-700 text-center flex-shrink-0">
                <p className="text-xs text-gray-400 font-mono leading-none">{card.equipment_id}</p>
                <p className="text-sm font-bold text-white mt-1 leading-snug">{card.name}</p>
              </div>
            </div>

            {/* 右側：資訊區 */}
            <div className="flex flex-col flex-1 overflow-y-auto">
              <DialogHeader className="px-5 pt-5 pb-3 border-b pr-14">
                <p className="text-xs text-gray-400 font-mono">{card.equipment_id}</p>
                <DialogTitle className="text-base font-bold text-gray-900 mt-0.5 leading-snug">
                  {card.name}
                </DialogTitle>
                <div className="mt-1.5">
                  <Badge variant={isActive ? 'default' : 'secondary'}>
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
                    <p className="text-xs text-gray-400 mb-1.5">標籤</p>
                    <div className="flex flex-wrap gap-1.5">
                      {card.tags.map(tag => (
                        <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {card.notes && (
                  <div>
                    <p className="text-xs text-gray-400 mb-1">備註</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{card.notes}</p>
                  </div>
                )}

                <div className="pt-2 border-t text-xs text-gray-400 space-y-0.5">
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
      <p className="text-xs text-gray-400">{label}</p>
      <p className="text-sm font-medium text-gray-800">{value}</p>
    </div>
  )
}
