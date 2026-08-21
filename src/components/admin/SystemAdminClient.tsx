'use client'

import { useState, useEffect, useRef } from 'react'
import { Users, ShieldCheck, Building2, BarChart3 } from 'lucide-react'
import UserManagementPanel from '@/components/admin/UserManagementPanel'
import RolesPanel from '@/components/admin/RolesPanel'
import DepartmentsPanel from '@/components/admin/DepartmentsPanel'
import AnalyticsPanel from '@/components/admin/AnalyticsPanel'

type SubTab = 'users' | 'roles' | 'departments' | 'analytics'

interface SubTabRequest {
  tab: SubTab
  requestId: number
}

interface Props {
  isActive: boolean
  permissions: string[]
  subTabRequest?: SubTabRequest | null
}

// Step 40：系統管理分頁殼。比照 PhotoWall.tsx 現有分頁的 mount-once + isActive CSS hide/show 模式，
// 內部再切一層子分頁（帳號管理／角色管理／部門管理／使用統計）。
// subTabRequest：供 PhotoWall 標題列「帳號管理」徽章點擊後跳轉到指定子分頁——
// 每次點擊都帶一個新的 requestId，讓 useEffect 能區分「同一個 tab 但這是新的一次跳轉請求」。
export default function SystemAdminClient({ isActive, permissions, subTabRequest }: Props) {
  const canUsers = permissions.includes('manage_users')
  const canRoles = permissions.includes('manage_roles')
  const canAnalytics = permissions.includes('view_analytics')

  const firstAvailable: SubTab = canUsers ? 'users' : canRoles ? 'roles' : canAnalytics ? 'analytics' : 'users'

  const [activeSubTab, setActiveSubTab] = useState<SubTab>(subTabRequest?.tab ?? firstAvailable)

  const lastRequestIdRef = useRef<number | undefined>(subTabRequest?.requestId)
  useEffect(() => {
    if (subTabRequest && subTabRequest.requestId !== lastRequestIdRef.current) {
      lastRequestIdRef.current = subTabRequest.requestId
      setActiveSubTab(subTabRequest.tab)
    }
  }, [subTabRequest])

  // 首次切到對應子分頁才 mount，之後保持常駐（CSS hide/show）保留 state
  const [usersMounted, setUsersMounted] = useState(activeSubTab === 'users')
  useEffect(() => { if (activeSubTab === 'users') setUsersMounted(true) }, [activeSubTab])
  const [rolesMounted, setRolesMounted] = useState(activeSubTab === 'roles')
  useEffect(() => { if (activeSubTab === 'roles') setRolesMounted(true) }, [activeSubTab])
  const [departmentsMounted, setDepartmentsMounted] = useState(activeSubTab === 'departments')
  useEffect(() => { if (activeSubTab === 'departments') setDepartmentsMounted(true) }, [activeSubTab])
  const [analyticsMounted, setAnalyticsMounted] = useState(activeSubTab === 'analytics')
  useEffect(() => { if (activeSubTab === 'analytics') setAnalyticsMounted(true) }, [activeSubTab])

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4">
      <div className="flex flex-wrap gap-1 mb-4">
        {canUsers && (
          <button
            onClick={() => setActiveSubTab('users')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
              activeSubTab === 'users'
                ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
            }`}
          >
            <Users className="h-3.5 w-3.5" />
            帳號管理
          </button>
        )}
        {canRoles && (
          <button
            onClick={() => setActiveSubTab('roles')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
              activeSubTab === 'roles'
                ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            角色管理
          </button>
        )}
        {canRoles && (
          <button
            onClick={() => setActiveSubTab('departments')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
              activeSubTab === 'departments'
                ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
            }`}
          >
            <Building2 className="h-3.5 w-3.5" />
            部門管理
          </button>
        )}
        {canAnalytics && (
          <button
            onClick={() => setActiveSubTab('analytics')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
              activeSubTab === 'analytics'
                ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]'
                : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            使用統計
          </button>
        )}
      </div>

      {usersMounted && (
        <div className={activeSubTab !== 'users' ? 'hidden' : ''}>
          <UserManagementPanel
            isActive={isActive && activeSubTab === 'users'}
            onSwitchSubTab={setActiveSubTab}
          />
        </div>
      )}
      {rolesMounted && (
        <div className={activeSubTab !== 'roles' ? 'hidden' : ''}>
          <RolesPanel
            isActive={isActive && activeSubTab === 'roles'}
            onSwitchSubTab={setActiveSubTab}
          />
        </div>
      )}
      {departmentsMounted && (
        <div className={activeSubTab !== 'departments' ? 'hidden' : ''}>
          <DepartmentsPanel isActive={isActive && activeSubTab === 'departments'} />
        </div>
      )}
      {analyticsMounted && (
        <div className={activeSubTab !== 'analytics' ? 'hidden' : ''}>
          <AnalyticsPanel isActive={isActive && activeSubTab === 'analytics'} />
        </div>
      )}
    </div>
  )
}
