'use client'

import { useState, useMemo, useEffect } from 'react'
import {
  Loader2, Search, LayoutGrid, List as ListIcon, Check, RefreshCw,
} from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import ConfirmDialog from '@/components/ConfirmDialog'
import ShareDepartmentsDialog from './ShareDepartmentsDialog'
import DuplicatePackageDialog from './DuplicatePackageDialog'
import PackageBatchActionsBar from './PackageBatchActionsBar'
import PackageListView from './PackageListView'
import EquipmentListView from './EquipmentListView'
import { unlinkKey } from './unlinkKey'
import { usePackages, EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'

type ViewMode = 'byPackage' | 'byEquipment'
type DisplayMode = 'list' | 'photo'

interface Department {
  id: string
  name: string
}

interface EquipmentGroup {
  equipment_id: string
  name: string
  packages: (EquipmentPackage | SharedEquipmentPackage)[]
}

interface Props {
  mode: 'own' | 'shared'
  packages: (EquipmentPackage | SharedEquipmentPackage)[]
  allCards: EquipmentCard[]
  canEdit: boolean
  canShare: boolean
  departments: Department[]
  currentDepartmentId: string | null
  duplicateGroups: Map<string, string[]> // packageId -> 內容完全相同的其他套餐名稱（僅 own 有意義）
  sourceGroupUpdatedAt: Record<string, string> // source_group_id -> 群組目前 updated_at（僅 own 有意義）
  onChanged: () => void | Promise<void>
  storageKeyPrefix: string // 依 own/shared 各自獨立記憶顯示偏好
}

function useLocalStorageState<T extends string>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(initial)
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(key)
      if (stored) setValue(stored as T)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  function update(v: T) {
    setValue(v)
    try { window.localStorage.setItem(key, v) } catch { /* ignore */ }
  }
  return [value, update]
}

