'use client'

import { useState, useCallback, useMemo, useRef, useEffect } from 'react'
import { Plus, Check, X, Loader2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { usePackages, EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import PackageExplorer from '@/components/packages/PackageExplorer'

interface Department {
  id: string
  name: string
}

interface Props {
  initialOwnPackages: EquipmentPackage[]
  initialSharedPackages: SharedEquipmentPackage[]
  departments: Department[]
  allCards: EquipmentCard[]
  permissions: string[]
  userDepartmentId: string | null
  sourceGroupUpdatedAt: Record<string, string>
}

// 純前端比對：同部門套餐是否有兩個以上料號組合完全相同（排序後 set 比較）
function computeDuplicateGroups(packages: EquipmentPackage[]): Map<string, string[]> {
  const signatureOf = (p: EquipmentPackage) =>
    p.package_items.map(i => i.equipment_id).sort().join('|')

  const bySignature = new Map<string, EquipmentPackage[]>()
  for (const p of packages) {
    const sig = signatureOf(p)
    if (!sig) continue // 空套餐不算「內容相同」
    const arr = bySignature.get(sig) ?? []
    arr.push(p)
    bySignature.set(sig, arr)
  }

  const result = new Map<string, string[]>()
  for (const group of Array.from(bySignature.values())) {
    if (group.length < 2) continue
    for (const p of group) {
      result.set(p.id, group.filter(g => g.id !== p.id).map(g => g.name))
    }
  }
  return result
}

// Step 34 第四輪：原本是獨立路由 /packages 的頁面內容，改為 PhotoWall 內嵌分頁
// （比照任務板/人為配件報價/文件管理），移除頁面標題列與返回連結，資料改由
// PhotoWall 往下傳（page.tsx 一次 fetch 好），不再自己 fetch allCards。
export default function PackagesClient({
  initialOwnPackages, initialSharedPackages, departments, allCards,
  permissions, userDepartmentId, sourceGroupUpdatedAt,
}: Props) {
  const pkgApi = usePackages()
  const [ownPackages, setOwnPackages] = useState<EquipmentPackage[]>(initialOwnPackages)
  const [sharedPackages, setSharedPackages] = useState<SharedEquipmentPackage[]>(initialSharedPackages)
  const [loadError, setLoadError] = useState<string | null>(null)

  const canViewOwn = permissions.includes('view_own_packages') || permissions.includes('edit_own_packages')
  const canEdit = permissions.includes('edit_own_packages')
  const canShare = permissions.includes('share_own_packages')
  const canViewShared = permissions.includes('view_shared_packages')

  const refreshOwn = useCallback(async () => {
    try {
      const data = await pkgApi.list()
      setOwnPackages(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '重新整理失敗')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const refreshShared = useCallback(async () => {
    try {
      const data = await pkgApi.listShared()
      setSharedPackages(data)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '重新整理失敗')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const duplicateGroups = useMemo(() => computeDuplicateGroups(ownPackages), [ownPackages])

  // ── 新增套餐（inline，比照 GroupsPanel 的新增群組互動） ──────────
  const [addingOpen, setAddingOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (addingOpen) inputRef.current?.focus()
  }, [addingOpen])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) { setAddingOpen(false); return }
    setCreating(true)
    setCreateError(null)
    try {
      await pkgApi.create(name)
      setAddingOpen(false)
      setNewName('')
      await refreshOwn()
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : '建立失敗')
    } finally {
      setCreating(false)
    }
  }

  if (!canViewOwn && !canViewShared) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center text-sm text-[#a08060]">
        您沒有檢視設備套餐的權限。
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16 space-y-6">
      {loadError && <p className="text-xs text-[#b5451b]">{loadError}</p>}

      {canViewOwn && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#6b4f38]">本部門套餐</h2>
            {canEdit && (
              addingOpen ? (
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') handleCreate()
                      if (e.key === 'Escape') { setAddingOpen(false); setNewName('') }
                    }}
                    placeholder="套餐名稱…"
                    disabled={creating}
                    className="text-sm border border-[#c49a72] rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] text-[#2c1e12] placeholder:text-[#b0967a] disabled:opacity-50"
                  />
                  <button onClick={handleCreate} disabled={creating}
                    className="flex items-center justify-center w-8 h-8 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
                    {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => { setAddingOpen(false); setNewName('') }} disabled={creating}
                    className="flex items-center justify-center w-8 h-8 border border-[#e8ddd0] text-[#a08060] rounded-lg hover:text-[#7a5230] disabled:opacity-50 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <button onClick={() => setAddingOpen(true)}
                  className="flex items-center gap-1.5 text-sm text-[#a08060] hover:text-[#7a5230] transition-colors">
                  <Plus className="h-4 w-4" />
                  新增套餐
                </button>
              )
            )}
          </div>
          {createError && <p className="text-xs text-[#b5451b]">{createError}</p>}
          {!userDepartmentId ? (
            <p className="text-xs text-[#a08060] py-4">您目前未歸屬任何部門，無法檢視或建立套餐。</p>
          ) : (
            <PackageExplorer
              mode="own"
              packages={ownPackages}
              allCards={allCards}
              canEdit={canEdit}
              canShare={canShare}
              departments={departments}
              currentDepartmentId={userDepartmentId}
              duplicateGroups={duplicateGroups}
              sourceGroupUpdatedAt={sourceGroupUpdatedAt}
              onChanged={refreshOwn}
              storageKeyPrefix="packages_own"
            />
          )}
        </section>
      )}

      {canViewShared && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[#6b4f38]">其他部門分享給我的套餐</h2>
          <PackageExplorer
            mode="shared"
            packages={sharedPackages}
            allCards={allCards}
            canEdit={false}
            canShare={false}
            departments={departments}
            currentDepartmentId={userDepartmentId}
            duplicateGroups={new Map()}
            sourceGroupUpdatedAt={{}}
            onChanged={refreshShared}
            storageKeyPrefix="packages_shared"
          />
        </section>
      )}
    </div>
  )
}
