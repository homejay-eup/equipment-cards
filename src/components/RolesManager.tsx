'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface RoleData {
  id: string
  name: string
  is_system: boolean
  permissions: string[]
}

interface Props {
  initialRoles: RoleData[]
}

const PERM_LABELS: Record<string, string> = {
  read_all_cards:          '看全部料卡（含非現役）',
  read_active_only:        '只看現役料卡',
  read_documents:          '看文件/規格書',
  read_notes:              '看備註',
  read_vendor:             '看廠商',
  read_updated_by:         '看更新人員',
  read_updated_content:    '看更新內容',
  use_bookmarks:           '我的關注（書籤）',
  add_delete_cards:        '新增/刪除料卡',
  edit_cards:              '編輯料卡',
  edit_field_id:           '└ 料號',
  edit_field_name:         '└ 品名',
  edit_field_category:     '└ 分類',
  edit_field_status:       '└ 狀態',
  edit_field_vendor:       '└ 廠商',
  edit_field_tags:         '└ 標籤',
  edit_field_notes:        '└ 備註',
  edit_field_net_weight:   '└ 淨重／淨重照片',
  edit_field_documents:    '└ 文件連結',
  edit_field_is_new:       '└ 新品標記',
  edit_field_main_photo:   '└ 主照片',
  edit_field_detail_photos:'└ 細節照片',
  manage_users:            '帳號管理/指派角色',
  manage_roles:            '角色與權限設定',
  use_groups:              '群組功能',
  // 追蹤板
  view_tracker:            '可看追蹤板',
  view_my_tasks:           '我的任務 + badge',
  create_issues:           '可新增議題',
}

const VISIBILITY_PERMS = ['read_all_cards', 'read_active_only'] as const
const DETAIL_PERMS = [
  'read_documents',
  'read_notes',
  'read_vendor',
  'read_updated_by',
  'read_updated_content',
] as const
const FEATURE_PERMS = [
  'use_bookmarks',
  'add_delete_cards',
  'edit_cards',
  'manage_users',
  'manage_roles',
  'use_groups',
] as const

const EDIT_FIELD_PERMS = [
  'edit_field_id', 'edit_field_name', 'edit_field_category', 'edit_field_status',
  'edit_field_vendor', 'edit_field_tags', 'edit_field_notes', 'edit_field_net_weight',
  'edit_field_documents', 'edit_field_is_new', 'edit_field_main_photo', 'edit_field_detail_photos',
] as const

const TRACKER_PERMS = [
  'view_tracker',
  'view_my_tasks',
  'create_issues',
] as const

