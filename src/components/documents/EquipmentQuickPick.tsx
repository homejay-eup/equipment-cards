'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import Fuse from 'fuse.js'
import { Search, Loader2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'

// 複選版料卡挑選器：搜尋 + 打勾清單，選好多張後按「確認新增」才一次送出。
// 用於「文件清單」展開列裡「+ 新增掛載料卡」情境（原本是單選、點一下立刻生效，
// 使用者反映一次要掛好幾張卡片時很不方便，改成比照 EquipmentPicker 的打勾模式）
export default function EquipmentQuickPick({
  allCards, excludeIds = [], onPickMany, disabled,
}: {
  allCards: EquipmentCard[]
  excludeIds?: string[]
  onPickMany: (equipmentIds: string[]) => void | Promise<void>
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [submitting, setSubmitting] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; maxHeight: number }>({ left: 0, maxHeight: 320 })

  // 比照 SettingsPopover/DatePicker：改 fixed 定位（依按鈕位置動態計算），
  // 避免巢狀在 overflow-hidden 容器（如 PackageListView 的組合清單列）內時被裁切。
  // 額外處理視窗邊界：頁面上方現在有凍結工具列佔掉一截高度，往下開的可視空間變小，
  // 按鈕若偏下方，固定往下開很容易被視窗底部裁切又滾不到——改成量測上下可用空間，
  // 空間不夠就往上開，並把可用高度當 maxHeight 讓清單自己內部捲動，不會整塊超出畫面。
  function toggleOpen() {
    if (disabled) return
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      const margin = 8
      const preferredHeight = 320 // 搜尋列+提示文字+清單+按鈕列完整展開大概需要的高度
      const spaceBelow = window.innerHeight - r.bottom - margin
      const spaceAbove = r.top - margin
      const openUpward = spaceBelow < preferredHeight && spaceAbove > spaceBelow
      setPos(
        openUpward
          ? { bottom: window.innerHeight - r.top + 4, left: r.left, maxHeight: Math.max(spaceAbove, 160) }
          : { top: r.bottom + 4, left: r.left, maxHeight: Math.max(spaceBelow, 160) }
      )
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return
      if (ref.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const candidates = useMemo(
    () => allCards.filter(c => !excludeIds.includes(c.equipment_id)),
    [allCards, excludeIds],
  )

  const fuse = useMemo(() => new Fuse(candidates, {
    keys: [{ name: 'equipment_id', weight: 2 }, { name: 'name', weight: 2 }],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [candidates])

  const results = useMemo(() => {
    const q = query.trim()
    if (!q) return candidates.slice(0, 50)
    if (/^\d+$/.test(q)) return candidates.filter(c => c.equipment_id.includes(q) || c.name.includes(q)).slice(0, 50)
    return fuse.search(q).map(r => r.item).slice(0, 50)
  }, [query, candidates, fuse])

  function toggle(id: string) {
    setSelectedIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function reset() {
    setOpen(false)
    setQuery('')
    setSelectedIds(new Set())
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) return
    setSubmitting(true)
    try {
      await onPickMany(Array.from(selectedIds))
      reset()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div ref={ref} className="relative inline-block">
      <button ref={btnRef} type="button" onClick={toggleOpen} disabled={disabled}
        className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
        <Search className="h-3 w-3" />
        + 新增料卡
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          data-portal-popover
          // 巢狀在 Radix Dialog（如 RuleFormDialog）內開啟時，Dialog 會把 document.body 整個設成
          // pointer-events:none 只留自己 auto；這個 div portal 到 body 底下、不是 DialogContent
          // 的子節點，會繼承到 none 導致整個選單點不到（點擊會穿透到 Dialog 遮罩，誤觸關閉整個
          // Dialog）。必須自己明確蓋回 auto。
          style={{ position: 'fixed', top: pos.top, bottom: pos.bottom, left: pos.left, maxHeight: pos.maxHeight, zIndex: 9999, pointerEvents: 'auto' }}
          className="w-64 flex flex-col bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden">
          <div className="p-2 border-b border-[rgba(122,82,48,.1)] shrink-0">
            <input
              type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="搜尋料號、品名…" autoFocus disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          {!query.trim() && (
            <p className="px-3 py-1.5 text-[10px] text-[#a08060] border-b border-[rgba(122,82,48,.08)] shrink-0">
              共 {candidates.length} 張料卡，顯示前 {Math.min(50, candidates.length)} 筆，請輸入關鍵字搜尋更多
            </p>
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-3 py-2 text-xs text-[#a08060]">沒有符合的料卡</p>
            ) : results.map(c => {
              const checked = selectedIds.has(c.equipment_id)
              return (
                <label key={c.equipment_id}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.06)]">
                  <input type="checkbox" checked={checked} onChange={() => toggle(c.equipment_id)}
                    disabled={submitting} className="accent-[#7a5230]" />
                  <span className="truncate text-[#4a3422]">{c.equipment_id} {c.name}</span>
                </label>
              )
            })}
          </div>
          <div className="flex items-center justify-between gap-2 p-2 border-t border-[rgba(122,82,48,.1)] shrink-0">
            <button type="button" onClick={reset} disabled={submitting}
              className="text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">取消</button>
            <button type="button" onClick={handleConfirm} disabled={selectedIds.size === 0 || submitting}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#6b4530] disabled:opacity-40 transition-colors">
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              確認新增（已選 {selectedIds.size}）
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
