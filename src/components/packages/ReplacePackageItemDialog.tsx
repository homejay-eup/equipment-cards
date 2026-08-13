'use client'

import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { EquipmentCard } from '@/types/equipment'
import { EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import { Check, Loader2, Search, X } from 'lucide-react'

interface ReplacePackageItemDialogProps {
  equipmentId: string
  equipmentName: string
  allPackages: (EquipmentPackage | SharedEquipmentPackage)[]
  allCards: EquipmentCard[]
  onConfirm: (newCard: EquipmentCard, targetPackageIds: string[]) => Promise<void>
  onCancel: () => void
}

// 跨套餐批次替換料卡彈窗（Step 37）：比照 GroupsPanel.tsx 的 ReplaceDialog
// （樣式、Fuse 搜尋設定、版面配置盡量一致，維持視覺統一）。
// 差異：勾選清單是「同時存在於哪些套餐」而非群組，預設全部勾選。
export default function ReplacePackageItemDialog({
  equipmentId,
  equipmentName,
  allPackages,
  allCards,
  onConfirm,
  onCancel,
}: ReplacePackageItemDialogProps) {
  const [searchQ, setSearchQ] = useState('')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  const containingPackages = useMemo(
    () => allPackages.filter(p => p.package_items.some(i => i.equipment_id === equipmentId)),
    [allPackages, equipmentId]
  )

  const [targetPackages, setTargetPackages] = useState<Set<string>>(
    () => new Set(containingPackages.map(p => p.id))
  )
  const [saving, setSaving] = useState(false)

  const fuse = useMemo(() => new Fuse(allCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name', weight: 2 },
      { name: 'vendor', weight: 1 },
    ],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [allCards])

  const results = useMemo(() => {
    const q = searchQ.trim()
    // 排除正在被替換的料卡本身：選同一張卡等同「替換成自己」，
    // API 端已擋掉（新舊料卡不可相同），這裡先排除避免使用者選到後才看到錯誤訊息
    const pool = allCards.filter(c => c.equipment_id !== equipmentId)
    if (!q) return pool
    if (/^\d+$/.test(q)) {
      return pool.filter(c => c.equipment_id.includes(q) || c.name.includes(q))
    }
    return fuse.search(q).map(r => r.item).filter(c => c.equipment_id !== equipmentId)
  }, [searchQ, allCards, fuse, equipmentId])

  function togglePackage(id: string) {
    setTargetPackages(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await onConfirm(selected, Array.from(targetPackages))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#5a3820]">替換「{equipmentName}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-[#a08060] mb-1.5 font-medium">搜尋新料卡</p>
            <div className="relative mb-2">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                placeholder="料號、品名…"
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
              />
            </div>
            <div className="max-h-[50vh] overflow-y-auto border border-[#e8ddd0] rounded-lg divide-y divide-[rgba(122,82,48,.08)]">
              {results.map(c => (
                <button
                  key={c.equipment_id}
                  onClick={() => setSelected(c)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                    selected?.equipment_id === c.equipment_id
                      ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230]'
                      : 'hover:bg-[rgba(122,82,48,.05)] text-[#4a3422]'
                  }`}
                >
                  {selected?.equipment_id === c.equipment_id
                    ? <Check className="h-3 w-3 flex-shrink-0 text-[#7a5230]" />
                    : <span className="h-3 w-3 flex-shrink-0" />
                  }
                  <span className="font-mono text-[10px] text-[#a08060] flex-shrink-0">{c.equipment_id}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {results.length === 0 && (
                <p className="text-xs text-[#a08060] px-3 py-4 text-center">找不到料卡</p>
              )}
            </div>
          </div>

          {containingPackages.length > 0 && (
            <div>
              <p className="text-xs text-[#a08060] mb-1.5 font-medium">此料卡同時存在於</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {containingPackages.map(p => (
                  <label key={p.id} className="flex items-center gap-2 cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={targetPackages.has(p.id)}
                      onChange={() => togglePackage(p.id)}
                      className="accent-[#7a5230]"
                    />
                    <span className="text-xs text-[#4a3422]">{p.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={!selected || saving || targetPackages.size === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            確認替換
          </button>
        </div>
      </div>
    </div>
  )
}
