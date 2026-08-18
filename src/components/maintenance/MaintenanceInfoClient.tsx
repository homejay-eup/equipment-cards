'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import { MaintenanceVendor, MaintenanceRule } from '@/types/maintenance'
import ConfirmDialog from '@/components/ConfirmDialog'
import VendorListPanel from '@/components/maintenance/VendorListPanel'
import VendorDetailPanel, { GENERAL_KEY } from '@/components/maintenance/VendorDetailPanel'
import VendorFormDialog from '@/components/maintenance/VendorFormDialog'
import RuleFormDialog from '@/components/maintenance/RuleFormDialog'

interface Props {
  isActive: boolean
  filter?: { equipmentId: string } | null
  permissions: string[]
  allCards: EquipmentCard[]
}

// Step 38：維修資訊管理。廠商為主的獨立頁籤，廠商內依料號分組展開規則。
// 比照 PackagesClient/DocumentsClient 的 mount-once + isActive 重新抓資料模式。
export default function MaintenanceInfoClient({ isActive, filter, permissions, allCards }: Props) {
  const canManage = permissions.includes('manage_maintenance_info')

  const [vendors, setVendors] = useState<MaintenanceVendor[]>([])
  const [vendorsLoading, setVendorsLoading] = useState(true)
  const [vendorsError, setVendorsError] = useState<string | null>(null)

  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null)
  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [rulesLoading, setRulesLoading] = useState(false)

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [pendingFocusId, setPendingFocusId] = useState<string | null>(null)
  // 目前展開狀態是依哪個 vendorId 算出來的預設值——只有切換到不同廠商才重算，
  // 同廠商內因確認最新/新增/編輯/刪除規則觸發的背景重新整理不能覆蓋使用者手動展開/收合狀態
  const prevRulesVendorRef = useRef<string | null>(null)
  const pendingFocusIdRef = useRef<string | null>(null)
  useEffect(() => { pendingFocusIdRef.current = pendingFocusId }, [pendingFocusId])

  const [vendorFormOpen, setVendorFormOpen] = useState(false)
  const [vendorFormMode, setVendorFormMode] = useState<'create' | 'edit'>('create')
  const [editingVendor, setEditingVendor] = useState<MaintenanceVendor | undefined>(undefined)

  const [ruleFormOpen, setRuleFormOpen] = useState(false)
  const [ruleFormMode, setRuleFormMode] = useState<'create' | 'edit'>('create')
  const [editingRule, setEditingRule] = useState<MaintenanceRule | undefined>(undefined)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{ title: string; message?: string; onConfirm: () => void }>({ title: '', onConfirm: () => {} })

  const refreshVendors = useCallback(async () => {
    setVendorsLoading(true)
    setVendorsError(null)
    try {
      const res = await fetch('/api/maintenance/vendors')
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setVendorsError(data?.error ?? '查詢廠商清單失敗'); return }
      setVendors(data.vendors ?? [])
    } catch {
      setVendorsError('查詢廠商清單失敗')
    } finally {
      setVendorsLoading(false)
    }
  }, [])

  // isSwitch=true 代表這次抓取是因為切換到不同廠商（或首次選定廠商），才需要重算預設展開集合；
  // 同廠商內的背景重新整理（確認最新/新增/編輯/刪除規則）呼叫時 isSwitch 維持預設 false，
  // 不得覆蓋使用者手動展開/收合的 expandedIds
  const refreshRules = useCallback(async (vendorId: string, isSwitch: boolean = false) => {
    setRulesLoading(true)
    try {
      const res = await fetch(`/api/maintenance/rules?vendor_id=${encodeURIComponent(vendorId)}`)
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        const nextRules: MaintenanceRule[] = data.rules ?? []
        setRules(nextRules)
        if (isSwitch) {
          const next = new Set<string>()
          for (const rule of nextRules) {
            if (!rule.needs_review) continue
            const ids = rule.equipment_ids ?? []
            if (ids.length === 0) { next.add(GENERAL_KEY); continue }
            for (const ref of ids) next.add(ref.equipment_id)
          }
          const focusId = pendingFocusIdRef.current
          if (focusId) {
            next.add(focusId)
            pendingFocusIdRef.current = null
            setPendingFocusId(null)
          }
          setExpandedIds(next)
        }
      }
    } finally {
      setRulesLoading(false)
    }
  }, [])

  // 首次進入 + 每次切回這個分頁都重新抓最新廠商清單（比照 PackagesClient 的 isActive 模式）
  useEffect(() => {
    if (!isActive) return
    refreshVendors()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive])

  // 從 CardDetailDialog 跳轉進來：找出該料號相關規則所屬的廠商，自動選中並準備展開
  useEffect(() => {
    if (!isActive || !filter?.equipmentId) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/maintenance/rules/by-equipment?equipment_id=${encodeURIComponent(filter.equipmentId)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled || !res.ok) return
        const relatedRules = data.rules ?? []
        if (relatedRules.length === 0) return
        setSelectedVendorId(relatedRules[0].vendor_id)
        setPendingFocusId(filter.equipmentId)
      } catch { /* 靜默失敗，維持原本畫面 */ }
    })()
    return () => { cancelled = true }
  }, [isActive, filter?.equipmentId])

  // 選定廠商後抓取規則清單；只有「切換到不同廠商」才視為 isSwitch，觸發預設展開重算
  useEffect(() => {
    if (!selectedVendorId) { setRules([]); return }
    const isSwitch = prevRulesVendorRef.current !== selectedVendorId
    prevRulesVendorRef.current = selectedVendorId
    refreshRules(selectedVendorId, isSwitch)
  }, [selectedVendorId, refreshRules])

  function toggleExpand(id: string) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function collapseAll() {
    setExpandedIds(new Set())
  }

  function askConfirm(cfg: typeof confirmConfig) {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  function openCreateVendor() {
    setVendorFormMode('create')
    setEditingVendor(undefined)
    setVendorFormOpen(true)
  }

  function openEditVendor(vendor: MaintenanceVendor) {
    setVendorFormMode('edit')
    setEditingVendor(vendor)
    setVendorFormOpen(true)
  }

  function handleDeleteVendor(vendor: MaintenanceVendor) {
    askConfirm({
      title: `刪除廠商「${vendor.name}」？`,
      message: '此操作無法還原。',
      onConfirm: async () => {
        const res = await fetch(`/api/maintenance/vendors/${vendor.id}`, { method: 'DELETE' })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          if (res.status === 409) {
            alert(`此廠商底下尚有 ${data?.rule_count ?? 0} 筆規則，請先處理規則後再刪除`)
          } else {
            alert(data?.error ?? '刪除失敗，請重試')
          }
          return
        }
        if (selectedVendorId === vendor.id) setSelectedVendorId(null)
        refreshVendors()
      },
    })
  }

  function openCreateRule() {
    setRuleFormMode('create')
    setEditingRule(undefined)
    setRuleFormOpen(true)
  }

  function openEditRule(rule: MaintenanceRule) {
    setRuleFormMode('edit')
    setEditingRule(rule)
    setRuleFormOpen(true)
  }

  function handleDeleteRule(rule: MaintenanceRule) {
    askConfirm({
      title: `刪除規則「${rule.item}」？`,
      message: '此操作無法還原，掛載的料號關聯也會一併清除。',
      onConfirm: async () => {
        const res = await fetch(`/api/maintenance/rules/${rule.id}`, { method: 'DELETE' })
        if (!res.ok) { alert('刪除失敗，請重試'); return }
        if (selectedVendorId) refreshRules(selectedVendorId)
        refreshVendors()
      },
    })
  }

  async function handleConfirmLatest(rule: MaintenanceRule) {
    const res = await fetch(`/api/maintenance/rules/${rule.id}/confirm`, { method: 'POST' })
    if (res.ok && selectedVendorId) {
      refreshRules(selectedVendorId)
      refreshVendors()
    }
  }

  const selectedVendor = vendors.find(v => v.id === selectedVendorId)

  return (
    <div className="max-w-5xl mx-auto px-4 pt-4 pb-16">
      {vendorsError && (
        <p className="mb-3 text-sm text-[#b5451b]">{vendorsError}</p>
      )}
      {vendors.length === 0 && vendorsLoading ? (
        <div className="flex items-center justify-center py-16 text-[#a08060]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
          <VendorListPanel
            vendors={vendors}
            selectedVendorId={selectedVendorId}
            onSelect={setSelectedVendorId}
            canManage={canManage}
            onAddVendor={openCreateVendor}
          />
          {selectedVendor ? (
            <VendorDetailPanel
              vendor={selectedVendor}
              rules={rules}
              rulesLoading={rulesLoading}
              canManage={canManage}
              expandedIds={expandedIds}
              onToggleExpand={toggleExpand}
              onCollapseAll={collapseAll}
              onEditVendor={() => openEditVendor(selectedVendor)}
              onDeleteVendor={() => handleDeleteVendor(selectedVendor)}
              onAddRule={openCreateRule}
              onEditRule={openEditRule}
              onDeleteRule={handleDeleteRule}
              onConfirmLatest={handleConfirmLatest}
            />
          ) : (
            <div className="bg-white border border-[#e8ddd0] rounded-lg flex items-center justify-center py-16 text-sm text-[#a08060]">
              {vendors.length === 0 ? '尚無廠商，請先新增一家廠商' : '請從左側選擇一家廠商'}
            </div>
          )}
        </div>
      )}

      <VendorFormDialog
        open={vendorFormOpen}
        mode={vendorFormMode}
        vendor={editingVendor}
        onClose={() => setVendorFormOpen(false)}
        onSaved={(vendor) => {
          refreshVendors()
          if (vendorFormMode === 'create') setSelectedVendorId(vendor.id)
        }}
      />

      {selectedVendorId && (
        <RuleFormDialog
          open={ruleFormOpen}
          mode={ruleFormMode}
          vendorId={selectedVendorId}
          rule={editingRule}
          allCards={allCards}
          onClose={() => setRuleFormOpen(false)}
          onSaved={() => {
            refreshRules(selectedVendorId)
            refreshVendors()
          }}
        />
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        confirmLabel="刪除"
        danger
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  )
}
