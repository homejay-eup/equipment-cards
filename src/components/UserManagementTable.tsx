'use client'

import { useState } from 'react'
import { Loader2, Shield, ShieldOff } from 'lucide-react'

interface UserRow {
  id: string
  email: string
  role: 'admin' | 'viewer'
  last_sign_in_at: string | null
  created_at: string
}

interface Props {
  initialUsers: UserRow[]
  currentUserId: string
}

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-TW', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function UserManagementTable({ initialUsers, currentUserId }: Props) {
  const [users, setUsers] = useState<UserRow[]>(initialUsers)
  const [loadingId, setLoadingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function toggleRole(user: UserRow) {
    const newRole = user.role === 'admin' ? 'viewer' : 'admin'
    setLoadingId(user.id)
    setError(null)
    try {
      const res = await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: user.id, role: newRole }),
      })
      if (!res.ok) {
        const d = await res.json()
        setError(d.error ?? '更新失敗')
        return
      }
      setUsers(prev => prev.map(u => u.id === user.id ? { ...u, role: newRole } : u))
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setLoadingId(null)
    }
  }

  const adminCount = users.filter(u => u.role === 'admin').length

  return (
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
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600">角色</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden sm:table-cell">最後登入</th>
              <th className="text-left px-4 py-3 font-medium text-gray-600 hidden md:table-cell">加入日期</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {users.map(user => {
              const isSelf = user.id === currentUserId
              const isLoading = loadingId === user.id
              return (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-gray-900">
                    <span>{user.email}</span>
                    {isSelf && (
                      <span className="ml-2 text-xs text-gray-400">（你）</span>
                    )}
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
                    {formatDate(user.last_sign_in_at)}
                  </td>
                  <td className="px-4 py-3 text-gray-500 hidden md:table-cell">
                    {formatDate(user.created_at)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => toggleRole(user)}
                      disabled={isLoading || isSelf}
                      title={isSelf ? '無法修改自己的角色' : user.role === 'admin' ? '降為一般使用者' : '升為管理員'}
                      className={[
                        'text-xs px-3 py-1.5 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed',
                        user.role === 'admin'
                          ? 'bg-gray-100 text-gray-700 hover:bg-red-50 hover:text-red-600'
                          : 'bg-blue-50 text-blue-700 hover:bg-blue-100',
                      ].join(' ')}
                    >
                      {isLoading
                        ? <Loader2 className="h-3 w-3 animate-spin inline" />
                        : user.role === 'admin' ? '撤銷管理員' : '設為管理員'
                      }
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
