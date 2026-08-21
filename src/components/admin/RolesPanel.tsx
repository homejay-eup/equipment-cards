'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import RolesManager from '@/components/RolesManager'

interface Department {
  id: string
  name: string
}

interface RoleData {
  id: string
  name: string
  is_system: boolean
  department_id: string | null
  department_name: string | null
  level: string | null
  permissions: string[]
  assignable_role_names?: string[] | null
  custom_default_permissions: string[] | null
  custom_default_assignable_role_names: string[] | null
  sort_order?: number
}

interface RolesData {
  departments: Department[]
  roles: RoleData[]
  currentUserRoleName?: string
}

interface Props {
  isActive: boolean
}

// Step 40：角色管理子分頁。fetch 模式比照 UserManagementPanel/MaintenanceInfoClient：
// 每次切回子分頁重新抓資料。
//
// 重要：不對 RolesManager 做 key remount。RolesManager 內部用 useState(initialRoles) 只在
// mount 時吃一次 props，一開始的做法是用遞增 version 當 key 強制整個重新 mount，但這會把
// 使用者正在編輯中的展開狀態/草稿勾選/新增角色表單全部清空且沒有提示（tester 實測踩到，
// 最容易踩到的情境：勾了幾個權限還沒按儲存，切去別的子分頁看一下再切回來，勾選全部消失）。
// 改成讓 RolesManager 自己用 useEffect 依 initialRoles prop 變化同步 roles 清單（見該檔案），
// 這裡只需要正常把每次 fetch 到的新物件往下傳即可。
export default function RolesPanel({ isActive }: Props) {
  const [data, setData] = useState<RolesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/roles')
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
    return <p className="max-w-3xl mx-auto px-4 py-8 text-sm text-[#b5451b]">{error}</p>
  }

  if (!data) return null

  return (
    <RolesManager
      initialRoles={data.roles}
      currentUserRoleName={data.currentUserRoleName}
      deptGroups={data.departments}
    />
  )
}
