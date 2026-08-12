'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Fuse from 'fuse.js'
import { EquipmentCard, UserGroup } from '@/types/equipment'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import QuantityStepper from '@/components/QuantityStepper'
import ConfirmDialog from '@/components/ConfirmDialog'
import { usePackages, EquipmentPackage } from '@/hooks/usePackages'
import { Star, ChevronDown, ChevronRight, Plus, Check, Pencil, Trash2, Search, Loader2, X, Folder, FolderPlus, GripVertical, Copy, RefreshCw, PackageCheck, List as ListIcon, LayoutGrid, ArrowLeftRight, Minus } from 'lucide-react'

interface GroupsPanelProps {
  initialGroups: UserGroup[]
  allCards: EquipmentCard[]
  onCardClick: (card: EquipmentCard) => void
  onGroupsChange: (groups: UserGroup[]) => void
  activeStatus: string
  onDelete?: (card: EquipmentCard) => void
  filteredCards?: EquipmentCard[]
  bookmarkedIds?: Set<string>
  onToggleBookmark?: (card: EquipmentCard) => void
  // Step 34：設備套餐來源對齊機制。預設 false 不影響既有呼叫端（未給此 prop 時完全不出現套餐相關按鈕/API 呼叫）
  canManagePackages?: boolean
}

// ── 替換料卡彈窗 ────────────────────────────────────────────────
interface ReplaceDialogProps {
  card: EquipmentCard
  groups: UserGroup[]
  allCards: EquipmentCard[]
  onConfirm: (newCard: EquipmentCard, targetGroupIds: string[]) => Promise<void>
  onCancel: () => void
}