export default function RolesManager({ initialRoles }: Props) {
  const [roles, setRoles] = useState<RoleData[]>(initialRoles)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)

  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePerms, setNewRolePerms] = useState<string[]>([])
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [savingPermId, setSavingPermId] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)
  const [draftPerms, setDraftPerms] = useState<Record<string, string[]>>({})

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<RoleData | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  function toggleExpand(id: string, role: RoleData) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setDraftPerms(d => ({ ...d, [id]: [...role.permissions] }))
      }
      return next
    })
  }

  function startRename(role: RoleData) {
    setEditingId(role.id)
    setEditingName(role.name)
  }

  async function saveRename(role: RoleData) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === role.name) {
      setEditingId(null)
      return
    }
    setSavingNameId(role.id)
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? '重命名失敗')
      } else {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, name: trimmed } : r))
        setEditingId(null)
      }
    } catch {
      alert('重命名失敗，請重試')
    } finally {
      setSavingNameId(null)
    }
  }

  async function updatePermissions(role: RoleData, newPerms: string[]) {
    setSavingPermId(role.id)
    setPermError(null)
    try {
      const res = await fetch(`/api/roles/${role.id}/permissions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissions: newPerms }),
      })
      if (!res.ok) {
        const d = await res.json()
        setPermError(d.error ?? '權限更新失敗')
      } else {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: newPerms } : r))
      }
    } catch {
      setPermError('權限更新失敗，請重試')
    } finally {
      setSavingPermId(null)
    }
  }

  function getDraft(role: RoleData): string[] {
    return draftPerms[role.id] ?? role.permissions
  }

  function hasDraftChanges(role: RoleData): boolean {
    const draft = getDraft(role)
    const saved = role.permissions
    return draft.length !== saved.length || draft.some(p => !saved.includes(p))
  }

  function handleVisibilityChange(role: RoleData, selected: 'read_all_cards' | 'read_active_only') {
    const removed = selected === 'read_all_cards' ? 'read_active_only' : 'read_all_cards'
    const cur = getDraft(role).filter(p => p !== removed)
    const result = cur.includes(selected) ? cur : [...cur, selected]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function handleDetailToggle(role: RoleData, key: string) {
    const cur = getDraft(role)
    const result = cur.includes(key) ? cur.filter(p => p !== key) : [...cur, key]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function discardDraft(role: RoleData) {
    setDraftPerms(d => ({ ...d, [role.id]: [...role.permissions] }))
    setPermError(null)
  }

  async function saveDraft(role: RoleData) {
    const draft = getDraft(role)
    await updatePermissions(role, draft)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newRoleName.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed, permissions: newRolePerms }),
      })
      const d = await res.json()
      if (!res.ok) {
        setCreateError(d.error ?? '新增失敗')
        return
      }
      const newRole: RoleData = {
        id: d.id ?? d.role?.id ?? String(Date.now()),
        name: trimmed,
        is_system: false,
        permissions: newRolePerms,
      }
      setRoles(prev => [...prev, newRole])
      setNewRoleName('')
      setNewRolePerms([])
      setNewRoleOpen(false)
    } catch {
      setCreateError('新增失敗，請重試')
    } finally {
      setCreating(false)
    }
  }

  function askDelete(role: RoleData) {
    setPendingDelete(role)
    setDeleteError(null)
    setConfirmOpen(true)
  }

  async function doDelete(role: RoleData) {
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        setDeleteError(d.error ?? '此角色仍有使用者，無法刪除')
        return
      }
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? '刪除失敗')
        return
      }
      setRoles(prev => prev.filter(r => r.id !== role.id))
    } catch {
      setDeleteError('刪除失敗，請重試')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#6b4f38]">角色清單</h2>
        <button
          onClick={() => setNewRoleOpen(v => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.35)]"
        >
          <Plus className="h-4 w-4" />
          新增角色
        </button>
      </div>

      {/* 新增角色 inline form */}
      {newRoleOpen && (
        <div className="bg-white rounded-xl border border-[rgba(122,82,48,.2)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#6b4f38] mb-3">新增角色</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              placeholder="角色名稱（如：倉管人員）"
              required
              disabled={creating}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
            />
            <p className="text-xs text-[#a08060]">初始權限（可新增後再調整）</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {Object.entries(PERM_LABELS)
                .filter(([key]) => !(EDIT_FIELD_PERMS as readonly string[]).includes(key))
                .map(([key, label]) => (
                  <div key={key} className="col-span-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(key)}
                        onChange={() => {
                          setNewRolePerms(prev =>
                            prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key]
                          )
                        }}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">{label}</span>
                    </label>
                    {key === 'edit_cards' && newRolePerms.includes('edit_cards') && (
                      <div className="pl-5 mt-1 space-y-1 col-span-2">
                        {EDIT_FIELD_PERMS.map(fkey => (
                          <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={newRolePerms.includes(fkey)}
                              onChange={() => {
                                setNewRolePerms(prev =>
                                  prev.includes(fkey) ? prev.filter(p => p !== fkey) : [...prev, fkey]
                                )
                              }}
                              className="accent-[#7a5230]"
                            />
                            <span className="text-xs text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              }
            </div>
            {createError && <p className="text-xs text-[#b5451b]">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setNewRoleOpen(false); setNewRoleName(''); setNewRolePerms([]); setCreateError(null) }}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating || !newRoleName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                新增
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {deleteError}
        </div>
      )}

      {permError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {permError}
        </div>
      )}

      {/* 角色卡片清單 */}
      {roles.length === 0 && (
        <p className="text-sm text-[#a08060] py-8 text-center">尚無角色資料（請先執行 SQL migration）</p>
      )}

      {roles.map(role => {
        const isExpanded = expandedIds.has(role.id)
        const isRenamingThis = editingId === role.id
        const isSavingPerm = savingPermId === role.id
        const isSavingName = savingNameId === role.id
        const draft = getDraft(role)
        const isDirty = hasDraftChanges(role)
        const visibility = draft.includes('read_all_cards') ? 'read_all_cards' : draft.includes('read_active_only') ? 'read_active_only' : null

        return (
          <div key={role.id} className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden">
            {/* 卡片 Header */}
            <div className="px-5 py-4 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                {isRenamingThis ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(role)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => saveRename(role)}
                      autoFocus
                      disabled={isSavingName}
                      className="border border-[#c49a72] rounded-lg px-2 py-1 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 w-40"
                    />
                    {isSavingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />}
                    <button
                      type="button"
                      onClick={() => saveRename(role)}
                      disabled={isSavingName}
                      className="text-[#7a5230] hover:text-[#5a3820] disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[#a08060] hover:text-[#6b4f38]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-[#2c1e12] text-sm">{role.name}</span>
                    {role.is_system && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                        系統
                      </span>
                    )}
                  </div>
                )}
                <p className="text-xs text-[#a08060] mt-0.5">
                  {visibility === 'read_all_cards'
                    ? '可見性：看全部料卡'
                    : visibility === 'read_active_only'
                    ? '可見性：只看現役料卡'
                    : '可見性：未設定'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {!role.is_system && (
                  <>
                    <button
                      onClick={() => startRename(role)}
                      title="重命名"
                      className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => askDelete(role)}
                      title="刪除角色"
                      className="p-1.5 rounded-lg text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
                <button
                  onClick={() => toggleExpand(role.id, role)}
                  title={isExpanded ? '收合' : '展開'}
                  className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 展開的權限編輯區 */}
            {isExpanded && (
              <div className="border-t border-[rgba(122,82,48,.1)] px-5 py-4 space-y-4 bg-[#faf6f0]">
                {isSavingPerm && (
                  <div className="flex items-center gap-2 text-xs text-[#a08060]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    儲存中…
                  </div>
                )}

                {/* 可見性：Radio */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">可見性</p>
                  <div className="space-y-1.5">
                    {VISIBILITY_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`visibility-${role.id}`}
                          checked={draft.includes(key)}
                          onChange={() => handleVisibilityChange(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 料卡細節：Checkbox */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">料卡細節</p>
                  <div className="space-y-1.5">
                    {DETAIL_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 功能權限：Checkbox */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">功能權限</p>
                  <div className="space-y-1.5">
                    {FEATURE_PERMS.map(key => (
                      <div key={key}>
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={draft.includes(key)}
                            onChange={() => handleDetailToggle(role, key)}
                            disabled={isSavingPerm}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                        </label>
                        {key === 'edit_cards' && draft.includes('edit_cards') && (
                          <div className="pl-5 mt-1 space-y-1.5">
                            {EDIT_FIELD_PERMS.map(fkey => (
                              <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={draft.includes(fkey)}
                                  onChange={() => handleDetailToggle(role, fkey)}
                                  disabled={isSavingPerm}
                                  className="accent-[#7a5230]"
                                />
                                <span className="text-sm text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* 追蹤板：Checkbox */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">追蹤板</p>
                  <div className="space-y-1.5">
                    {TRACKER_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 儲存 / 取消 */}
                {isDirty && (
                  <div className="flex items-center gap-2 pt-1 border-t border-[rgba(122,82,48,.1)]">
                    <button
                      onClick={() => saveDraft(role)}
                      disabled={isSavingPerm}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
                    >
                      {isSavingPerm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                      儲存變更
                    </button>
                    <button
                      onClick={() => discardDraft(role)}
                      disabled={isSavingPerm}
                      className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-50 transition-colors"
                    >
                      取消
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={confirmOpen}
        title={`刪除角色「${pendingDelete?.name}」？`}
        message="刪除後無法復原。若仍有使用者套用此角色，將無法刪除。"
        confirmLabel="刪除"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          if (pendingDelete) doDelete(pendingDelete)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
