'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import UserManagementTable from '@/components/UserManagementTable'

interface UserRow {
  email: string
  role: string
  created_at: string
  auth_created_at?: string | null
  last_sign_in_at?: string | null
}

interface UsersData {
  users: UserRow[]
  currentUserEmail: string
  availableRoles: string[]
  canSyncUsers: boolean
}

interface Props {
  isActive: boolean
}

// Step 40：帳號管理子分頁。比照 MaintenanceInfoClient 的 isActive 重新抓資料模式——
// 每次切回這個子分頁都重新 fetch 最新資料（避免看到過期快取），只有第一次載入才顯示整版 Loading，
// 之後背景刷新不打斷畫面。
//
// 重要：不對 UserManagementTable 做 key remount。UserManagementTable 內部用
// useState(initialUsers) 只在 mount 時吃一次 props，一開始的做法是用遞增 version 當 key
// 強制整個重新 mount 來讓資料保持最新，但這會把使用者正在編輯中的搜尋關鍵字/新增表單/
// 角色下拉等 UI 狀態全部清空且沒有任何提示（tester 實測踩到）。改成讓 UserManagementTable
// 自己用 useEffect 依 initialUsers prop 變化同步 users 清單（見該檔案），這裡只需要正常把
// 每次 fetch 到的新物件往下傳即可，不需要任何 remount 手段。
export default function UserManagementPanel({ isActive }: Props) {
  const [data, setData] = useState<UsersData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/users')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d?.error ?? '載入失敗'); return }
      setData(d)
    } catch {
      setError('載入失敗，請重試')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!isActive) return
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  if (!data && loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[#a08060]">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!data && error) {
    return <p className="max-w-4xl mx-auto px-4 py-8 text-sm text-[#b5451b]">{error}</p>
  }

  if (!data) return null

  return (
    <UserManagementTable
      initialUsers={data.users}
      currentUserEmail={data.currentUserEmail}
      availableRoles={data.availableRoles}
      canSyncUsers={data.canSyncUsers}
    />
  )
}
