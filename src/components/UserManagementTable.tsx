'use client'

import { useState } from 'react'
import { Loader2, Shield, ShieldOff, Trash2, UserPlus } from 'lucide-react'

interface UserRow {
  email: string
  role: 'admin' | 'viewer'
  created_at: string
}

interface Props {
  initialUsers: UserRow[]
  currentUserEmail: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UserManagementTable({ initialUsers, currentUserEmail }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [loadingEmail, setLoadingEmail] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 新增 Email 表單
  const [newEmail, setNewEmail] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'viewer'>('viewer')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)

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
      }])
      setNewEmail('')
      setNewRole('viewer')
    } catch {
      setAddError('新增失敗，請重試')
    } finally {
      setAdding(false)
    }
  }

  async function toggleRole(user: UserRow) {
    const newRole = user.role === 'admin' ? 'viewer' : 'admin'
    setLoadingEmail(user.email)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, role: newRole }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '更新失敗'); return }
      setUsers(prev => prev.map(u => u.email === user.email ? { ...u, role: newRole } : u))
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setLoadingEmail(null)
    }
  }

  async function handleRemove(user: UserRow) {
    if (!confirm(`確定要移除 ${user.email}？`)) return
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

  const adminCount = users.filter(u => u.role === 'admin').length

  return (
    <div className="space-y-6">

      {/* 新增 Email 表單 */}
      <div className="bg-white rounded-xl border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-1 flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-600" />
          指派角色
        </h2>
        <p className="text-xs text-gray-400 mb-3">所有公司帳號皆可登入；在此加入的 Email 可指定為管理員</p>
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2">
          <input
            type="email"
            value={newEmail}
            onChange={e => setNewEmail(e.target.value)}
            placeholder="輸入公司 Email 地址"
            required
            disabled={adding}
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          />
          <select
            value={newRole}
            onChange={e => setNewRole(e.target.value as 'admin' | 'viewer')}
            disabled={adding}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:opacity-50"
          >
            <option value="viewer">一般使用者</option>
            <option value="admin">管理員</option>
          </select>
          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            新增
          </button>
        </form>
        {addError && (
          <p className="mt-2 text-sm text-red-600">{addError}</p>
        )}
      </div>

      {/* 使用者清單 */}
      <div>
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">
            {error}
          </div>
        )}

        <div className="mb-3 text-sm text-gray-500">
          共 {users.length} 位使用者，{adminCount} 位管理員
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          {users.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">尚未加入任何使用者</div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">加入日期</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map(user => {
                  const isSelf = user.email === currentUserEmail
                  const isLoading = loadingEmail === user.email
                  return (
                    <tr key={user.email} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 text-gray-900">
                        {user.email}
                        {isSelf && <span className="ml-2 text-xs text-gray-400">（你）</span>}
                      </td>
                      <td className="px-4 py-3">
                        {user.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            <Shield className="h-3 w-3" />
                            管理員
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs font-medium bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            <ShieldOff className="h-3 w-3" />
                            一般使用者
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-500 hidden sm:table-cell">
                        {formatDate(user.created_at)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => toggleRole(user)}
                            disabled={isLoading || isSelf}
                            title={isSelf ? '無法修改自己的角色' : user.role === 'admin' ? '降為一般使用者' : '升為管理員'}
                            className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-gray-100 text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                          >
                            {isLoading
                              ? <Loader2 className="h-3 w-3 animate-spin inline" />
                              : user.role === 'admin' ? '撤銷' : '升為管理員'
                            }
                          </button>
                          <button
                            onClick={() => handleRemove(user)}
                            disabled={isLoading || isSelf}
                            title={isSelf ? '無法移除自己' : '移除使用者'}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
    </div>
  )
}
