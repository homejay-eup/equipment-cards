'use client'

import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import Fuse from 'fuse.js'
import { EquipmentCard, UserGroup } from '@/types/equipment'
import ConfirmDialog from '@/components/ConfirmDialog'
import { Star, ChevronDown, ChevronRight, Plus, Check, Pencil, Trash2, ArrowLeftRight, Search, Loader2, X } from 'lucide-react'

interface GroupsPanelProps {
  initialGroups: UserGroup[]
  allCards: EquipmentCard[]
  onCardClick: (card: EquipmentCard) => void
  onGroupsChange: (groups: UserGroup[]) => void
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
    if (!q) return allCards.slice(0, 20)
    if (/^\d+$/.test(q)) {
      return allCards.filter(c => c.equipment_id.includes(q) || c.name.includes(q)).slice(0, 20)
    }
    return fuse.search(q).map(r => r.item).slice(0, 20)
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
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
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
            <div className="max-h-36 overflow-y-auto border border-[#e8ddd0] rounded-lg divide-y divide-[rgba(122,82,48,.08)]">
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

// ── 主元件 ────────────────────────────────────────────────────────
export default function GroupsPanel({ initialGroups, allCards, onCardClick, onGroupsChange }: GroupsPanelProps) {
  const [groups, setGroups] = useState<UserGroup[]>(initialGroups)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [isLoading, setIsLoading] = useState(false)

  const [addingGroup, setAddingGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [savingNew, setSavingNew] = useState(false)
  const newGroupInputRef = useRef<HTMLInputElement>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState<UserGroup | null>(null)

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [replaceTarget, setReplaceTarget] = useState<{ card: EquipmentCard } | null>(null)

  // 掛載時載入資料（觸發懶遷移）
  useEffect(() => {
    setIsLoading(true)
    fetch('/api/groups')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          setGroups(data)
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
    setSavingNew(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const newGroup: UserGroup = await res.json()
        applyGroups([...groups, newGroup])
        setNewGroupName('')
        setAddingGroup(false)
      }
    } finally {
      setSavingNew(false)
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
    if (!name) { setRenamingId(null); return }
    const res = await fetch(`/api/groups/${groupId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    if (res.ok) {
      applyGroups(groups.map(g => g.id === groupId ? { ...g, name } : g))
    }
    setRenamingId(null)
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
        const items = g.group_items.filter(i => i.equipment_id !== oldCard.equipment_id)
        if (!items.some(i => i.equipment_id === newCard.equipment_id)) {
          items.unshift({ equipment_id: newCard.equipment_id, added_at: now })
        }
        return { ...g, group_items: items }
      }))
    }
    setReplaceTarget(null)
  }, [groups]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-[#a08060]">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            <span className="text-sm">載入中…</span>
          </div>
        ) : (
          <div className="space-y-2">
            {groups.map(group => {
              const isExpanded = expandedIds.has(group.id)
              const itemCount = group.group_items.length

              return (
                <div key={group.id} className="border border-[rgba(122,82,48,.15)] rounded-xl overflow-hidden bg-white">
                  {/* 群組標題列 */}
                  <div className="flex items-center gap-1 px-4 py-3 hover:bg-[rgba(122,82,48,.03)] group">
                    <button
                      onClick={() => toggleExpand(group.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 text-left"
                    >
                      {group.is_default && (
                        <Star className="h-4 w-4 text-amber-400 fill-amber-400 flex-shrink-0" />
                      )}
                      {renamingId === group.id ? (
                        <input
                          autoFocus
                          value={renameValue}
                          onChange={e => setRenameValue(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handleRenameSubmit(group.id)
                            if (e.key === 'Escape') setRenamingId(null)
                          }}
                          onBlur={() => handleRenameSubmit(group.id)}
                          onClick={e => e.stopPropagation()}
                          className="flex-1 text-sm font-medium text-[#5a3820] bg-white border border-[#c49a72] rounded px-2 py-0.5 focus:outline-none min-w-0"
                        />
                      ) : (
                        <span className="text-sm font-semibold text-[#5a3820] truncate flex-1">{group.name}</span>
                      )}
                      <span className="text-xs text-[#a08060] flex-shrink-0">{itemCount} 筆</span>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                        : <ChevronRight className="h-4 w-4 text-[#a08060] flex-shrink-0" />
                      }
                    </button>

                    {!group.is_default && (
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 ml-2">
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

                  {/* 展開的料卡網格 */}
                  {isExpanded && (
                    <div className="border-t border-[rgba(122,82,48,.1)] bg-[rgba(122,82,48,.02)] px-4 py-3">
                      {itemCount === 0 ? (
                        <p className="text-sm text-[#b0967a] italic py-2">此群組尚無料卡</p>
                      ) : (
                        <div className="divide-y divide-[rgba(122,82,48,.06)]">
                          {group.group_items.map(item => {
                            const card = allCards.find(c => c.equipment_id === item.equipment_id)
                            if (!card) {
                              return (
                                <div key={item.equipment_id} className="flex items-center gap-3 py-2.5">
                                  <div className="h-12 w-12 rounded-lg bg-[rgba(122,82,48,.08)] flex items-center justify-center flex-shrink-0">
                                    <span className="text-[10px] text-[#a08060]">—</span>
                                  </div>
                                  <span className="text-sm text-[#b0967a] italic">料卡已刪除</span>
                                </div>
                              )
                            }
                            return (
                              <div key={item.equipment_id} className="flex items-center gap-3 py-2.5 hover:bg-[rgba(122,82,48,.04)] -mx-4 px-4 rounded group/item transition-colors">
                                {card.main_photo ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={card.main_photo}
                                    alt={card.name}
                                    width={48}
                                    height={48}
                                    className="h-12 w-12 object-cover rounded-lg flex-shrink-0 border border-[rgba(122,82,48,.15)]"
                                  />
                                ) : (
                                  <div className="h-12 w-12 rounded-lg bg-[rgba(122,82,48,.08)] flex items-center justify-center flex-shrink-0 border border-[rgba(122,82,48,.1)]">
                                    <span className="text-[10px] text-[#a08060]">無圖</span>
                                  </div>
                                )}
                                <button
                                  onClick={() => onCardClick(card)}
                                  className="flex-1 min-w-0 text-left"
                                >
                                  <p className="text-[11px] font-mono text-[#a08060] leading-none">{card.equipment_id}</p>
                                  <p className="text-sm text-[#4a3422] mt-0.5 truncate leading-snug font-medium">{card.name}</p>
                                  {card.vendor && (
                                    <p className="text-xs text-[#a08060] mt-0.5 truncate">{card.vendor}</p>
                                  )}
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); setReplaceTarget({ card }) }}
                                  className="p-2 text-[#c49a72] hover:text-[#7a5230] transition-colors rounded-lg opacity-0 group-hover/item:opacity-100 flex-shrink-0"
                                  title="替換料卡"
                                >
                                  <ArrowLeftRight className="h-4 w-4" />
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}

            {/* 新增群組 */}
            <div className="border border-dashed border-[rgba(122,82,48,.25)] rounded-xl px-4 py-3">
              {addingGroup ? (
                <div className="flex items-center gap-2">
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
                    disabled={savingNew}
                    className="flex items-center justify-center w-8 h-8 bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
                  >
                    {savingNew ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
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
                  className="flex items-center gap-2 text-sm text-[#a08060] hover:text-[#7a5230] transition-colors w-full"
                >
                  <Plus className="h-4 w-4" />
                  新增群組
                </button>
              )}
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
    </>
  )
}
