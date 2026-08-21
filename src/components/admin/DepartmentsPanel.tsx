'use client'

import { useState, useEffect, useCallback } from 'react'
import { Loader2 } from 'lucide-react'
import DepartmentsManager from '@/components/DepartmentsManager'

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

interface DepartmentsData {
  departments: Department[]
  roles: DeptRoleBasic[]
}

interface Props {
  isActive: boolean
}

// Step 40：部門管理子分頁。fetch 模式比照 UserManagementPanel/RolesPanel。
//
// 重要：不對 DepartmentsManager 做 key remount（原因同 UserManagementPanel/RolesPanel：
// 強制整個重新 mount 會清空使用者正在填的新增部門名稱/改名輸入框等 UI 狀態）。改成讓
// DepartmentsManager 自己用 useEffect 依 props 變化同步清單（見該檔案），這裡只需要正常
// 把每次 fetch 到的新物件往下傳即可。
export default function DepartmentsPanel({ isActive }: Props) {
  const [data, setData] = useState<DepartmentsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/departments')
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
    <DepartmentsManager
      initialDepartments={data.departments}
      initialRoles={data.roles}
    />
  )
}
