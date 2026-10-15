'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Loader2, Search, X, Plus, Store } from 'lucide-react'
import { EquipmentCard } from '@/types/equipment'
import {
  MaintenanceVendor, MaintenanceRule, MaintenanceExitOption, MaintenanceStage,
} from '@/types/maintenance'
import { MAINTENANCE_STAGES, isValidStage } from '@/lib/maintenanceFormat'
import ConfirmDialog from '@/components/ConfirmDialog'
import FlowStages, { FlowStageStat } from '@/components/maintenance/FlowStages'
import RuleListPanel, { BatchAction } from '@/components/maintenance/RuleListPanel'
import RuleEditPanel, { RuleDraft } from '@/components/maintenance/RuleEditPanel'
import BatchPanel, { BatchPanelMode, BATCH_PANEL_TITLE } from '@/components/maintenance/BatchPanel'
import VendorManageDialog from '@/components/maintenance/VendorManageDialog'

interface Props {
  isActive: boolean
  filter?: { equipmentId: string } | null
  permissions: string[]
  allCards: EquipmentCard[]
}

type EditingState = { mode: 'create' } | { mode: 'edit'; rule: MaintenanceRule } | null

interface Notice {
  tone: 'ok' | 'warn' | 'error'
  text: string
}

interface BatchResponse {
  ok?: boolean
  error?: string
  succeeded_count?: number
  succeeded?: string[]
  failed?: { id: string; reason: string }[]
  invalid_equipment_ids?: string[]
}

interface ConfirmState {
  title: string
  message?: string
  detail?: string
  onConfirm: () => void
}

const STAGE_ORDER: MaintenanceStage[] = ['回廠', '檢測', '送修', '報廢', '待歸類']

// API 回傳可能缺少 Step 49 新欄位（正式 DB 尚未執行 migration 時），統一補預設值避免前端拋例外
function normalizeRule(raw: Partial<MaintenanceRule> & { id: string }): MaintenanceRule {
  return {
    ...raw,
    id: raw.id,
    vendor_id: raw.vendor_id ?? null,
    vendor_name: raw.vendor_name ?? null,
    item: raw.item ?? '',
    content: raw.content ?? '',
    stage: isValidStage(raw.stage) ? raw.stage : '待歸類',
    sub_category: raw.sub_category ?? null,
    exit_option: raw.exit_option ?? null,
    age_limit_months: raw.age_limit_months ?? null,
    age_limit_basis: raw.age_limit_basis ?? null,
    warranty_start_date: raw.warranty_start_date ?? null,
    warranty_period_months: raw.warranty_period_months ?? null,
    last_updated_at: raw.last_updated_at ?? '',
    last_updated_by: raw.last_updated_by ?? null,
    confirmed_at: raw.confirmed_at ?? null,
    confirmed_by: raw.confirmed_by ?? null,
    sort_order: raw.sort_order ?? 0,
    created_at: raw.created_at ?? '',
    equipment_ids: raw.equipment_ids ?? [],
    needs_review: raw.needs_review ?? false,
  }
}

// 搜尋命中：料號（含品名）或廠商名稱包含關鍵字（一律 includes，不走模糊搜尋）
function ruleMatches(rule: MaintenanceRule, ql: string): boolean {
  if (rule.vendor_name && rule.vendor_name.toLowerCase().includes(ql)) return true
  return (rule.equipment_ids ?? []).some(e => `${e.equipment_id} ${e.name}`.toLowerCase().includes(ql))
}

function describeBatch(
  label: string,
  status: number,
  data: BatchResponse,
  titleById: Map<string, string>,
): Notice {
  const failed = data.failed ?? []
  const succeeded = data.succeeded_count ?? 0
  const invalid = data.invalid_equipment_ids ?? []
  const invalidText = invalid.length > 0 ? `；${invalid.length} 個料號不存在，已略過（${invalid.slice(0, 5).join('、')}${invalid.length > 5 ? '…' : ''}）` : ''

  if (failed.length === 0 && status >= 200 && status < 300) {
    return { tone: invalid.length > 0 ? 'warn' : 'ok', text: `${label}：已套用到 ${succeeded} 筆${invalidText}` }
  }
  if (failed.length === 0) {
    return { tone: 'error', text: `${label}失敗：${data.error ?? '請重試'}` }
  }
  const reasonParts = failed.slice(0, 3).map(f => `「${titleById.get(f.id) ?? f.id}」${f.reason}`)
  const more = failed.length > 3 ? `…等共 ${failed.length} 筆` : ''
  return {
    tone: succeeded > 0 ? 'warn' : 'error',
    text: `${label}：成功 ${succeeded} 筆，失敗 ${failed.length} 筆（${reasonParts.join('、')}${more}）${invalidText}`,
  }
}

