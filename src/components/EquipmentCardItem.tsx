'use client'

import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Badge } from '@/components/ui/badge'
import { ImageOff, Pencil, Trash2 } from 'lucide-react'

interface Props {
  card: EquipmentCard
  onClick: () => void
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
  activeStatus: string  // settings.statuses[0]，非此狀態的縮圖會顯示覆蓋標籤
}

export default function EquipmentCardItem({ card, onClick, isAdmin, onEdit, onDelete, activeStatus }: Props) {
  const isInactive = card.status !== activeStatus && card.status !== 'active'

  return (
    <div className="group relative">
      <button
        onClick={onClick}
        className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md hover:border-blue-300 transition-all text-left w-full"
      >
        {/* 縮圖區 */}
        <div className="relative aspect-square bg-gray-100 overflow-hidden">
          {card.main_photo ? (
            <Image
              src={card.main_photo}
              alt={card.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 16vw"
              className="object-cover group-hover:scale-105 transition-transform duration-300"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <ImageOff className="h-8 w-8" />
            </div>
          )}
          {isInactive && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
              <span className="text-white text-xs font-bold bg-red-600 px-2 py-0.5 rounded">
                {card.status}
              </span>
            </div>
          )}
          {card.detail_photos.length > 0 && (
            <span className="absolute bottom-1.5 right-1.5 bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded-full">
              +{card.detail_photos.length}
            </span>
          )}
        </div>

        {/* 資訊區 */}
        <div className="p-2.5">
          <p className="text-[11px] text-gray-400 font-mono truncate">{card.equipment_id}</p>
          <p className="text-sm font-medium text-gray-800 mt-0.5 line-clamp-2 leading-tight">{card.name}</p>
          {card.vendor && (
            <p className="text-xs text-gray-500 mt-1 truncate">{card.vendor}</p>
          )}
          {card.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {card.tags.slice(0, 2).map(tag => (
                <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                  {tag}
                </Badge>
              ))}
              {card.tags.length > 2 && (
                <span className="text-[10px] text-gray-400">+{card.tags.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </button>

      {/* 管理員：編輯（左上）、刪除（右上）分開放，避免誤點 */}
      {isAdmin && (
        <>
          <button
            onClick={e => { e.stopPropagation(); onEdit?.() }}
            className="absolute top-1.5 left-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-gray-600 hover:text-blue-600 hover:bg-white transition-colors z-10"
            title="編輯"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={e => { e.stopPropagation(); onDelete?.() }}
            className="absolute top-1.5 right-1.5 hidden group-hover:flex bg-white/90 backdrop-blur-sm p-1.5 rounded-md shadow text-gray-600 hover:text-red-600 hover:bg-white transition-colors z-10"
            title="刪除"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  )
}
