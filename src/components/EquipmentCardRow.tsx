'use client'

import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { ImageOff, Pencil, Trash2, CheckSquare, Square, FolderPlus } from 'lucide-react'
import BookmarkStar from '@/components/BookmarkStar'

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
  isBookmarked?: boolean
  onToggleBookmark?: () => void
  onAddToGroup?: (rect: DOMRect) => void
  /** 是否顯示廠商（比照細節頁 read_vendor 權限，沒權限只顯示分類） */
  showVendor?: boolean
}

/**
 * Step 55-09：照片牆「清單模式」的一行一筆。操作與 EquipmentCardItem 對等：
 * 點開燈箱、選取模式勾選、關注星號、管理員編輯／刪除、加入組合。
 * 操作按鈕 hover 才顯示；觸控裝置（hover:none）常駐星號。
 */
export default function EquipmentCardRow({
  card, onClick, isAdmin, onEdit, onDelete, activeStatus, selectMode, isSelected, onSelect,
  isNew, isBookmarked, onToggleBookmark, onAddToGroup, showVendor = false,
}: Props) {
  const isInactive = card.status !== activeStatus && card.status !== 'active'
  const meta = [card.category, showVendor ? card.vendor : null].filter(Boolean).join(' · ')

  function handleClick() {
    if (selectMode) { onSelect?.(); return }
    onClick()
  }

  const actionBtn = 'hidden group-hover:flex group-focus-within:flex p-1.5 rounded-md text-[#a08060] hover:bg-[rgba(122,82,48,.08)] transition-colors'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleClick() }
      }}
      className={`group relative flex items-center gap-3 bg-white rounded-lg border px-2.5 py-1.5 cursor-pointer transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#c49a72] ${
        selectMode && isSelected
          ? 'border-[#7a5230] ring-2 ring-[#c49a72] shadow-[0_0_10px_rgba(122,82,48,.3)]'
          : 'border-[rgba(122,82,48,.12)] hover:border-[#c49a72] hover:shadow-[0_0_10px_rgba(122,82,48,.2)]'
      }`}
    >
      {selectMode && (
        <span className="flex-shrink-0">
          {isSelected
            ? <CheckSquare className="h-5 w-5 text-red-500" />
            : <Square className="h-5 w-5 text-[#c49a72]" />
          }
        </span>
      )}

      {/* 小縮圖 40px */}
      <div className="relative h-10 w-10 flex-shrink-0 rounded-md overflow-hidden bg-[#e8ddd0]">
        {card.main_photo ? (
          <Image src={card.main_photo} alt={card.name} fill sizes="40px" className="object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[#c49a72]">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </div>

      {/* 料號／品名／分類·廠商：手機上下兩行，桌機同一行 */}
      <div className="flex-1 min-w-0 sm:flex sm:items-center sm:gap-3">
        <div className="flex items-center gap-1.5 min-w-0 sm:w-36 sm:flex-shrink-0">
          <span className="font-mono text-[11px] text-[#a08060] truncate">{card.equipment_id}</span>
          {isNew && !isInactive && (
            <span className="badge-new-pulse flex-shrink-0 text-[9px] font-bold tracking-widest text-white bg-[#b5451b] px-1 py-px rounded">
              NEW
            </span>
          )}
        </div>
        <p className="text-sm font-medium text-[#2c1e12] truncate sm:flex-1 sm:min-w-0">{card.name}</p>
        {meta && (
          <p className="hidden sm:block text-xs text-[#a08060] truncate max-w-[30%] flex-shrink-0">{meta}</p>
        )}
      </div>

      {isInactive && (
        <span className="flex-shrink-0 text-[10px] font-medium text-white bg-[#8a7060] px-1.5 py-0.5 rounded">
          {card.status}
        </span>
      )}

      {/* 操作：hover 才顯示（選取模式不顯示） */}
      {!selectMode && (
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {onAddToGroup && (
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onAddToGroup((e.currentTarget as HTMLButtonElement).getBoundingClientRect()) }}
              className={`${actionBtn} hover:text-[#7a5230]`}
              title="加入組合"
            >
              <FolderPlus className="h-3.5 w-3.5" />
            </button>
          )}
          {isAdmin && (
            <>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onEdit?.() }}
                className={`${actionBtn} hover:text-[#7a5230]`}
                title="編輯"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={e => { e.stopPropagation(); onDelete?.() }}
                className={`${actionBtn} hover:text-[#b5451b]`}
                title="刪除料卡"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {onToggleBookmark && (
            <BookmarkStar
              isBookmarked={!!isBookmarked}
              onToggle={onToggleBookmark}
              className={`p-1.5 rounded-md transition-colors ${
                isBookmarked
                  ? 'flex text-amber-400'
                  : 'hidden group-hover:flex group-focus-within:flex [@media(hover:none)]:flex text-[#c49a72] hover:text-amber-400'
              }`}
            />
          )}
        </div>
      )}
    </div>
  )
}