// Step 49：維修資訊「回廠流程」視角。搜尋列 → 流程圖（回廠／檢測／送修／報廢）→ 選中區塊的規則清單。
// 比照 PackagesClient/DocumentsClient 的 mount-once + isActive 重新抓資料模式。
// 規則總量小，首次進入與每次切回分頁取回全部規則，搜尋／篩選／區塊統計全在前端計算。
export default function MaintenanceInfoClient({ isActive, filter, permissions, allCards }: Props) {
  const canManage = permissions.includes('manage_maintenance_info')

  const [rules, setRules] = useState<MaintenanceRule[]>([])
  const [vendors, setVendors] = useState<MaintenanceVendor[]>([])
  const [exitOptions, setExitOptions] = useState<MaintenanceExitOption[]>([])
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [cur, setCur] = useState<MaintenanceStage>('回廠')
  const [q, setQ] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [editing, setEditing] = useState<EditingState>(null)
  const [editKey, setEditKey] = useState(0)
  const [batchMode, setBatchMode] = useState<BatchPanelMode | null>(null)
  const [vendorDialogOpen, setVendorDialogOpen] = useState(false)
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current) }, [])

  function showNotice(n: Notice) {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current)
    setNotice(n)
    // 成功訊息數秒後自動消失；警告／錯誤要保留到使用者關閉或下一次操作，避免部分失敗被忽略
    if (n.tone === 'ok') noticeTimerRef.current = setTimeout(() => setNotice(null), 4000)
  }

  // ── 資料抓取（序號防護：只採用最新一次請求的結果）──────────────────
  const rulesSeq = useRef(0)
  const vendorsSeq = useRef(0)

  const loadRules = useCallback(async (): Promise<MaintenanceRule[] | null> => {
    const seq = ++rulesSeq.current
    try {
      const res = await fetch('/api/maintenance/rules')
      const data = await res.json().catch(() => ({}))
      if (seq !== rulesSeq.current) return null
      if (!res.ok) { setLoadError(data?.error ?? '查詢規則失敗'); return null }
      const next: MaintenanceRule[] = ((data.rules ?? []) as (Partial<MaintenanceRule> & { id: string })[]).map(normalizeRule)
      setLoadError(null)
      setRules(next)
      return next
    } catch {
      if (seq === rulesSeq.current) setLoadError('查詢規則失敗')
      return null
    }
  }, [])

  const loadVendors = useCallback(async () => {
    const seq = ++vendorsSeq.current
    try {
      const res = await fetch('/api/maintenance/vendors')
      const data = await res.json().catch(() => ({}))
      if (seq !== vendorsSeq.current || !res.ok) return
      setVendors(data.vendors ?? [])
    } catch { /* 廠商清單抓取失敗不阻擋主畫面 */ }
  }, [])

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch('/api/maintenance/options')
      const data = await res.json().catch(() => ({}))
      if (res.ok) setExitOptions(data.options ?? [])
    } catch { /* 選項抓取失敗時維持現有清單 */ }
  }, [])

  // 區塊切換：清除勾選並關閉編輯／批次面板（避免殘留作用在別的區塊）
  const switchStage = useCallback((next: MaintenanceStage) => {
    setCur(next)
    setSelected(new Set())
    setEditing(null)
    setBatchMode(null)
  }, [])

  // 從料卡細節頁「查看維修資訊」跳進來：搜尋框帶入料號，切到第一個有該料號專屬規則的區塊
  const appliedFilterRef = useRef<{ equipmentId: string } | null>(null)
  const pendingJumpRef = useRef<string | null>(null)

  // 首次進入 + 每次切回這個分頁都重新抓最新資料（比照 PackagesClient 的 isActive 模式）
  useEffect(() => {
    if (!isActive) return
    if (filter && filter !== appliedFilterRef.current) {
      appliedFilterRef.current = filter
      pendingJumpRef.current = filter.equipmentId
      setQ(filter.equipmentId)
    }
    let cancelled = false
    ;(async () => {
      const [next] = await Promise.all([loadRules(), loadVendors(), loadOptions()])
      if (cancelled) return
      setInitialLoading(false)
      const eq = pendingJumpRef.current
      if (eq && next) {
        pendingJumpRef.current = null
        const target = STAGE_ORDER.find(s =>
          next.some(r => r.stage === s && (r.equipment_ids ?? []).some(e => e.equipment_id === eq)))
        if (target) switchStage(target)
      }
    })()
    return () => { cancelled = true }
  }, [isActive, filter, loadRules, loadVendors, loadOptions, switchStage])

  // ── 搜尋與區塊統計（全前端計算）──────────────────────────────────
  const ql = q.trim().toLowerCase()
  // 搜尋字串符合任一料卡時，沒掛料號的「通用規則」也一併列出（排在專屬規則後面）
  const cardSearchHit = useMemo(
    () => (ql ? allCards.some(c => `${c.equipment_id} ${c.name}`.toLowerCase().includes(ql)) : false),
    [allCards, ql],
  )
  const hitIds = useMemo(() => {
    const s = new Set<string>()
    if (!ql) return s
    for (const r of rules) if (ruleMatches(r, ql)) s.add(r.id)
    return s
  }, [rules, ql])

  const isVisible = useCallback(
    (r: MaintenanceRule) => !ql || hitIds.has(r.id) || (cardSearchHit && (r.equipment_ids ?? []).length === 0),
    [ql, hitIds, cardSearchHit],
  )

  const stats = useMemo(() => {
    const base = {} as Record<MaintenanceStage, FlowStageStat>
    for (const s of MAINTENANCE_STAGES) base[s] = { total: 0, visible: 0, reviewCount: 0, hit: false }
    for (const r of rules) {
      const s = base[r.stage]
      s.total++
      if (r.needs_review) s.reviewCount++
      if (isVisible(r)) s.visible++
      if (hitIds.has(r.id)) s.hit = true
    }
    return base
  }, [rules, hitIds, isVisible])

  const totalReview = useMemo(() => rules.filter(r => r.needs_review).length, [rules])

  const curRules = useMemo(() => {
    const list = rules.filter(r => r.stage === cur && isVisible(r))
    // 搜尋時專屬（命中）在前、通用在後；Array.sort 為穩定排序，其餘維持 API 順序
    if (ql) list.sort((a, b) => (hitIds.has(b.id) ? 1 : 0) - (hitIds.has(a.id) ? 1 : 0))
    return list
  }, [rules, cur, isVisible, ql, hitIds])

  // 勾選只計算「目前區塊、目前搜尋下仍看得到」的規則
  const selectedIds = useMemo(() => curRules.filter(r => selected.has(r.id)).map(r => r.id), [curRules, selected])
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds])

  const vendorsById = useMemo(() => new Map(vendors.map(v => [v.id, v])), [vendors])
  const titleById = useMemo(() => new Map(rules.map(r => [r.id, r.item])), [rules])

  // 待歸類被清空後，若還停在該區塊就回到第一個區塊
  useEffect(() => {
    if (cur === '待歸類' && stats['待歸類'].total === 0) switchStage('回廠')
  }, [cur, stats, switchStage])

  // ── 批次 API ──────────────────────────────────────────────────────
  async function callBatch(ids: string[], action: string, payload: Record<string, unknown>) {
    const res = await fetch('/api/maintenance/rules/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, action, payload }),
    })
    const data: BatchResponse = await res.json().catch(() => ({}))
    return { status: res.status, data }
  }

  // 回傳 true＝至少有一筆成功（父層關閉面板）；false＝全部失敗，面板保持開啟
  async function runBatch(action: string, payload: Record<string, unknown>, label: string): Promise<boolean> {
    const ids = selectedIds
    if (ids.length === 0) return false
    try {
      const { status, data } = await callBatch(ids, action, payload)
      showNotice(describeBatch(label, status, data, titleById))
      const succeeded = data.succeeded_count ?? 0
      if (succeeded > 0) {
        // 成功的取消勾選，失敗的保留勾選方便重試
        const failedIds = new Set((data.failed ?? []).map(f => f.id))
        setSelected(failedIds)
        setBatchMode(null)
        await loadRules()
        if (action === 'set_vendor' || action === 'delete') loadVendors()
        return true
      }
      return false
    } catch {
      showNotice({ tone: 'error', text: `${label}失敗，請重試` })
      return false
    }
  }

  function handleBatchAction(action: BatchAction) {
    setEditing(null)
    if (action === 'confirm') {
      setBatchMode(null)
      void runBatch('confirm', {}, '標示已確認')
      return
    }
    if (action === 'delete') {
      const ids = selectedIds
      setBatchMode(null)
      setConfirmState({
        title: `刪除 ${ids.length} 筆規則？`,
        message: '此操作無法還原，掛載的料號關聯也會一併清除。',
        detail: ids.map(id => `・${titleById.get(id) ?? id}`).join('\n'),
        onConfirm: () => { void runBatch('delete', {}, '批次刪除') },
      })
      return
    }
    setBatchMode(action)
  }

  // ── 單筆規則操作 ──────────────────────────────────────────────────
  function openCreate() {
    setBatchMode(null)
    setEditKey(k => k + 1)
    setEditing({ mode: 'create' })
  }

  function openEdit(rule: MaintenanceRule) {
    setBatchMode(null)
    setEditKey(k => k + 1)
    setEditing({ mode: 'edit', rule })
  }

  async function handleSaveRule(draft: RuleDraft): Promise<string | null> {
    if (!editing) return null
    const isEdit = editing.mode === 'edit'

    const body: Record<string, unknown> = {
      item: draft.item,
      content: draft.content,
      stage: draft.stage,
      sub_category: draft.sub_category,
    }
    if (draft.stage === '回廠') body.exit_option = draft.exit_option
    else if (isEdit) body.exit_option = null // 離開回廠區塊時清除去向
    if (draft.stage === '送修') {
      body.vendor_id = draft.vendor_id
      body.warranty_period_months = draft.warranty_period_months
      body.warranty_start_date = draft.warranty_start_date
    }
    if (draft.stage === '檢測' && draft.sub_category === '年限判斷') {
      body.age_limit_months = draft.age_limit_months
      body.age_limit_basis = draft.age_limit_basis
    }

    let warning: string | null = null
    try {
      if (!isEdit) {
        const res = await fetch('/api/maintenance/rules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, equipment_ids: draft.equipment_ids }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return data?.error ?? '新增失敗'
        // 規則已建立但部分料號掛載失敗時 API 仍回 2xx 並附 warning，必須明確告知
        if (typeof data?.warning === 'string') warning = data.warning
      } else {
        const rule = editing.rule
        const res = await fetch(`/api/maintenance/rules/${rule.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) return data?.error ?? '更新失敗'

        const original = new Set((rule.equipment_ids ?? []).map(e => e.equipment_id))
        const next = new Set(draft.equipment_ids)
        const toAdd = draft.equipment_ids.filter(id => !original.has(id))
        const toRemove = Array.from(original).filter(id => !next.has(id))
        if (toAdd.length > 0) {
          const r = await callBatch([rule.id], 'link', { equipment_ids: toAdd })
          if ((r.data.failed ?? []).length > 0 || r.status >= 300 || (r.data.invalid_equipment_ids ?? []).length > 0) {
            warning = '規則內容已更新，但新增掛載料號時發生錯誤，請重新確認掛載狀態'
          }
        }
        if (toRemove.length > 0) {
          const r = await callBatch([rule.id], 'unlink', { equipment_ids: toRemove })
          if ((r.data.failed ?? []).length > 0 || r.status >= 300) {
            warning = warning ?? '規則內容已更新，但移除掛載料號時發生錯誤，請重新確認掛載狀態'
          }
        }
      }
    } catch {
      return '儲存失敗，請重試'
    }

    setEditing(null)
    setSelected(new Set())
    if (draft.stage !== '待歸類') setCur(draft.stage)
    showNotice(warning
      ? { tone: 'warn', text: warning }
      : { tone: 'ok', text: '已儲存，最後確認重置為今天' })
    await loadRules()
    return null
  }

  function handleDeleteRule(rule: MaintenanceRule) {
    setConfirmState({
      title: `刪除規則「${rule.item}」？`,
      message: '此操作無法還原，掛載的料號關聯也會一併清除。',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/maintenance/rules/${rule.id}`, { method: 'DELETE' })
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            showNotice({ tone: 'error', text: data?.error ?? '刪除失敗，請重試' })
            return
          }
          if (editing?.mode === 'edit' && editing.rule.id === rule.id) setEditing(null)
          showNotice({ tone: 'ok', text: '已刪除' })
          await loadRules()
          loadVendors()
        } catch {
          showNotice({ tone: 'error', text: '刪除失敗，請重試' })
        }
      },
    })
  }

  async function handleConfirmLatest(rule: MaintenanceRule) {
    try {
      const res = await fetch(`/api/maintenance/rules/${rule.id}/confirm`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        showNotice({ tone: 'error', text: data?.error ?? '標示失敗，請重試' })
        return
      }
      showNotice({ tone: 'ok', text: `已標示「${rule.item}」為最新` })
      await loadRules()
    } catch {
      showNotice({ tone: 'error', text: '標示失敗，請重試' })
    }
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  // ── 畫面 ──────────────────────────────────────────────────────────
  const exactCardId = allCards.some(c => c.equipment_id === q.trim()) ? q.trim() : null

  const panels = (
    <>
      {canManage && editing && (
        <RuleEditPanel
          key={`edit-${editKey}`}
          mode={editing.mode}
          rule={editing.mode === 'edit' ? editing.rule : undefined}
          defaultStage={cur === '待歸類' ? '回廠' : cur}
          defaultEquipmentIds={exactCardId ? [exactCardId] : []}
          allCards={allCards}
          vendors={vendors}
          exitOptions={exitOptions}
          onExitOptionsSaved={opts => { if (opts) setExitOptions(opts); else void loadOptions() }}
          onCancel={() => setEditing(null)}
          onSave={handleSaveRule}
        />
      )}
      {canManage && batchMode && (
        <BatchPanel
          key={`batch-${batchMode}`}
          mode={batchMode}
          count={selectedIds.length}
          currentStage={cur}
          allCards={allCards}
          vendors={vendors}
          onCancel={() => setBatchMode(null)}
          onApply={(action, payload) => runBatch(action, payload, BATCH_PANEL_TITLE[batchMode])}
        />
      )}
    </>
  )

  return (
    <div className="max-w-4xl mx-auto px-4 pt-4 pb-16 flex flex-col gap-3 text-[13px] text-[#2c1e12]">
      {/* 搜尋列 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#a08060]" aria-hidden="true" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜尋料號、品名或廠商"
            aria-label="搜尋料號、品名或廠商"
            className="w-full border border-[#e8ddd0] rounded-lg pl-8 pr-8 py-1.5 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              title="清除搜尋"
              aria-label="清除搜尋"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#a08060] hover:text-[#7a5230]"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {canManage && (
          <>
            <button
              type="button"
              onClick={() => setVendorDialogOpen(true)}
              title="廠商資料"
              aria-label="廠商資料"
              className="inline-flex items-center justify-center p-1.5 px-2.5 text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
            >
              <Store className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={openCreate}
              title="新增規則"
              aria-label="新增規則"
              className="inline-flex items-center justify-center p-1.5 px-2.5 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-[#a08060]">
        {ql
          ? `搜尋「${q.trim()}」：圓點＝該區塊有此搜尋的專屬規則；通用規則一併列出，專屬在前`
          : `共 ${totalReview} 筆建議覆核（超過 6 個月未確認）`}
      </p>

      {loadError && <p className="text-sm text-[#b5451b]" role="alert">{loadError}</p>}

      {initialLoading && rules.length === 0 ? (
        <div className="flex items-center justify-center py-16 text-[#a08060]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <>
          <FlowStages current={cur} stats={stats} searching={ql !== ''} onSelect={switchStage} />

          {notice && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-start gap-2 text-xs px-3 py-2 rounded-lg border ${
                notice.tone === 'ok'
                  ? 'bg-[#eaf0df] text-[#4a6b2e] border-[#d6e3c2]'
                  : notice.tone === 'warn'
                    ? 'bg-[#fdf0d5] text-[#8a5a12] border-[#f0dcae]'
                    : 'bg-[rgba(181,69,27,.08)] text-[#b5451b] border-[rgba(181,69,27,.25)]'
              }`}
            >
              <span className="flex-1 break-words">{notice.text}</span>
              <button
                type="button"
                onClick={() => setNotice(null)}
                title="關閉提示"
                aria-label="關閉提示"
                className="flex-shrink-0 opacity-70 hover:opacity-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <RuleListPanel
            stage={cur}
            rules={curRules}
            vendorsById={vendorsById}
            highlightIds={hitIds}
            canManage={canManage}
            selected={selectedSet}
            selectedCount={selectedIds.length}
            searching={ql !== ''}
            panels={panels}
            onToggle={toggleSelect}
            onSelectAll={() => setSelected(new Set(curRules.map(r => r.id)))}
            onClearSelection={() => { setSelected(new Set()); setBatchMode(null) }}
            onBatchAction={handleBatchAction}
            onEdit={openEdit}
            onDelete={handleDeleteRule}
            onConfirmLatest={handleConfirmLatest}
          />
        </>
      )}

      {canManage && (
        <VendorManageDialog
          open={vendorDialogOpen}
          vendors={vendors}
          onClose={() => setVendorDialogOpen(false)}
          onChanged={() => { void loadVendors(); void loadRules() }}
        />
      )}

      <ConfirmDialog
        open={confirmState !== null}
        title={confirmState?.title ?? ''}
        message={confirmState?.message}
        detail={confirmState?.detail}
        confirmLabel="刪除"
        danger
        onConfirm={() => { const c = confirmState; setConfirmState(null); c?.onConfirm() }}
        onCancel={() => setConfirmState(null)}
      />
    </div>
  )
}