function ReplaceDialog({ card, groups, allCards, onConfirm, onCancel }: ReplaceDialogProps) {
  const [searchQ, setSearchQ] = useState('')
  const [selected, setSelected] = useState<EquipmentCard | null>(null)
  const [targetGroups, setTargetGroups] = useState<Set<string>>(() => {
    const s = new Set<string>()
    for (const g of groups) {
      if (g.group_items.some(i => i.equipment_id === card.equipment_id)) {
        s.add(g.id)
      }
    }
    return s
  })
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
    if (!q) return allCards
    if (/^\d+$/.test(q)) {
      return allCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q))
    }
    return fuse.search(q).map(r => r.item)
  }, [searchQ, allCards, fuse])

  const containingGroups = groups.filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))

  function toggleGroup(id: string) {
    setTargetGroups(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleConfirm() {
    if (!selected) return
    setSaving(true)
    try {
      await onConfirm(selected, Array.from(targetGroups))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-lg mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#5a3820]">替換「{card.name}」</p>
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

          {containingGroups.length > 0 && (
            <div>
              <p className="text-xs text-[#a08060] mb-1.5 font-medium">此料卡同時存在於</p>
              <div className="space-y-1">
                {containingGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 cursor-pointer px-1">
                    <input
                      type="checkbox"
                      checked={targetGroups.has(g.id)}
                      onChange={() => toggleGroup(g.id)}
                      className="accent-[#7a5230]"
                    />
                    <span className="text-xs text-[#4a3422]">
                      {g.is_default && <Star className="inline h-3 w-3 text-amber-400 fill-amber-400 mr-0.5" />}
                      {g.name}
                    </span>
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
            disabled={!selected || saving || targetGroups.size === 0}
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

// ── 加入料卡彈窗 ────────────────────────────────────────────────
interface AddCardDialogProps {
  group: UserGroup
  allCards: EquipmentCard[]
  onConfirm: (equipmentIds: string[]) => Promise<void>
  onCancel: () => void
}

function AddCardDialog({ group, allCards, onConfirm, onCancel }: AddCardDialogProps) {
  const [searchQ, setSearchQ] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const existingIds = useMemo(
    () => new Set(group.group_items.map(i => i.equipment_id)),
    [group.group_items]
  )

  const availableCards = useMemo(
    () => allCards.filter(c => !existingIds.has(c.equipment_id)),
    [allCards, existingIds]
  )

  const fuse = useMemo(() => new Fuse(availableCards, {
    keys: [
      { name: 'equipment_id', weight: 2 },
      { name: 'name', weight: 2 },
      { name: 'vendor', weight: 1 },
    ],
    threshold: 0.3,
    minMatchCharLength: 1,
  }), [availableCards])

  const results = useMemo(() => {
    const q = searchQ.trim()
    if (!q) return availableCards
    if (/^\d+$/.test(q)) {
      return availableCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q))
    }
    return fuse.search(q).map(r => r.item)
  }, [searchQ, availableCards, fuse])

  function toggleCard(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  async function handleConfirm() {
    if (selectedIds.size === 0) return
    setSaving(true)
    try {
      await onConfirm(Array.from(selectedIds))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between flex-shrink-0">
          <p className="text-sm font-semibold text-[#5a3820]">加入料卡到「{group.name}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
            <input
              autoFocus
              type="text"
              value={searchQ}
              onChange={e => setSearchQ(e.target.value)}
              placeholder="料號、品名、廠商…"
              className="w-full pl-8 pr-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
            />
          </div>
          {selectedIds.size > 0 && (
            <p className="text-xs text-[#7a5230] mt-1.5 font-medium">已選 {selectedIds.size} 張</p>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-0">
          <div className="border border-[#e8ddd0] rounded-lg divide-y divide-[rgba(122,82,48,.08)]">
            {results.map(c => {
              const isSelected = selectedIds.has(c.equipment_id)
              return (
                <button
                  key={c.equipment_id}
                  onClick={() => toggleCard(c.equipment_id)}
                  className={`w-full text-left px-3 py-2 flex items-center gap-2 text-xs transition-colors ${
                    isSelected
                      ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230]'
                      : 'hover:bg-[rgba(122,82,48,.04)] text-[#4a3422]'
                  }`}
                >
                  <span className={`flex-shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                    isSelected ? 'bg-[#7a5230] border-[#7a5230]' : 'border-[#d0b898]'
                  }`}>
                    {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                  </span>
                  <span className="font-mono text-[10px] text-[#a08060] flex-shrink-0 w-16">{c.equipment_id}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}
            {results.length === 0 && (
              <p className="text-xs text-[#a08060] px-3 py-6 text-center">找不到可加入的料卡</p>
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-[rgba(122,82,48,.1)] flex gap-2 justify-end flex-shrink-0">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            加入 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 複製群組彈窗 ────────────────────────────────────────────────
interface DuplicateGroupDialogProps {
  sourceName: string
  onConfirm: (newName: string) => Promise<void>
  onCancel: () => void
}

// 複製群組彈窗：強制輸入新名稱（預設帶「原名稱（副本）」）才能建立，不與來源做任何關聯
function DuplicateGroupDialog({ sourceName, onConfirm, onCancel }: DuplicateGroupDialogProps) {
  const [name, setName] = useState(`${sourceName}（副本）`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('新群組名稱為必填')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch (e) {
      setError(e instanceof Error ? e.message : '複製失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#5a3820]">複製群組「{sourceName}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-[#a08060]">新群組名稱</p>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            disabled={saving}
            className="w-full border border-[#c49a72] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50"
          />
          {error && <p className="text-xs text-[#b5451b]">{error}</p>}
        </div>
        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] disabled:opacity-40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
            建立副本
          </button>
        </div>
      </div>
    </div>
  )
}

// ── 清單/照片顯示模式：比照 packages/PackageExplorer.tsx 的 useLocalStorageState 寫法，
// 各自維護一份、不共用檔案，避免跨檔案耦合。storage key 用 groups_display 跟套餐那邊
// `${storageKeyPrefix}_display` 不會衝突。
function useLocalStorageState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored) setValue(stored as T)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function update(v: T) {
    setValue(v)
    try { window.localStorage.setItem(key, v) } catch { /* ignore */ }
  }
  return [value, update]
}

// ── 主元件 ────────────────────────────────────────────────────────
export default function GroupsPanel({
  initialGroups,
  allCards,
  onCardClick,
  onGroupsChange,
  activeStatus,
  onDelete,
  filteredCards,
  bookmarkedIds,
  onToggleBookmark,
  canManagePackages = false,
}: GroupsPanelProps) {
  const [groups, setGroups] = useState<UserGroup[]>(initialGroups)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    new Set(initialGroups.map(g => g.id)))

  // 全域清單/照片顯示模式（套用到全部群組，非各自切換），localStorage 記住偏好
  const [display, setDisplay] = useLocalStorageState<'list' | 'photo'>('groups_display', 'photo')

  // 同步外部 groups 變更（例如從全部料卡的加入群組 popup 更新）
  // 當 initialGroups 參考改變時才更新（即 PhotoWall setGroups 被呼叫時）
  useEffect(() => {
    setGroups(initialGroups)
  }, [initialGroups]) // eslint-disable-line react-hooks/exhaustive-deps

  const [isLoading, setIsLoading] = useState(false)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<UserGroup | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [replaceTarget, setReplaceTarget] = useState<{ card: EquipmentCard } | null>(null)
  const [addTarget, setAddTarget] = useState<{ groupId: string } | null>(null)
  const [duplicateTarget, setDuplicateTarget] = useState<UserGroup | null>(null)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  // ── Step 34：設備套餐來源對齊（複製為套餐／重新對齊套餐） ─────────
  const pkgApi = usePackages()
  // 只在有 canManagePackages 時才打 /api/packages，避免沒有此權限的一般使用者也發出請求
  const [packagesByGroupId, setPackagesByGroupId] = useState<Record<string, EquipmentPackage>>({})
  const [packageActionError, setPackageActionError] = useState<string | null>(null)
  const [copyingGroupId, setCopyingGroupId] = useState<string | null>(null)
  const [aligningGroupId, setAligningGroupId] = useState<string | null>(null)
  const [alignConfirmGroup, setAlignConfirmGroup] = useState<UserGroup | null>(null)

  useEffect(() => {
    if (!canManagePackages) return
    let cancelled = false
    pkgApi.list().then(pkgs => {
      if (cancelled) return
      const map: Record<string, EquipmentPackage> = {}
      for (const p of pkgs) {
        if (p.source_group_id) map[p.source_group_id] = p
      }
      setPackagesByGroupId(map)
    }).catch(() => { /* 靜默失敗：僅是輔助資訊，不影響群組本身功能 */ })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManagePackages])

  async function handleCopyToPackage(group: UserGroup) {
    setPackageActionError(null)
    setCopyingGroupId(group.id)
    try {
      const pkg = await pkgApi.create(group.name, group.id)
      setPackagesByGroupId(prev => ({ ...prev, [group.id]: pkg }))
    } catch (e) {
      setPackageActionError(e instanceof Error ? e.message : '複製為套餐失敗')
    } finally {
      setCopyingGroupId(null)
    }
  }

  function askAlign(group: UserGroup) {
    setAlignConfirmGroup(group)
  }

  async function handleConfirmAlign() {
    const group = alignConfirmGroup
    setAlignConfirmGroup(null)
    if (!group) return
    const linked = packagesByGroupId[group.id]
    if (!linked) return
    setPackageActionError(null)
    setAligningGroupId(group.id)
    try {
      const pkg = await pkgApi.align(linked.id)
      setPackagesByGroupId(prev => ({ ...prev, [group.id]: pkg }))
    } catch (e) {
      setPackageActionError(e instanceof Error ? e.message : '重新對齊失敗')
    } finally {
      setAligningGroupId(null)
    }
  }

  // 對齊狀態：雙向比對，群組或套餐任一邊晚於 source_synced_at 就算「來源已更新」
  // - group.updated_at 晚於 source_synced_at → 群組內容變了，需要重新對齊
  // - linked.updated_at 晚於 source_synced_at → 套餐被直接編輯過，已跟來源群組不一致
  // （group.updated_at 在 SQL migration 執行前可能為 undefined，視為群組這邊未過期）
  function isSourceStale(group: UserGroup, linked: EquipmentPackage): boolean {
    if (!linked.source_synced_at) return true
    const syncedAt = new Date(linked.source_synced_at).getTime()
    if (group.updated_at && new Date(group.updated_at).getTime() > syncedAt) return true
    return new Date(linked.updated_at).getTime() > syncedAt
  }

  // 搜尋篩選 Set：O(1) 查詢用
  const filteredSet = useMemo(() =>
    filteredCards ? new Set(filteredCards.map(c => c.equipment_id)) : null,
  [filteredCards])

  // 只在沒有初始資料時才 fetch（觸發懶遷移）；有資料直接用 prop
  useEffect(() => {
    if (initialGroups.length > 0) {
      setGroups(initialGroups)
      setExpandedIds(new Set(initialGroups.map(g => g.id)))
      return
    }
    setIsLoading(true)
    fetch('/api/groups')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setGroups(data)
          setExpandedIds(new Set((data as UserGroup[]).map(g => g.id)))
          onGroupsChange(data)
        }
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (addingGroup && newGroupInputRef.current) {
      newGroupInputRef.current.focus()
    }
  }, [addingGroup])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function applyGroups(next: UserGroup[]) {
    setGroups(next)
    onGroupsChange(next)
  }

  async function handleAddGroup() {
    const name = newGroupName.trim()
    if (!name) { setAddingGroup(false); return }

    // Optimistic: 立即關閉輸入框並顯示群組
    setAddingGroup(false)
    setNewGroupName('')
    const tempId = `temp-${Date.now()}`
    const tempGroup: UserGroup = { id: tempId, name, is_default: false, sort_order: 999, created_at: new Date().toISOString(), group_items: [] }
    const defaultIdx = groups.findIndex(g => g.is_default)
    const insertIdx = defaultIdx >= 0 ? defaultIdx + 1 : groups.length
    const withTemp = [...groups]
    withTemp.splice(insertIdx, 0, tempGroup)
    applyGroups(withTemp)
    setExpandedIds(prev => { const next = new Set(prev); next.add(tempId); return next })

    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      const newGroup: UserGroup = await res.json()
      applyGroups(withTemp.map(g => g.id === tempId ? newGroup : g))
      setExpandedIds(prev => { const next = new Set(prev); next.delete(tempId); next.add(newGroup.id); return next })
    } else {
      applyGroups(withTemp.filter(g => g.id !== tempId))
      setExpandedIds(prev => { const next = new Set(prev); next.delete(tempId); return next })
    }
  }

  async function handleConfirmDuplicate(newName: string) {
    const source = duplicateTarget
    if (!source) return
    const res = await fetch(`/api/groups/${source.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName }),
    })
    if (res.ok) {
      const newGroup: UserGroup = await res.json()
      const defaultIdx = groups.findIndex(g => g.is_default)
      const insertIdx = defaultIdx >= 0 ? defaultIdx + 1 : groups.length
      const withNew = [...groups]
      withNew.splice(insertIdx, 0, newGroup)
      applyGroups(withNew)
      setExpandedIds(prev => { const next = new Set(prev); next.add(newGroup.id); return next })
      setDuplicateTarget(null)
    } else {
      let message = '複製群組失敗'
      try {
        const data = await res.json()
        if (data?.error) message = data.error
      } catch {
        // 忽略 JSON 解析失敗，維持預設訊息
      }
      throw new Error(message)
    }
  }

  function askDelete(group: UserGroup) {
    setConfirmTarget(group)
    setConfirmOpen(true)
  }

  async function handleDeleteConfirm() {
    if (!confirmTarget) return
    setConfirmOpen(false)
    const res = await fetch(`/api/groups/${confirmTarget.id}`, { method: 'DELETE' })
    if (res.ok) {
      applyGroups(groups.filter(g => g.id !== confirmTarget.id))
    }
    setConfirmTarget(null)
  }

  function startRename(group: UserGroup) {
    setRenamingId(group.id)
    setRenameValue(group.name)
  }

  async function handleRenameSubmit(groupId: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    applyGroups(groups.map(g => g.id === groupId ? { ...g, name } : g))
    await fetch(`/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
  }

  const handleReplace = useCallback(async (
    oldCard: EquipmentCard,
    newCard: EquipmentCard,
    targetGroupIds: string[]
  ) => {
    const res = await fetch('/api/groups/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        old_equipment_id: oldCard.equipment_id,
        new_equipment_id: newCard.equipment_id,
        group_ids: targetGroupIds,
      }),
    })
    if (res.ok) {
      const now = new Date().toISOString()
      applyGroups(groups.map(g => {
        if (!targetGroupIds.includes(g.id)) return g
        // 替換料卡時延續舊料卡原有的數量設定，不重置成 1（後端 /api/groups/replace 也會做同樣的事，
        // 這裡只是讓樂觀更新的畫面立刻跟後端結果一致，不用等重新整理）
        const oldQuantity = g.group_items.find(i => i.equipment_id === oldCard.equipment_id)?.quantity ?? 1
        const items = g.group_items.filter(i => i.equipment_id !== oldCard.equipment_id)
        if (!items.some(i => i.equipment_id === newCard.equipment_id)) {
          items.unshift({ equipment_id: newCard.equipment_id, added_at: now, quantity: oldQuantity })
        }
        // 同步更新 updated_at：讓「已對齊最新版本」徽章立即反映內容異動，不必等重新整理頁面
        return { ...g, group_items: items, updated_at: now }
      }))
    }
    setReplaceTarget(null)
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleRemoveCard(card: EquipmentCard, groupId: string) {
    // 樂觀更新：立即從 UI 移除，不等 API 回應
    // 同步更新 updated_at：讓「已對齊最新版本」徽章立即反映內容異動，不必等重新整理頁面
    applyGroups(groups.map(g =>
      g.id !== groupId ? g : { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id), updated_at: new Date().toISOString() }
    ))
    await fetch(`/api/groups/${groupId}/items/${card.equipment_id}`, { method: 'DELETE' })
  }

  // Step 35：更新單一料卡數量。樂觀更新+同步 bump updated_at，比照 handleRemoveCard/handleAddCards 的寫法
  async function handleUpdateQuantity(groupId: string, equipmentId: string, quantity: number) {
    const now = new Date().toISOString()
    applyGroups(groups.map(g =>
      g.id !== groupId ? g : {
        ...g,
        group_items: g.group_items.map(i => i.equipment_id === equipmentId ? { ...i, quantity } : i),
        updated_at: now,
      }
    ))
    try {
      await fetch(`/api/groups/${groupId}/items/${equipmentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantity }),
      })
    } catch (e) {
      console.error('[GroupsPanel] update quantity failed', groupId, equipmentId, e)
    }
  }

  const handleAddCards = useCallback(async (groupId: string, equipmentIds: string[]) => {
    const now = new Date().toISOString()
    const results = await Promise.allSettled(
      equipmentIds.map(id =>
        fetch(`/api/groups/${groupId}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ equipment_id: id }),
        })
      )
    )
    const successIds = equipmentIds.filter((_, i) => {
      const r = results[i]
      return r.status === 'fulfilled' && r.value.ok
    })
    if (successIds.length > 0) {
      applyGroups(groups.map(g => {
        if (g.id !== groupId) return g
        const newItems = successIds
          .filter(id => !g.group_items.some(i => i.equipment_id === id))
          .map(id => ({ equipment_id: id, added_at: now, quantity: 1 }))
        // 同步更新 updated_at：讓「已對齊最新版本」徽章立即反映內容異動，不必等重新整理頁面
        return { ...g, group_items: [...newItems, ...g.group_items], updated_at: now }
      }))
    }
    setAddTarget(null)
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleGroupReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const defaultGroup = groups.find(g => g.is_default)
    const nonDefault = groups.filter(g => !g.is_default)
    const fromIdx = nonDefault.findIndex(g => g.id === fromId)
    const toIdx = nonDefault.findIndex(g => g.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...nonDefault]
    const [moved] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, moved)

    const newGroups = defaultGroup ? [defaultGroup, ...reordered] : reordered
    const originalGroups = groups
    applyGroups(newGroups)
    setDraggingId(null)
    setDragOverId(null)

    const orders = reordered.map((g, i) => ({ id: g.id, sort_order: (i + 1) * 1000 }))
    try {
      const res = await fetch('/api/groups/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      applyGroups(originalGroups)
      alert('排序更新失敗，請重試')
    }
  }

  const addTargetGroup = addTarget ? groups.find(g => g.id === addTarget.groupId) : null

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">載入中…</span>
          </div>
        ) : (
          <div>
            {/* 頂端工具列：新增群組 + 私人說明 */}
            <div className="flex items-center justify-between pb-3 mb-1 border-b border-[rgba(122,82,48,.1)]">
              {addingGroup ? (
                <div className="flex items-center gap-2 flex-1">
                  <input
                    ref={newGroupInputRef}
                    type="text"
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleAddGroup()
                      if (e.key === 'Escape') { setAddingGroup(false); setNewGroupName('') }
                    }}
                    placeholder="群組名稱…"
                    className="flex-1 text-sm border border-[#c49a72] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a]"
                  />
                  <button
                    onClick={handleAddGroup}
                    className="flex items-center justify-center w-8 h-8 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors"
                  >
                    <Check className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => { setAddingGroup(false); setNewGroupName('') }}
                    className="flex items-center justify-center w-8 h-8 border border-[#e8ddd0] text-[#a08060] rounded-lg hover:text-[#7a5230] transition-colors"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setAddingGroup(true)}
                  className="flex items-center gap-1.5 text-sm text-[#a08060] hover:text-[#7a5230] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  新增群組
                </button>
              )}
              {groups.length > 0 && (
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs">
                    <button
                      type="button"
                      onClick={() => setDisplay('list')}
                      title="清單模式"
                      className={`p-1.5 transition-colors ${display === 'list' ? 'bg-[#7a5230] text-white' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)]'}`}
                    >
                      <ListIcon className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDisplay('photo')}
                      title="照片模式"
                      className={`p-1.5 transition-colors ${display === 'photo' ? 'bg-[#7a5230] text-white' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)]'}`}
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs">
                    <button
                      onClick={() => setExpandedIds(new Set(groups.map(g => g.id)))}
                      className="px-2.5 py-1.5 text-[#a08060] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230] border-r border-[rgba(122,82,48,.25)] transition-colors"
                    >
                      展開全部
                    </button>
                    <button
                      onClick={() => setExpandedIds(new Set())}
                      className="px-2.5 py-1.5 text-[#a08060] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230] transition-colors"
                    >
                      收合全部
                    </button>
                  </div>
                </div>
              )}
            </div>

            {packageActionError && (
              <p className="text-xs text-[#b5451b] pt-2">{packageActionError}</p>
            )}

            {/* 群組列表 */}
            <div className="divide-y divide-[rgba(122,82,48,.08)]">
              {groups.map(group => {
                const isExpanded = expandedIds.has(group.id)
                const itemCount = group.group_items.length

                const groupCards = group.group_items
                  .map(item => allCards.find(c => c.equipment_id === item.equipment_id))
                const validCards = groupCards.filter(Boolean) as EquipmentCard[]
                const displayCards = filteredSet
                  ? validCards.filter(c => filteredSet.has(c.equipment_id))
                  : validCards

                return (
                  <div
                    key={group.id}
                    className={`py-2 rounded-lg transition-all ${draggingId === group.id ? 'opacity-40' : ''} ${dragOverId === group.id && draggingId !== group.id ? 'ring-2 ring-[#c49a72] ring-inset' : ''}`}
                    onDragOver={!group.is_default ? e => { e.preventDefault(); if (draggingId && draggingId !== group.id) setDragOverId(group.id) } : undefined}
                    onDragLeave={!group.is_default ? e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverId(null) } : undefined}
                    onDrop={!group.is_default ? e => { e.preventDefault(); if (draggingId) handleGroupReorder(draggingId, group.id); setDragOverId(null) } : undefined}
                  >
                    {/* 群組標題列 */}
                    <div className="relative flex items-center group/header">
                      {renamingId === group.id ? (
                        /* 重命名模式：flat div，不巢狀在 button 內，有 ✓ / ✗ 按鈕 */
                        <div className="flex items-center gap-1.5 w-full min-w-0 py-1">
                          {group.is_default
                            ? <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                            : <Folder className="h-4 w-4 text-[#c49a72] flex-shrink-0" />
                          }
                          <input
                            autoFocus
                            value={renameValue}
                            onChange={e => setRenameValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') handleRenameSubmit(group.id)
                              if (e.key === 'Escape') setRenamingId(null)
                            }}
                            onBlur={() => handleRenameSubmit(group.id)}
                            className="flex-1 min-w-0 text-sm font-medium text-[#5a3820] bg-white border border-[#c49a72] rounded px-2 py-0.5 focus:outline-none"
                          />
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => handleRenameSubmit(group.id)}
                            className="p-1 text-[#7a5230] hover:bg-[rgba(122,82,48,.1)] rounded flex-shrink-0 transition-colors"
                            title="確認"
                          >
                            <Check className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onMouseDown={e => e.preventDefault()}
                            onClick={() => setRenamingId(null)}
                            className="p-1 text-[#a08060] hover:bg-[rgba(122,82,48,.06)] rounded flex-shrink-0 transition-colors"
                            title="取消"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        /* 一般模式：點擊展開/收合 */
                        <>
                          {!group.is_default && (
                            <span
                              draggable
                              onDragStart={e => { e.stopPropagation(); setDraggingId(group.id) }}
                              onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
                              className="opacity-0 group-hover/header:opacity-100 transition-opacity cursor-grab text-[#c0a882] hover:text-[#a08060] flex-shrink-0 px-0.5"
                            >
                              <GripVertical className="h-4 w-4" />
                            </span>
                          )}
                          <button
                            onClick={() => toggleExpand(group.id)}
                            className="flex items-center gap-2 flex-1 min-w-0 text-left py-1"
                          >
                            {group.is_default
                              ? <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                              : <Folder className="h-4 w-4 text-[#c49a72] flex-shrink-0" />
                            }
                            <span className="text-sm font-semibold text-[#5a3820] truncate flex-1">{group.name}</span>
                            <span className="text-xs text-[#a08060] flex-shrink-0 mr-1">
                              {filteredSet && displayCards.length !== itemCount
                                ? `${displayCards.length} / ${itemCount} 筆`
                                : `${itemCount} 筆`
                              }
                            </span>
                            {canManagePackages && !group.is_default && packagesByGroupId[group.id] && (
                              isSourceStale(group, packagesByGroupId[group.id])
                                ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(217,119,6,.1)] text-amber-600 border border-[rgba(217,119,6,.25)] flex-shrink-0 mr-1">
                                    <RefreshCw className="h-2.5 w-2.5" />
                                    來源已更新
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(34,139,34,.08)] text-green-700 border border-[rgba(34,139,34,.2)] flex-shrink-0 mr-1">
                                    <Check className="h-2.5 w-2.5" />
                                    已對齊最新版本
                                  </span>
                                )
                            )}
                            {isExpanded
                              ? <ChevronDown className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                              : <ChevronRight className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                            }
                          </button>
                        </>
                      )}

                      {/* 編輯按鈕：重命名時隱藏。改為佔用 flex 版面空間（非 absolute），
                          避免覆蓋在筆數／對齊徽章上方——hover 前用 opacity-0 + pointer-events-none
                          隱藏但保留版面寬度，hover 後才淡入並可點擊 */}
                      {!group.is_default && renamingId !== group.id && (
                        <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 pointer-events-none group-hover/header:opacity-100 group-hover/header:pointer-events-auto transition-opacity">
                          {canManagePackages && (
                            packagesByGroupId[group.id] ? (
                              <button
                                onClick={e => { e.stopPropagation(); askAlign(group) }}
                                disabled={aligningGroupId === group.id}
                                className="p-1.5 text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors rounded"
                                title="重新對齊套餐（會覆蓋套餐目前內容）"
                              >
                                {aligningGroupId === group.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <PackageCheck className="h-3.5 w-3.5" />
                                }
                              </button>
                            ) : (
                              <button
                                onClick={e => { e.stopPropagation(); handleCopyToPackage(group) }}
                                disabled={copyingGroupId === group.id}
                                className="p-1.5 text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors rounded"
                                title="複製為套餐"
                              >
                                {copyingGroupId === group.id
                                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  : <Copy className="h-3.5 w-3.5" />
                                }
                              </button>
                            )
                          )}
                          <button
                            onClick={e => { e.stopPropagation(); setDuplicateTarget(group) }}
                            className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors rounded"
                            title="複製群組"
                          >
                            <FolderPlus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); setAddTarget({ groupId: group.id }) }}
                            className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors rounded"
                            title="加入料卡"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); startRename(group) }}
                            className="p-1.5 text-[#a08060] hover:text-[#7a5230] transition-colors rounded"
                            title="重命名"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); askDelete(group) }}
                            className="p-1.5 text-[#a08060] hover:text-red-500 transition-colors rounded"
                            title="刪除群組"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 展開的大圖網格 */}
                    {isExpanded && (
                      itemCount === 0 ? (
                        <div className="pt-2 pb-1 flex items-center gap-3">
                          <p className="text-sm text-[#b0967a] italic">此群組尚無料卡</p>
                          <button
                            onClick={() => setAddTarget({ groupId: group.id })}
                            className="flex items-center gap-1 text-xs text-[#a08060] hover:text-[#7a5230] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] px-2 py-1 rounded-lg transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                            加入料卡
                          </button>
                        </div>
                      ) : displayCards.length === 0 ? (
                        <p className="text-sm text-[#b0967a] italic pt-2 pb-1">篩選後無符合結果</p>
                      ) : display === 'photo' ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 pt-2">
                          {displayCards.map(card => (
                            <EquipmentCardItem
                              key={card.equipment_id}
                              card={card}
                              onClick={() => onCardClick(card)}
                              isAdmin={false}
                              onDelete={group.is_default ? (onDelete ? () => onDelete(card) : undefined) : undefined}
                              activeStatus={activeStatus}
                              isNew={card.is_new}
                              onReplace={!group.is_default ? () => setReplaceTarget({ card }) : undefined}
                              onRemoveFromGroup={!group.is_default ? () => handleRemoveCard(card, group.id) : undefined}
                              isBookmarked={group.is_default ? bookmarkedIds?.has(card.equipment_id) : undefined}
                              onToggleBookmark={group.is_default && onToggleBookmark ? () => onToggleBookmark(card) : undefined}
                              quantity={group.group_items.find(i => i.equipment_id === card.equipment_id)?.quantity}
                            />
                          ))}
                        </div>
                      ) : (
                        /* 清單模式：純文字列，操作圖示改放料號左側（滑鼠不用跨過整列空白），
                           整列 hover 時有「浮起」強調效果（背景亮起＋輕微陰影＋些微上移） */
                        <div className="flex flex-col gap-1 pt-2">
                          {displayCards.map(card => {
                            const isBookmarked = bookmarkedIds?.has(card.equipment_id)
                            const quantity = group.group_items.find(i => i.equipment_id === card.equipment_id)?.quantity ?? 1
                            return (
                              <div
                                key={card.equipment_id}
                                className="group/row flex items-center gap-2 py-1.5 px-2 -mx-2 rounded-lg text-xs transition-all hover:bg-[#faf6f0] hover:shadow-[0_2px_6px_rgba(122,82,48,.12)] hover:-translate-y-px"
                              >
                                <span className="flex items-center gap-0.5 flex-shrink-0">
                                  {group.is_default ? (
                                    <>
                                      {onToggleBookmark && (
                                        <button
                                          onClick={() => onToggleBookmark(card)}
                                          title={isBookmarked ? '移除關注' : '加入關注'}
                                          className={`p-1 rounded transition-colors ${isBookmarked ? 'text-amber-400' : 'text-[#c49a72] group-hover/row:text-amber-400'}`}
                                        >
                                          <Star className={`h-3.5 w-3.5 ${isBookmarked ? 'fill-amber-400' : ''}`} />
                                        </button>
                                      )}
                                      {onDelete && (
                                        <button
                                          onClick={() => onDelete(card)}
                                          title="刪除料卡"
                                          className="p-1 text-[#a08060] group-hover/row:text-red-500 rounded transition-colors"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                      )}
                                    </>
                                  ) : (
                                    <>
                                      <button
                                        onClick={() => setReplaceTarget({ card })}
                                        title="替換料卡"
                                        className="p-1 text-[#a08060] group-hover/row:text-[#7a5230] rounded transition-colors"
                                      >
                                        <ArrowLeftRight className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        onClick={() => handleRemoveCard(card, group.id)}
                                        title="從群組移除"
                                        className="p-1 text-[#a08060] group-hover/row:text-[#b5451b] rounded transition-colors"
                                      >
                                        <Minus className="h-3.5 w-3.5" />
                                      </button>
                                    </>
                                  )}
                                </span>
                                <button
                                  onClick={() => onCardClick(card)}
                                  className="flex items-center gap-2 flex-1 min-w-0 text-left"
                                >
                                  <span className="font-mono text-[10px] text-[#a08060] flex-shrink-0 w-16">{card.equipment_id}</span>
                                  <span className="truncate text-[#4a3422]">{card.name}</span>
                                </button>
                                <QuantityStepper
                                  value={quantity}
                                  onChange={v => handleUpdateQuantity(group.id, card.equipment_id, v)}
                                />
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`刪除「${confirmTarget?.name ?? ''}」群組？`}
        message="群組內的料卡不會被刪除，只是移除群組本身。"
        confirmLabel="刪除"
        danger
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setConfirmOpen(false); setConfirmTarget(null) }}
      />

      <ConfirmDialog
        open={!!alignConfirmGroup}
        title={`重新對齊套餐「${alignConfirmGroup ? (packagesByGroupId[alignConfirmGroup.id]?.name ?? alignConfirmGroup.name) : ''}」？`}
        message="會用此群組目前的名稱與料卡清單，整個覆蓋套餐目前的內容，無法復原。"
        confirmLabel="確定對齊"
        danger
        onConfirm={handleConfirmAlign}
        onCancel={() => setAlignConfirmGroup(null)}
      />

      {replaceTarget && (
        <ReplaceDialog
          card={replaceTarget.card}
          groups={groups}
          allCards={allCards}
          onConfirm={(newCard, targetGroupIds) =>
            handleReplace(replaceTarget.card, newCard, targetGroupIds)
          }
          onCancel={() => setReplaceTarget(null)}
        />
      )}

      {addTarget && addTargetGroup && (
        <AddCardDialog
          group={addTargetGroup}
          allCards={allCards}
          onConfirm={(ids) => handleAddCards(addTarget.groupId, ids)}
          onCancel={() => setAddTarget(null)}
        />
      )}

      {duplicateTarget && (
        <DuplicateGroupDialog
          sourceName={duplicateTarget.name}
          onConfirm={handleConfirmDuplicate}
          onCancel={() => setDuplicateTarget(null)}
        />
      )}
    </>
  )
}
