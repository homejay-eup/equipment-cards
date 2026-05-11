'use client'

import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { ImageOff, Pencil, Trash2, CheckSquare, Square } from 'lucide-react'

interface Props {
  card: EquipmentCard
  onClick: () => void
  isAdmin?: boolean
  onEdit?: () => void
  onDelete?: () => void
  activeStatus: string
  selectMode?: boolean
  isSelected?: boolean
  onSelect?: () => void
  isNew?: boolean
}

export default function EquipmentCardItem({ card, onClick, isAdmin, onEdit, onDelete, activeStatus, selectMode, isSelected, onSelect, isNew }: Props) {
  const isInactive = card.status !== activeStatus && card.status !== 'active'

  function handleClick() {
    if (selectMode) { onSelect?.(); return }
    onClick()
  }

  return (
    <div className="group relative">
      <button
        onClick={handleClick}
        className={`bg-white rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-all text-left w-full focus:outline-none ${
          selectMode && isSelected
            ? 'border-red-400 ring-2 ring-red-300'
            : 'border-gray-200 hover:border-blue-300'
        }`}
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
          {isNew && !isInactive && (
            <span className="absolute top-2 left-2 z-[5] text-[10px] font-bold tracking-widest text-white bg-red-600 px-1.5 py-0.5 rounded shadow-sm">
              NEW
            </span>
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
        </div>
      </button>

      {/* 選取模式：右上角 checkbox */}
      {selectMode && (
        <div className="absolute top-1.5 right-1.5 z-10 pointer-events-none">
          {isSelected
            ? <CheckSquare className="h-5 w-5 text-red-500 drop-shadow" />
            : <Square className="h-5 w-5 text-white drop-shadow" />
          }
        </div>
      )}

      {/* 管理員：編輯（左上）、刪除（右上），選取模式時隱藏 */}
      {isAdmin && !selectMode && (
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
