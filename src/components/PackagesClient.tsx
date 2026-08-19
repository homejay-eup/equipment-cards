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
  isActive: boolean
  onCardClick: (card: EquipmentCard) => void
}

// 純前端比對：同部門的組合之間是否有兩個以上的料號內容完全相同（排序後 set 比較）
function computeDuplicateGroups(packages: EquipmentPackage[]): Map<string, string[]> {
  // Step 35：數量也納入「內容是否相同」的比對，同樣料號但數量不同不算內容完全相同
  const signatureOf = (p: EquipmentPackage) =>
    p.package_items.map(i => `${i.equipment_id}:${i.quantity}`).sort().join('|')

  const bySignature = new Map<string, EquipmentPackage[]>()
  for (const p of packages) {
    const sig = signatureOf(p)
    if (!sig) continue // 空組合不算「內容相同」
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
  permissions, userDepartmentId, sourceGroupUpdatedAt, isActive, onCardClick,
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

  // Step 35 補：本部門組合數量的樂觀更新——比照 GroupsPanel 的 handleUpdateQuantity，
  // 讓連續點擊 QuantityStepper 時每次都算在最新的本地值上，不會因為等 API 回應而送出過期值
  const applyOwnQuantity = useCallback((packageId: string, equipmentId: string, quantity: number) => {
    setOwnPackages(prev => prev.map(p =>
      p.id !== packageId ? p : {
        ...p,
        package_items: p.package_items.map(i => i.equipment_id === equipmentId ? { ...i, quantity } : i),
      }
    ))
  }, [])

  // Step 36：組合本身／組合內料卡拖曳排序的本地樂觀更新，比照 applyOwnQuantity 的寫法
  const applyOwnPackageOrder = useCallback((orderedPackageIds: string[]) => {
    setOwnPackages(prev => {
      const byId = new Map(prev.map(p => [p.id, p]))
      const reordered = orderedPackageIds
        .map(id => byId.get(id))
        .filter((p): p is EquipmentPackage => !!p)
      return reordered.map((p, i) => ({ ...p, sort_order: (i + 1) * 1000 }))
    })
  }, [])

  const applyOwnItemOrder = useCallback((packageId: string, orderedEquipmentIds: string[]) => {
    setOwnPackages(prev => prev.map(p => {
      if (p.id !== packageId) return p
      const byId = new Map(p.package_items.map(i => [i.equipment_id, i]))
      const reordered = orderedEquipmentIds
        .map(id => byId.get(id))
        .filter((i): i is EquipmentPackage['package_items'][number] => !!i)
      return { ...p, package_items: reordered.map((i, idx) => ({ ...i, sort_order: (idx + 1) * 1000 })) }
    }))
  }, [])

  // 這個分頁是「首次切入才 mount，之後 CSS 隱藏保留 state」，不會每次切換都重新 mount，
  // 所以資料只在第一次進入時抓過一次；例如在「我的關注」複製/對齊組合後切回這個分頁，
  // 不會自動知道要重抓。改成每次「切回」這個分頁都重新拿一次最新清單。
  useEffect(() => {
    if (!isActive) return
    if (canViewOwn) refreshOwn()
    if (canViewShared) refreshShared()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  const duplicateGroups = useMemo(() => computeDuplicateGroups(ownPackages), [ownPackages])

  // ── 新增組合（inline，比照 GroupsPanel 的新增組合互動） ──────────
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
        您沒有檢視設備組合的權限。
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16 space-y-6">
      {loadError && <p className="text-xs text-[#b5451b]">{loadError}</p>}

      {canViewOwn && (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[#6b4f38]">本部門組合</h2>
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
                    placeholder="組合名稱…"
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
                  新增組合
                </button>
              )
            )}
          </div>
          {createError && <p className="text-xs text-[#b5451b]">{createError}</p>}
          {!userDepartmentId ? (
            <p className="text-xs text-[#a08060] py-4">您目前未歸屬任何部門，無法檢視或建立組合。</p>
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
              onOptimisticQuantityChange={applyOwnQuantity}
              onOptimisticPackageOrder={applyOwnPackageOrder}
              onOptimisticItemOrder={applyOwnItemOrder}
              storageKeyPrefix="packages_own"
              onCardClick={onCardClick}
            />
          )}
        </section>
      )}

      {canViewShared && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[#6b4f38]">其他部門分享給我的組合</h2>
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
            onCardClick={onCardClick}
          />
        </section>
      )}
    </div>
  )
}