// 設備套餐：依套餐／依料號雙視圖 + 清單/照片顯示切換 + 批次操作。
// 比照 documents/ExpandableDocumentList.tsx 的拆法與互動模式（依文件/依料號 -> 依套餐/依料號）。
export default function PackageExplorer({
  mode, packages, allCards, canEdit, canShare, departments, currentDepartmentId,
  duplicateGroups, sourceGroupUpdatedAt, onChanged, storageKeyPrefix,
}: Props) {
  const pkgApi = usePackages()
  const [view, setView] = useLocalStorageState<ViewMode>(`${storageKeyPrefix}_view`, 'byPackage')
  const [display, setDisplay] = useLocalStorageState<DisplayMode>(`${storageKeyPrefix}_display`, 'list')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
  const [actionError, setActionError] = useState<string | null>(null)

  const [selectedPackageIds, setSelectedPackageIds] = useState<Set<string>>(new Set())
  const [selectedUnlinkKeys, setSelectedUnlinkKeys] = useState<Set<string>>(new Set())

  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const [shareOpen, setShareOpen] = useState(false)
  const [duplicateTarget, setDuplicateTarget] = useState<EquipmentPackage | SharedEquipmentPackage | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; names: string[] } | null>(null)
  const [running, setRunning] = useState(false)

  const cardMap = useMemo(() => new Map(allCards.map(c => [c.equipment_id, c])), [allCards])

  function toggleExpand(key: string) {
    setExpanded(prev => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key); else n.add(key)
      return n
    })
  }

  function togglePackageSelect(id: string) {
    setSelectedPackageIds(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  function toggleAllPackages(ids: string[]) {
    setSelectedPackageIds(prev => prev.size === ids.length ? new Set() : new Set(ids))
  }

  function toggleUnlinkSelect(packageId: string, equipmentId: string) {
    const k = unlinkKey(packageId, equipmentId)
    setSelectedUnlinkKeys(prev => {
      const n = new Set(prev)
      if (n.has(k)) n.delete(k); else n.add(k)
      return n
    })
  }

  // ── 依料號分組：純前端反向分組現有 package_items 資料，不用新 API ──
  const equipmentGroups = useMemo<EquipmentGroup[]>(() => {
    const map = new Map<string, EquipmentGroup>()
    for (const pkg of packages) {
      for (const item of pkg.package_items) {
        const card = cardMap.get(item.equipment_id)
        let g = map.get(item.equipment_id)
        if (!g) {
          g = { equipment_id: item.equipment_id, name: card?.name ?? item.equipment_id, packages: [] }
          map.set(item.equipment_id, g)
        }
        g.packages.push(pkg)
      }
    }
    return Array.from(map.values())
  }, [packages, cardMap])

  const filteredPackages = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q ? packages.filter(p => p.name.toLowerCase().includes(q)) : packages
    return [...base].sort((a, b) => a.name.localeCompare(b.name))
  }, [packages, query])

  const filteredEquipmentGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base = q
      ? equipmentGroups.filter(g => g.equipment_id.toLowerCase().includes(q) || g.name.toLowerCase().includes(q))
      : equipmentGroups
    return [...base].sort((a, b) => a.equipment_id.localeCompare(b.equipment_id))
  }, [equipmentGroups, query])

  function alignmentBadge(pkg: EquipmentPackage | SharedEquipmentPackage) {
    if (!pkg.source_group_id) return null
    const groupUpdatedAt = sourceGroupUpdatedAt[pkg.source_group_id]
    if (!groupUpdatedAt) return null
    const stale = !pkg.source_synced_at || new Date(groupUpdatedAt).getTime() > new Date(pkg.source_synced_at).getTime()
    return stale ? (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(217,119,6,.1)] text-amber-600 border border-[rgba(217,119,6,.25)]">
        <RefreshCw className="h-2.5 w-2.5" />
        來源已更新
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(34,139,34,.08)] text-green-700 border border-[rgba(34,139,34,.2)]">
        <Check className="h-2.5 w-2.5" />
        已對齊最新版本
      </span>
    )
  }

  // ── 新增掛載（複選）──────────────────────────────────────────
  async function handleAddManyToPackage(packageId: string, equipmentIds: string[]) {
    if (equipmentIds.length === 0) return
    setActionError(null)
    try {
      await pkgApi.batchItems(packageId, { add: equipmentIds })
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '新增掛載失敗')
    }
  }

  async function handleAddEquipmentToManyPackages(equipmentId: string, packageIds: string[]) {
    if (packageIds.length === 0) return
    setActionError(null)
    const failed: string[] = []
    // 每個套餐是獨立資源，仍需逐一呼叫，但改用批次端點（add: [equipmentId]）
    // 取代單筆 addItem，跟依套餐視圖的新增掛載走同一支 API。
    for (const packageId of packageIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pkgApi.batchItems(packageId, { add: [equipmentId] })
      } catch (e) {
        const pkg = packages.find(p => p.id === packageId)
        failed.push(pkg?.name ?? packageId)
        console.error('[PackageExplorer] add equipment to package failed', packageId, equipmentId, e)
      }
    }
    if (failed.length > 0) setActionError(`部分套餐掛載失敗：${failed.join('、')}`)
    await onChanged()
  }

  // ── 批次取消掛載（複選，依 packageId 分組後每個套餐只呼叫一次批次 API，全部處理完只重新整理一次）───
  async function handleBatchUnlink(targets: { packageId: string; equipmentId: string }[]) {
    if (targets.length === 0) return
    setActionError(null)
    setRunning(true)
    const grouped = new Map<string, string[]>()
    for (const t of targets) {
      const arr = grouped.get(t.packageId) ?? []
      arr.push(t.equipmentId)
      grouped.set(t.packageId, arr)
    }
    const affectedIds = Array.from(grouped.keys())
    setBusyIds(prev => new Set([...Array.from(prev), ...affectedIds]))
    const failed: string[] = []
    for (const [packageId, equipmentIds] of Array.from(grouped.entries())) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pkgApi.batchItems(packageId, { remove: equipmentIds })
      } catch (e) {
        failed.push(packageId)
        console.error('[PackageExplorer] batch unlink failed', packageId, equipmentIds, e)
      }
    }
    setSelectedUnlinkKeys(prev => {
      const n = new Set(prev)
      targets.forEach(t => n.delete(unlinkKey(t.packageId, t.equipmentId)))
      return n
    })
    setBusyIds(prev => {
      const n = new Set(prev)
      affectedIds.forEach(id => n.delete(id))
      return n
    })
    setRunning(false)
    if (failed.length > 0) setActionError('部分取消掛載失敗，請重試')
    await onChanged()
  }

  async function handleRemoveSingle(packageId: string, equipmentId: string) {
    setActionError(null)
    setBusyIds(prev => new Set([...Array.from(prev), packageId]))
    try {
      await pkgApi.removeItem(packageId, equipmentId)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '移除失敗')
    } finally {
      setBusyIds(prev => { const n = new Set(prev); n.delete(packageId); return n })
    }
  }

  // ── 重命名 ────────────────────────────────────────────────
  function startRename(pkg: EquipmentPackage | SharedEquipmentPackage) {
    setRenamingId(pkg.id)
    setRenameValue(pkg.name)
  }
  async function submitRename(packageId: string) {
    const name = renameValue.trim()
    setRenamingId(null)
    if (!name) return
    try {
      await pkgApi.rename(packageId, name)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '改名失敗')
    }
  }

  // ── 批次刪除套餐 ───────────────────────────────────────────
  function askDeleteSelected() {
    const targets = packages.filter(p => selectedPackageIds.has(p.id))
    if (targets.length === 0) return
    setDeleteConfirm({ ids: targets.map(p => p.id), names: targets.map(p => p.name) })
  }
  function askDeleteSingle(pkg: EquipmentPackage | SharedEquipmentPackage) {
    setDeleteConfirm({ ids: [pkg.id], names: [pkg.name] })
  }
  async function handleConfirmDelete() {
    if (!deleteConfirm) return
    const { ids } = deleteConfirm
    setDeleteConfirm(null)
    setRunning(true)
    try {
      await pkgApi.batchDelete(ids)
      setSelectedPackageIds(prev => {
        const n = new Set(prev)
        ids.forEach(id => n.delete(id))
        return n
      })
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '刪除失敗')
    } finally {
      setRunning(false)
    }
  }

  // ── 分享至部門 ─────────────────────────────────────────────
  async function handleConfirmShare(departmentIds: string[]) {
    const ids = Array.from(selectedPackageIds)
    try {
      await pkgApi.batchShare(ids, departmentIds)
      setShareOpen(false)
      await onChanged()
    } catch (e) {
      setActionError(e instanceof Error ? e.message : '分享設定失敗')
    }
  }

  // ── 複製套餐 ───────────────────────────────────────────────
  async function handleConfirmDuplicate(newName: string) {
    if (!duplicateTarget) return
    await pkgApi.duplicate(duplicateTarget.id, newName)
    setDuplicateTarget(null)
    await onChanged()
  }

  const isShared = mode === 'shared'

  // 批次分享彈窗初始勾選：目前選取套餐已分享部門的交集
  const shareInitialSelected = useMemo(() => {
    const selectedPkgs = packages.filter(p => selectedPackageIds.has(p.id))
    if (selectedPkgs.length === 0) return []
    const sets = selectedPkgs.map(p => new Set(p.package_shared_departments.map(d => d.department_id)))
    const [first, ...rest] = sets
    return Array.from(first).filter(id => rest.every(s => s.has(id)))
  }, [packages, selectedPackageIds])

  return (
    <div className="rounded-xl border border-[#e8ddd0] bg-white p-4">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[#6b4f38]">
            共 {packages.length} 份套餐，掛載 {equipmentGroups.length} 張料卡
          </h3>
          <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs">
            <button type="button" onClick={() => setView('byPackage')}
              className={`px-2.5 py-1 transition-colors ${view === 'byPackage' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              依套餐
            </button>
            <button type="button" onClick={() => setView('byEquipment')}
              className={`px-2.5 py-1 transition-colors ${view === 'byEquipment' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              依料號
            </button>
          </div>
          <div className="flex border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs">
            <button type="button" onClick={() => setDisplay('list')} title="清單模式"
              className={`p-1.5 transition-colors ${display === 'list' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              <ListIcon className="h-3.5 w-3.5" />
            </button>
            <button type="button" onClick={() => setDisplay('photo')} title="照片模式"
              className={`p-1.5 transition-colors ${display === 'photo' ? 'bg-[#7a5230] text-white' : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)]'}`}>
              <LayoutGrid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
          <input value={query} onChange={e => setQuery(e.target.value)}
            placeholder={view === 'byPackage' ? '搜尋套餐名稱…' : '搜尋料號、品名…'}
            className="pl-7 pr-2 py-1.5 text-xs border border-[#e8ddd0] rounded-lg bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]" />
        </div>
      </div>

      {actionError && <p className="text-xs text-[#b5451b] mb-2 whitespace-pre-wrap">{actionError}</p>}

      {/* 批次動作列（僅 own 且有權限時顯示，依套餐視圖才有整份套餐可選） */}
      {!isShared && view === 'byPackage' && (canEdit || canShare) && (
        <PackageBatchActionsBar
          filteredPackageIds={filteredPackages.map(p => p.id)}
          selectedPackageIds={selectedPackageIds}
          onToggleAll={toggleAllPackages}
          canShare={canShare}
          canEdit={canEdit}
          running={running}
          onShare={() => setShareOpen(true)}
          onDeleteSelected={askDeleteSelected}
        />
      )}

      {view === 'byPackage' ? (
        <PackageListView
          filteredPackages={filteredPackages}
          allCards={allCards}
          cardMap={cardMap}
          expanded={expanded}
          toggleExpand={toggleExpand}
          busyIds={busyIds}
          isShared={isShared}
          canEdit={canEdit}
          canShare={canShare}
          selectedPackageIds={selectedPackageIds}
          togglePackageSelect={togglePackageSelect}
          duplicateGroups={duplicateGroups}
          alignmentBadge={alignmentBadge}
          display={display}
          renamingId={renamingId}
          renameValue={renameValue}
          setRenameValue={setRenameValue}
          submitRename={submitRename}
          startRename={startRename}
          setRenamingId={setRenamingId}
          selectedUnlinkKeys={selectedUnlinkKeys}
          toggleUnlinkSelect={toggleUnlinkSelect}
          running={running}
          handleRemoveSingle={handleRemoveSingle}
          handleBatchUnlink={handleBatchUnlink}
          handleAddManyToPackage={handleAddManyToPackage}
          setDuplicateTarget={setDuplicateTarget}
          askDeleteSingle={askDeleteSingle}
        />
      ) : (
        <EquipmentListView
          filteredEquipmentGroups={filteredEquipmentGroups}
          packages={packages}
          expanded={expanded}
          toggleExpand={toggleExpand}
          busyIds={busyIds}
          isShared={isShared}
          canEdit={canEdit}
          selectedUnlinkKeys={selectedUnlinkKeys}
          toggleUnlinkSelect={toggleUnlinkSelect}
          running={running}
          handleBatchUnlink={handleBatchUnlink}
          handleAddEquipmentToManyPackages={handleAddEquipmentToManyPackages}
        />
      )}

      {running && (
        <div className="flex items-center gap-2 text-xs text-[#a08060] py-2 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> 處理中…
        </div>
      )}

      <ConfirmDialog
        open={!!deleteConfirm}
        title={`確定刪除 ${deleteConfirm?.ids.length ?? 0} 份套餐？`}
        message="刪除後套餐內容與分享設定都會一併移除，無法復原。"
        detail={deleteConfirm?.names.join('\n')}
        confirmLabel="確定刪除"
        danger
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteConfirm(null)}
      />

      {shareOpen && (
        <ShareDepartmentsDialog
          packageCount={selectedPackageIds.size}
          departments={departments}
          currentDepartmentId={currentDepartmentId}
          initialSelected={shareInitialSelected}
          onConfirm={handleConfirmShare}
          onCancel={() => setShareOpen(false)}
        />
      )}

      {duplicateTarget && (
        <DuplicatePackageDialog
          sourceName={duplicateTarget.name}
          onConfirm={handleConfirmDuplicate}
          onCancel={() => setDuplicateTarget(null)}
        />
      )}
    </div>
  )
}
