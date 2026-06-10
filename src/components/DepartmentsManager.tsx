'use client'

import { useState } from 'react'
import { Loader2, Check, X, Pencil, Trash2, Plus, AlertTriangle } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface Department {
  id: string
  name: string
  created_at?: string
}

interface DeptRoleBasic {
  id: string
  name: string
  is_system: boolean
  department_id: string | null
  department_name: string | null
  level: string | null
}

interface Props {
  initialDepartments: Department[]
  initialRoles: DeptRoleBasic[]
}

const LEVEL_BADGE: Record<string, { label: string; className: string }> = {
  super_admin: {
    label: '管理員',
    className: 'bg-red-50 text-red-700 border border-red-200',
  },
  dept_admin: {
    label: '部門管理員',
    className: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  member: {
    label: '成員',
    className: 'bg-blue-50 text-blue-700 border border-blue-200',
  },
  viewer: {
    label: '一般',
    className: 'bg-gray-50 text-gray-600 border border-gray-200',
  },
}

function LevelBadge({ level }: { level: string | null }) {
  if (!level) return null
  const cfg = LEVEL_BADGE[level]
  if (!cfg) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-50 text-gray-600 border border-gray-200">
        {level}
      </span>
    )
  }
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}

export default function DepartmentsManager({ initialDepartments, initialRoles }: Props) {
  const [departments, setDepartments] = useState<Department[]>(initialDepartments)
  const [roles, setRoles] = useState<DeptRoleBasic[]>(initialRoles)

  // 新增部門
  const [addingDept, setAddingDept] = useState(false)
  const [newDeptName, setNewDeptName] = useState('')
  const [addingError, setAddingError] = useState<string | null>(null)
  const [addingSaving, setAddingSaving] = useState(false)

  // 改名部門
  const [editingDeptId, setEditingDeptId] = useState<string | null>(null)
  const [editingDeptName, setEditingDeptName] = useState('')
  const [renamingError, setRenamingError] = useState<string | null>(null)

  // 刪除部門
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteDept, setPendingDeleteDept] = useState<Department | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // 更換角色部門
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [roleError, setRoleError] = useState<string | null>(null)

  // 未分配角色數
  const unassignedCount = roles.filter(r => r.department_id === null).length

  // 按部門分組
  const groupMap = new Map<string | null, DeptRoleBasic[]>()
  groupMap.set(null, [])
  for (const dept of departments) {
    groupMap.set(dept.id, [])
  }
  for (const role of roles) {
    const key = role.department_id
    if (!groupMap.has(key)) groupMap.set(key, [])
    groupMap.get(key)!.push(role)
  }

  // --- 新增部門 ---
  async function handleAddDept() {
    const trimmed = newDeptName.trim()
    if (!trimmed) return
    setAddingSaving(true)
    setAddingError(null)
    try {
      const res = await fetch('/api/departments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const d = await res.json()
      if (!res.ok) {
        setAddingError(d.error ?? '新增失敗')
        return
      }
      setDepartments(prev => [...prev, d as Department])
      setNewDeptName('')
      setAddingDept(false)
    } catch {
      setAddingError('新增失敗，請重試')
    } finally {
      setAddingSaving(false)
    }
  }

  // --- 改名部門 ---
  function startRenaming(dept: Department) {
    setEditingDeptId(dept.id)
    setEditingDeptName(dept.name)
    setRenamingError(null)
  }

  async function saveRename(deptId: string) {
    const trimmed = editingDeptName.trim()
    const original = departments.find(d => d.id === deptId)
    if (!trimmed || trimmed === original?.name) {
      setEditingDeptId(null)
      return
    }
    setSaving(deptId)
    setRenamingError(null)
    try {
      const res = await fetch(`/api/departments/${deptId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      const d = await res.json()
      if (!res.ok) {
        setRenamingError(d.error ?? '改名失敗')
        return
      }
      setDepartments(prev => prev.map(dep => dep.id === deptId ? { ...dep, name: trimmed } : dep))
      setRoles(prev => prev.map(r => r.department_id === deptId ? { ...r, department_name: trimmed } : r))
      setEditingDeptId(null)
    } catch {
      setRenamingError('改名失敗，請重試')
    } finally {
      setSaving(null)
    }
  }

  // --- 刪除部門 ---
  function askDeleteDept(dept: Department) {
    setPendingDeleteDept(dept)
    setDeleteError(null)
    setConfirmOpen(true)
  }

  async function doDeleteDept(dept: Department) {
    try {
      const res = await fetch(`/api/departments/${dept.id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        setDeleteError(d.error ?? '仍有角色屬於此部門')
        return
      }
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? '刪除失敗')
        return
      }
      setDepartments(prev => prev.filter(d => d.id !== dept.id))
    } catch {
      setDeleteError('刪除失敗，請重試')
    }
  }

  // --- 更換角色部門 ---
  async function changeRoleDept(roleId: string, newDeptId: string) {
    setSaving(roleId)
    setRoleError(null)
    try {
      const res = await fetch(`/api/roles/${roleId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ department_id: newDeptId || null }),
      })
      if (!res.ok) {
        const d = await res.json()
        setRoleError(d.error ?? '儲存失敗')
        return
      }
      const newDept = departments.find(d => d.id === newDeptId) ?? null
      setRoles(prev => prev.map(r =>
        r.id === roleId
          ? { ...r, department_id: newDeptId || null, department_name: newDept?.name ?? null }
          : r
      ))
      setEditingRoleId(null)
    } catch {
      setRoleError('儲存失敗，請重試')
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="space-y-4">
      {/* 未分配警示 banner */}
      {unassignedCount > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-700">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span>有 {unassignedCount} 個角色尚未分配部門</span>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#6b4f38]">部門群組</h2>
        <button
          type="button"
          onClick={() => { setAddingDept(true); setNewDeptName(''); setAddingError(null) }}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.35)]"
        >
          <Plus className="h-4 w-4" />
          新增部門
        </button>
      </div>

      {/* 新增部門 inline form */}
      {addingDept && (
        <div className="bg-white rounded-xl border border-[rgba(122,82,48,.2)] p-4 shadow-sm">
          <p className="text-sm font-semibold text-[#6b4f38] mb-2">新增部門</p>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAddDept()
                if (e.key === 'Escape') { setAddingDept(false); setAddingError(null) }
              }}
              placeholder="部門名稱（如：engineering）"
              disabled={addingSaving}
              autoFocus
              className="flex-1 border border-[#c49a72] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 transition-all"
            />
            <button
              type="button"
              onClick={handleAddDept}
              disabled={addingSaving || !newDeptName.trim()}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
            >
              {addingSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
              儲存
            </button>
            <button
              type="button"
              onClick={() => { setAddingDept(false); setAddingError(null) }}
              className="px-3 py-2 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {addingError && <p className="mt-2 text-xs text-[#b5451b]">{addingError}</p>}
        </div>
      )}

      {/* 錯誤訊息 */}
      {deleteError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {deleteError}
        </div>
      )}
      {roleError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {roleError}
        </div>
      )}
      {renamingError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {renamingError}
        </div>
      )}

      {roles.length === 0 && departments.length === 0 && (
        <p className="text-sm text-[#a08060] py-8 text-center">尚無角色或部門資料</p>
      )}

      {/* 各部門群組 */}
      {departments.map(dept => {
        const members = groupMap.get(dept.id) ?? []
        const isRenamingThis = editingDeptId === dept.id
        const isSavingThis = saving === dept.id
        const hasMember = members.length > 0

        return (
          <div
            key={dept.id}
            className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden"
          >
            {/* 部門 header */}
            <div className="px-5 py-3 border-b border-[rgba(122,82,48,.1)] bg-[rgba(122,82,48,.03)]">
              <div className="flex items-center gap-2">
                {isRenamingThis ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <input
                      type="text"
                      value={editingDeptName}
                      onChange={e => setEditingDeptName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(dept.id)
                        if (e.key === 'Escape') setEditingDeptId(null)
                      }}
                      disabled={isSavingThis}
                      autoFocus
                      className="border border-[#c49a72] rounded-lg px-2 py-1 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 w-40"
                    />
                    {isSavingThis ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => saveRename(dept.id)}
                          className="p-1 rounded text-[#7a5230] hover:text-[#5a3820] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                          title="儲存"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingDeptId(null)}
                          className="p-1 rounded text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                          title="取消"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm font-semibold text-[#7a5230]">{dept.name}</span>
                    <span className="text-xs text-[#a08060]">（{members.length} 個角色）</span>
                    <div className="flex items-center gap-1 ml-1">
                      <button
                        type="button"
                        onClick={() => startRenaming(dept)}
                        title="改名"
                        className="p-1 rounded text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      {!hasMember && (
                        <button
                          type="button"
                          onClick={() => askDeleteDept(dept)}
                          title="刪除部門"
                          className="p-1 rounded text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 角色列表 */}
            {members.length === 0 ? (
              <div className="px-5 py-3 text-xs text-[#a08060] italic">此部門目前沒有角色</div>
            ) : (
              <div className="divide-y divide-[rgba(122,82,48,.08)]">
                {members.map(role => {
                  const isEditingRole = editingRoleId === role.id
                  const isSavingRole = saving === role.id
                  return (
                    <div key={role.id} className="px-5 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-[#2c1e12]">{role.name}</span>
                          {role.is_system && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                              系統
                            </span>
                          )}
                          <LevelBadge level={role.level} />
                        </div>
                      </div>

                      {/* 切換部門 */}
                      <div className="shrink-0 flex items-center gap-2">
                        {isEditingRole ? (
                          <div className="flex items-center gap-1.5">
                            {isSavingRole ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />
                            ) : (
                              <select
                                value={role.department_id ?? ''}
                                onChange={e => changeRoleDept(role.id, e.target.value)}
                                autoFocus
                                className="border border-[#c49a72] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72]"
                              >
                                <option value="">（清除）</option>
                                {departments.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                            )}
                            <button
                              type="button"
                              onClick={() => setEditingRoleId(null)}
                              className="p-1 rounded text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                              title="取消"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditingRoleId(role.id)}
                            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] border border-transparent hover:border-[rgba(122,82,48,.2)] transition-all group"
                            title="更換部門"
                          >
                            <span>{role.department_name ?? <span className="italic text-[#c8b8a6]">無</span>}</span>
                            <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* 未分配群組 */}
      {(groupMap.get(null) ?? []).length > 0 && (
        <div className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-[rgba(122,82,48,.1)] bg-[rgba(122,82,48,.03)]">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[#a08060] italic">未分配</span>
              <span className="text-xs text-[#a08060]">（{(groupMap.get(null) ?? []).length} 個角色）</span>
            </div>
          </div>
          <div className="divide-y divide-[rgba(122,82,48,.08)]">
            {(groupMap.get(null) ?? []).map(role => {
              const isEditingRole = editingRoleId === role.id
              const isSavingRole = saving === role.id
              return (
                <div key={role.id} className="px-5 py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-[#2c1e12]">{role.name}</span>
                      {role.is_system && (
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                          系統
                        </span>
                      )}
                      <LevelBadge level={role.level} />
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {isEditingRole ? (
                      <div className="flex items-center gap-1.5">
                        {isSavingRole ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />
                        ) : (
                          <select
                            value={role.department_id ?? ''}
                            onChange={e => changeRoleDept(role.id, e.target.value)}
                            autoFocus
                            className="border border-[#c49a72] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72]"
                          >
                            <option value="">（清除）</option>
                            {departments.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingRoleId(null)}
                          className="p-1 rounded text-[#a08060] hover:text-[#6b4f38] hover:bg-[rgba(122,82,48,.08)] transition-colors"
                          title="取消"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setEditingRoleId(role.id)}
                        className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] border border-transparent hover:border-[rgba(122,82,48,.2)] transition-all group"
                        title="指派部門"
                      >
                        <span className="italic text-[#c8b8a6]">無</span>
                        <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 刪除部門確認 Dialog */}
      <ConfirmDialog
        open={confirmOpen}
        title={`刪除部門「${pendingDeleteDept?.name}」？`}
        message="刪除後無法復原。若部門下仍有角色，請先將角色移出再刪除。"
        confirmLabel="刪除"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          if (pendingDeleteDept) doDeleteDept(pendingDeleteDept)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingDeleteDept(null)
        }}
      />
    </div>
  )
}
