'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Loader2, Shield, Trash2, UserPlus, ChevronDown, ChevronUp, ChevronsUpDown, ShieldCheck, RefreshCw, Users, BarChart3, Search } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

interface UserRow {
  email: string
  role: string
  created_at: string
  auth_created_at?: string | null
  last_sign_in_at?: string | null
}

interface Props {
  initialUsers: UserRow[]
  currentUserEmail: string
  availableRoles: string[]
  permissions?: string[]
  canSyncUsers?: boolean
  // Step 40：嵌入首頁「系統管理」分頁後，切到角色管理/使用統計改為呼叫這個 callback 切子分頁，
  // 不再是 <Link> 導頁。唯一呼叫端（UserManagementPanel）一定會傳入，未傳入時不渲染這個按鈕。
  onSwitchSubTab?: (tab: 'roles' | 'departments' | 'analytics') => void
}

function formatDate(iso?: string | null) {
  if (!iso) return '尚未登入'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UserManagementTable({ initialUsers, currentUserEmail, availableRoles, permissions = [], canSyncUsers = false, onSwitchSubTab }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  // Step 40：嵌入首頁分頁後，UserManagementPanel 每次切回這個子分頁都會重新 fetch 一份
  // initialUsers 傳進來（不會整個 remount 這個元件，避免打斷使用者正在編輯的搜尋/新增表單/
  // 角色下拉等 UI 狀態）。這裡只同步「使用者清單」本身，其他 local state（searchQuery、
  // newEmail、openRoleEmail 等）都是獨立的 useState，不受影響。
  useEffect(() => {
    setUsers(initialUsers)
  }, [initialUsers])
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingRemove, setPendingRemove] = useState<UserRow | null>(null)

  const [syncing, setSyncing] = useState(false)
  const [syncMessage, setSyncMessage] = useState<{ text: string; isError: boolean } | null>(null)

  const [searchQuery, setSearchQuery] = useState('')

  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<string>(availableRoles[0] ?? 'viewer')
  const [roleOpen, setRoleOpen] = useState(false)
  const roleRef = useRef<HTMLDivElement>(null)
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

  // 每行的角色下拉：改用 fixed 定位避免被 overflow-hidden 截斷
  const [openRoleEmail, setOpenRoleEmail] = useState<string | null>(null)
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; triggerTop?: number }>({ top: 0, left: 0 })
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!roleOpen) return
    const close = (e: MouseEvent) => {
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [roleOpen])

  useEffect(() => {
    if (!openRoleEmail) return
    const close = (e: MouseEvent) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target as Node)) return
      setOpenRoleEmail(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [openRoleEmail])

  // 下拉清單位置修正：底部超出視窗時往上翻
  useEffect(() => {
    if (!openRoleEmail || !dropdownRef.current) return
    const dd = dropdownRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    if (dd.bottom > vh - 8) {
      const triggerTop = dropdownPos.triggerTop ?? (dropdownPos.top - dd.height - 8)
      setDropdownPos(prev => ({
        ...prev,
        top: Math.max(8, triggerTop - dd.height - 4),
      }))
    }
  }, [openRoleEmail])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), role: newRole }),
      })
      const d = await res.json()
      if (!res.ok) { setAddError(d.error ?? '新增失敗'); return }
      setUsers(prev => [...prev, {
        email: newEmail.trim().toLowerCase(),
        role: newRole,
        created_at: new Date().toISOString(),
        auth_created_at: d.auth_created_at ?? null,
        last_sign_in_at: d.last_sign_in_at ?? null,
      }])
      setNewEmail('')
      setNewRole(availableRoles[0] ?? 'viewer')
    } catch {
      setAddError('新增失敗，請重試')
    } finally {
      setAdding(false)
    }
  }

  async function changeRole(user: UserRow, nextRole: string) {
    setLoadingEmail(user.email)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, role: nextRole }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '更新失敗'); return }
      setUsers(prev => prev.map(u => u.email === user.email ? { ...u, role: nextRole } : u))
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setLoadingEmail(null)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => u.email.toLowerCase().includes(q) || u.role.toLowerCase().includes(q))
  }, [users, searchQuery])

  // 前端排序：Email／角色（字串）、初始登入／最後登入（時間，未登入的 null 一律排最後）
  type SortKey = 'email' | 'role' | 'auth_created_at' | 'last_sign_in_at'
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' })

  function handleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const sortedUsers = useMemo(() => {
    if (!sort.key) return filteredUsers
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = sort.key
    return [...filteredUsers].sort((a, b) => {
      if (key === 'email' || key === 'role') {
        return a[key].localeCompare(b[key], 'zh-Hant') * dir
      }
      // 時間欄位：null（尚未登入）恆排最後，不受升降序影響
      const av = a[key] ? new Date(a[key] as string).getTime() : null
      const bv = b[key] ? new Date(b[key] as string).getTime() : null
      if (av === null && bv === null) return 0
      if (av === null) return 1
      if (bv === null) return -1
      return (av - bv) * dir
    })
  }, [filteredUsers, sort])

  function SortIcon({ column }: { column: SortKey }) {
    if (sort.key !== column) return <ChevronsUpDown className="h-3 w-3 opacity-40" />
    return sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />
  }

  function handleRemove(user: UserRow) {
    setPendingRemove(user)
    setConfirmOpen(true)
  }

  async function syncUsers() {
    setSyncing(true)
    setSyncMessage(null)
    try {
      const res = await fetch('/api/admin/sync-users', { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { setSyncMessage({ text: d.error ?? '同步失敗', isError: true }); return }
      const added = (d.added ?? []) as UserRow[]
      if (added.length > 0) {
        setUsers(prev => [
          ...prev,
          ...added.filter(newUser => !prev.some(u => u.email === newUser.email)),
        ])
        setSyncMessage({ text: `已同步，新增 ${added.length} 位使用者`, isError: false })
      } else {
        setSyncMessage({ text: '已是最新，沒有新帳號', isError: false })
      }
    } catch {
      setSyncMessage({ text: '同步失敗，請重試', isError: true })
    } finally {
      setSyncing(false)
    }
  }

  async function doRemove(user: UserRow) {
    setLoadingEmail(user.email)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '移除失敗'); return }
      setUsers(prev => prev.filter(u => u.email !== user.email))
    } catch {
      setError('移除失敗，請重試')
    } finally {
      setLoadingEmail(null)
    }
  }

  return (
    <>
      <header className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#7a5230]" />
              <h1 className="text-xl font-bold text-[#7a5230]">帳號管理</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {canSyncUsers && (
              <button
                type="button"
                onClick={syncUsers}
                disabled={syncing}
                className="flex items-center gap-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                同步公司帳號
              </button>
            )}
            {permissions.includes('view_analytics') && onSwitchSubTab && (
              <button
                type="button"
                onClick={() => onSwitchSubTab('analytics')}
                className="flex items-center gap-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
              >
                <BarChart3 className="h-4 w-4" />
                使用統計
              </button>
            )}
            {permissions.includes('manage_roles') && onSwitchSubTab && (
              <button
                type="button"
                onClick={() => onSwitchSubTab('roles')}
                className="flex items-center gap-1.5 text-sm text-[#7a5230] border border-[rgba(122,82,48,.25)] bg-[rgba(122,82,48,.05)] rounded-md px-3 py-1.5 hover:bg-[rgba(122,82,48,.12)] transition-colors whitespace-nowrap"
              >
                <ShieldCheck className="h-4 w-4" />
                角色管理
              </button>
            )}
          </div>
        </div>
        {syncMessage && (
          <div className="max-w-4xl mx-auto px-4 pb-3 -mt-1">
            <p className={`text-xs ${syncMessage.isError ? 'text-[#b5451b]' : 'text-[#7a5230]'}`}>{syncMessage.text}</p>
          </div>
        )}
      </header>

      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">

      {/* 新增 Email 表單 */}
      <div className="bg-white rounded-xl border border-[rgba(122,82,48,.15)] p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#6b4f38] flex items-center gap-2 mb-1">
          <UserPlus className="h-4 w-4 text-[#7a5230]" />
          指派角色
        </h2>
        <p className="text-xs text-[#a08060] mb-3">所有公司帳號皆可登入；在此加入的 Email 可指定為管理員。角色變更將於對方重新整理頁面後生效。</p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="輸入公司 Email 地址"
            required
            disabled={adding}
            className="flex-1 border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
          />

          {/* 自訂角色下拉 */}
          <div ref={roleRef} className="relative shrink-0">
            <button
              type="button"
              onClick={() => !adding && setRoleOpen(v => !v)}
              disabled={adding}
              className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm bg-[#faf6f0] text-[#6b4f38] cursor-pointer transition-all focus:outline-none disabled:opacity-50 whitespace-nowrap ${
                roleOpen
                  ? 'border-[#c49a72] shadow-[0_0_8px_rgba(122,82,48,.25)]'
                  : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.35)] hover:shadow-[0_0_6px_rgba(122,82,48,.18)]'
              }`}
            >
              {newRole}
              <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${roleOpen ? 'rotate-180' : ''}`} />
            </button>
            {roleOpen && (
              <div className="absolute top-full mt-1 left-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden z-50 min-w-full">
                {availableRoles.map(role => (
                  <button key={role} type="button"
                    onClick={() => { setNewRole(role); setRoleOpen(false) }}
                    className={`w-full text-left px-3.5 py-2 text-sm transition-colors whitespace-nowrap ${
                      newRole === role
                        ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                        : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                    }`}>
                    {role}
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7a5230] text-white text-sm font-medium rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-all shadow-[0_0_8px_rgba(122,82,48,.35)] hover:shadow-[0_0_12px_rgba(122,82,48,.5)]"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            新增
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-sm text-[#b5451b]">{addError}</p>
        )}
      </div>

      {/* 使用者清單 */}
      <div>
        {error && (
          <div className="mb-4 text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="mb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#a08060]" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="搜尋 Email 或角色"
              className="w-full border border-[#e8ddd0] rounded-lg pl-9 pr-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all"
            />
          </div>
          <div className="text-sm text-[#a08060] whitespace-nowrap">
            {searchQuery.trim()
              ? `找到 ${filteredUsers.length} 筆（共 ${users.length} 位使用者）`
              : `共 ${users.length} 位使用者`}
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
          {users.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#a08060]">尚未加入任何使用者</div>
          ) : filteredUsers.length === 0 ? (
            <div className="py-12 text-center text-sm text-[#a08060]">找不到符合的使用者</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.12)]">
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38]">
                    <button type="button" onClick={() => handleSort('email')} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
                      Email <SortIcon column="email" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap">
                    <button type="button" onClick={() => handleSort('role')} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
                      角色 <SortIcon column="role" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] hidden sm:table-cell whitespace-nowrap">
                    <button type="button" onClick={() => handleSort('auth_created_at')} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
                      初始登入 <SortIcon column="auth_created_at" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 font-medium text-[#6b4f38] hidden sm:table-cell whitespace-nowrap">
                    <button type="button" onClick={() => handleSort('last_sign_in_at')} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
                      最後登入 <SortIcon column="last_sign_in_at" />
                    </button>
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(122,82,48,.08)]">
                {sortedUsers.map(user => {
                  const isSelf = user.email === currentUserEmail
                  const isLoading = loadingEmail === user.email
                  const isRowRoleOpen = openRoleEmail === user.email
                  return (
                    <tr key={user.email} className="hover:bg-[rgba(122,82,48,.03)] transition-colors">
                      <td className="px-4 py-3 text-[#2c1e12]">
                        {user.email}
                        {isSelf && <span className="ml-2 text-xs text-[#a08060]">（你）</span>}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          disabled={isLoading || isSelf}
                          onClick={e => {
                            if (isSelf) return
                            if (isRowRoleOpen) { setOpenRoleEmail(null); return }
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect()
                            setDropdownPos({ top: rect.bottom + 4, left: rect.left, triggerTop: rect.top })
                            setOpenRoleEmail(user.email)
                          }}
                          className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full border transition-all disabled:cursor-not-allowed whitespace-nowrap ${
                            isSelf
                              ? 'bg-[rgba(122,82,48,.05)] text-[#a08060] border-[rgba(122,82,48,.15)] opacity-60'
                              : 'bg-[rgba(122,82,48,.07)] text-[#6b4f38] border-[rgba(122,82,48,.2)] hover:bg-[rgba(122,82,48,.14)] hover:text-[#7a5230]'
                          }`}
                        >
                          {isLoading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : <Shield className="h-3 w-3" />
                          }
                          {user.role}
                          {!isSelf && <ChevronDown className={`h-3 w-3 transition-transform duration-150 ${isRowRoleOpen ? 'rotate-180' : ''}`} />}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-[#a08060] hidden sm:table-cell whitespace-nowrap">
                        {formatDate(user.auth_created_at)}
                      </td>
                      <td className="px-4 py-3 text-[#a08060] hidden sm:table-cell whitespace-nowrap">
                        {formatDate(user.last_sign_in_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleRemove(user)}
                            disabled={isLoading || isSelf}
                            title={isSelf ? '無法移除自己' : '移除使用者'}
                            className="p-1.5 rounded-lg text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* 角色下拉：fixed 定位，不受 overflow-hidden 截斷 */}
      {openRoleEmail && (
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: dropdownPos.top, left: Math.min(dropdownPos.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 280 - 8), zIndex: 9999 }}
          className="bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-y-auto max-h-[min(60vh,320px)] w-max"
        >
          {availableRoles.map(role => {
            const currentRole = users.find(u => u.email === openRoleEmail)?.role
            return (
              <button
                key={role}
                type="button"
                onClick={() => {
                  const user = users.find(u => u.email === openRoleEmail)
                  setOpenRoleEmail(null)
                  if (user && role !== user.role) changeRole(user, role)
                }}
                className={`block text-left px-3.5 py-2 text-sm transition-colors whitespace-nowrap ${
                  role === currentRole
                    ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                    : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                }`}
              >
                {role}
              </button>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={`移除 ${pendingRemove?.email}？`}
        message="移除後該帳號將失去管理員權限，但仍可用公司帳號登入。"
        confirmLabel="移除"
        danger
        onConfirm={() => { setConfirmOpen(false); if (pendingRemove) doRemove(pendingRemove) }}
        onCancel={() => { setConfirmOpen(false); setPendingRemove(null) }}
      />
      </div>
    </>
  )
}
