'use client'

import { useState } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ChevronLeft, ChevronRight, ImageOff } from 'lucide-react'

interface Props {
  card: EquipmentCard
  open: boolean
  onClose: () => void
}

export default function CardDetailDialog({ card, open, onClose }: Props) {
  // photos = [main, ...details]
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖' }] : []),
    ...card.detail_photos.map((p, i) => ({ url: p.url, label: `細節 ${i + 1}` })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)

  const prev = () => setPhotoIndex(i => (i - 1 + allPhotos.length) % allPhotos.length)
  const next = () => setPhotoIndex(i => (i + 1) % allPhotos.length)

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl w-full p-0 overflow-hidden">
        <div className="flex flex-col md:flex-row h-full max-h-[90vh]">

          {/* 左側：照片區 */}
          <div className="relative bg-gray-900 md:w-1/2 flex-shrink-0">
            {allPhotos.length > 0 ? (
              <>
                <div className="relative aspect-square">
                  <Image
                    key={allPhotos[photoIndex].url}
                    src={allPhotos[photoIndex].url}
                    alt={card.name}
                    fill
                    sizes="(max-width: 768px) 100vw, 400px"
                    className="object-contain"
                    priority
                  />
                </div>

                {/* 左右切換 */}
                {allPhotos.length > 1 && (
                  <>
                    <button
                      onClick={prev}
                      className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button
                      onClick={next}
                      className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 transition-colors"
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>

                    {/* 指示點 */}
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                      {allPhotos.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPhotoIndex(i)}
                          className={`w-2 h-2 rounded-full transition-colors ${
                            i === photoIndex ? 'bg-white' : 'bg-white/40'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* 照片標籤 */}
                <span className="absolute top-3 left-3 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full">
                  {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
                </span>
              </>
            ) : (
              <div className="aspect-square flex items-center justify-center text-gray-500">
                <ImageOff className="h-12 w-12" />
              </div>
            )}

            {/* 縮圖列 */}
            {allPhotos.length > 1 && (
              <div className="flex gap-1.5 p-2 overflow-x-auto bg-gray-800">
                {allPhotos.map((photo, i) => (
                  <button
                    key={i}
                    onClick={() => setPhotoIndex(i)}
                    className={`relative flex-shrink-0 w-14 h-14 rounded overflow-hidden border-2 transition-colors ${
                      i === photoIndex ? 'border-blue-400' : 'border-transparent opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image src={photo.url} alt="" fill sizes="56px" className="object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 右側：資訊區 */}
          <div className="flex flex-col flex-1 overflow-y-auto">
            <DialogHeader className="px-5 pt-5 pb-3 border-b">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs text-gray-400 font-mono">{card.equipment_id}</p>
                  <DialogTitle className="text-base font-bold text-gray-900 mt-0.5 leading-snug">
                    {card.name}
                  </DialogTitle>
                </div>
                <Badge
                  variant={card.status === 'active' ? 'default' : 'destructive'}
                  className="flex-shrink-0 mt-1"
                >
                  {card.status === 'active' ? '現役' : '停產'}
                </Badge>
              </div>
            </DialogHeader>

            <div className="px-5 py-4 space-y-4 flex-1">
              {/* 分類 / 廠商 */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {card.category && (
                  <InfoRow label="分類" value={card.category} />
                )}
                {card.vendor && (
                  <InfoRow label="廠商" value={card.vendor} />
                )}
              </div>

              {/* 標籤 */}
              {card.tags.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-1.5">標籤</p>
                  <div className="flex flex-wrap gap-1.5">
                    {card.tags.map(tag => (
                      <Badge key={tag} variant="secondary" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 備註 */}
              {card.notes && (
                <div>
                  <p className="text-xs text-gray-400 mb-1">備註</p>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {card.notes}
                  </p>
                </div>
              )}

              {/* 照片數量 */}
              <div className="pt-2 border-t text-xs text-gray-400 space-y-0.5">
                <p>主照片：{card.main_photo ? '1 張' : '無'}</p>
                <p>細節照片：{card.detail_photos.length} 張</p>
              </div>
            </div>
          </div>
        </div>
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
