'use client'

import { Share2, Trash2 } from 'lucide-react'

// 依套餐視圖的批次動作列：全選、分享至部門、批次刪除。
// 從 PackageExplorer.tsx 拆出（純呈現＋既有 callback 轉發，行為不變）。
export default function PackageBatchActionsBar({
  filteredPackageIds, selectedPackageIds, onToggleAll,
  canShare, canEdit, running, onShare, onDeleteSelected,
}: {
  filteredPackageIds: string[]
  selectedPackageIds: Set<string>
  onToggleAll: (ids: string[]) => void
  canShare: boolean
  canEdit: boolean
  running: boolean
  onShare: () => void
  onDeleteSelected: () => void
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap mb-2 pb-2 border-b border-[rgba(122,82,48,.08)]">
      <label className="flex items-center gap-1.5 text-xs text-[#7a5230] cursor-pointer select-none">
        <input
          type="checkbox"
          checked={filteredPackageIds.length > 0 && selectedPackageIds.size === filteredPackageIds.length}
          onChange={() => onToggleAll(filteredPackageIds)}
          className="accent-[#7a5230]"
        />
        全選
      </label>
      {selectedPackageIds.size > 0 && (
        <span className="text-xs text-[#a08060]">已選 {selectedPackageIds.size} 份</span>
      )}
      {canShare && (
        <button onClick={onShare} disabled={selectedPackageIds.size === 0 || running}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-40 transition-colors">
          <Share2 className="h-3.5 w-3.5" />
          分享至部門
        </button>
      )}
      {canEdit && (
        <button onClick={onDeleteSelected} disabled={selectedPackageIds.size === 0 || running}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-[#b5451b] border border-[rgba(181,69,27,.3)] rounded-lg hover:bg-[rgba(181,69,27,.06)] disabled:opacity-40 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />
          批次刪除（{selectedPackageIds.size}）
        </button>
      )}
    </div>
  )
}
