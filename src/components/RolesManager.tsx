'use client'

import { useState, useEffect } from 'react'
import { ChevronDown, ChevronUp, Plus, Pencil, Trash2, Loader2, Check, X, GripVertical } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'

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

interface Props {
  initialRoles: RoleData[]
  currentUserRoleName?: string
  deptGroups?: Department[]
  // Step 40：嵌入首頁「系統管理」分頁後，切到部門管理改為呼叫這個 callback 切子分頁，
  // 不再是 <Link> 導頁。唯一呼叫端（RolesPanel）一定會傳入，未傳入時不渲染這個按鈕。
  onSwitchSubTab?: (tab: 'departments') => void
}

const PERM_LABELS: Record<string, string> = {
  // 可見性
  read_all_cards:             '看全部料卡（含非現役）',
  read_active_only:           '只看現役料卡',
  // 料卡列表
  use_bookmarks:              '我的關注 (只有個人看得到內容)',
  filter_all_statuses:        '篩選全部狀態（含停產、停用）',
  filter_no_photo:            '篩選無主圖',
  // 料卡細節
  read_documents:             '看文件/規格書',
  read_notes:                 '看備註',
  read_vendor:                '看廠商',
  read_updated_by:            '看更新人員',
  read_updated_content:       '看更新內容',
  read_tags:                  '看標籤',
  read_weight:                '看淨重',
  read_created_at:            '看新增時間',
  read_updated_at:            '看最後更新時間',
  // 料卡管理
  create_delete_cards:        '新增/刪除料卡',
  // 料卡管理 > 編輯欄位
  edit_card_equipment_id:     '料號',
  edit_card_name:             '品名',
  edit_card_category:         '分類',
  edit_card_status:           '狀態',
  edit_card_vendor:           '廠商',
  edit_card_tags:             '標籤',
  edit_card_notes:            '備註',
  edit_card_weight:           '淨重／淨重照片',
  edit_card_documents:        '文件連結',
  edit_card_is_new:           '新品標記',
  edit_card_main_photo:       '主照片',
  edit_card_detail_photos:    '細節照片',
  // 帳號管理
  manage_users:               '帳號管理/指派角色',
  manage_roles:               '角色與權限設定',
  // 文件管理
  manage_documents:           '文件管理（批次上傳/批次刪除/依文件/依料號檢視/CSV 匯出）',
  // 維修資訊
  manage_maintenance_info:    '維修資訊（看得到頁籤＋新增/編輯廠商與規則、掛載料號、標示已確認最新）',
  // 追蹤板
  view_tracker:               '可看任務板 (只有同一部門能看到彼此任務)',
  view_my_tasks:              '我的任務',
  create_issues:              '可新增議題',
  tracker_edit_issue:         '可編輯議題',
  // 功能設定
  manage_subfilter_tags:      '管理次級篩選標籤',
  // 人為配件報價
  view_quotes:                '可看人為配件報價',
  view_quotes_manager_price:  '可看主管權限價',
  edit_quotes:                '新增/編輯報價品項與價格',
  // 使用統計
  view_analytics:             '可看使用統計',
  // 設備組合
  view_own_packages:          '看得到本部門組合（唯讀）',
  edit_own_packages:          '編輯本部門組合（新增/改名/加移料卡/刪除/複製/批次維護，隱含可看）',
  share_own_packages:         '分享組合至其他部門',
  view_shared_packages:       '看得到其他部門分享給我的組合（唯讀）',
}

const VISIBILITY_PERMS = ['read_all_cards', 'read_active_only'] as const

const LIST_PERMS = ['use_bookmarks', 'filter_all_statuses', 'filter_no_photo'] as const

const DETAIL_PERMS = [
  'read_documents',
  'read_notes',
  'read_vendor',
  'read_updated_by',
  'read_updated_content',
  'read_tags',
  'read_weight',
  'read_created_at',
  'read_updated_at',
] as const

// 「編輯料卡」父選項的子 key 清單
const EDIT_CARD_CHILD_PERMS = [
  'edit_card_equipment_id', 'edit_card_name', 'edit_card_category', 'edit_card_status',
  'edit_card_vendor', 'edit_card_tags', 'edit_card_notes', 'edit_card_weight',
  'edit_card_documents', 'edit_card_is_new', 'edit_card_main_photo', 'edit_card_detail_photos',
] as const

// 料卡管理分組（不含子 edit_card_* 欄位）
const CARD_MGMT_PERMS = ['create_delete_cards'] as const

// 文件管理分組（單一總開關，批次上傳/批次刪除/雙視圖檢視/CSV 匯出不分層級）
const DOCUMENT_MGMT_PERMS = ['manage_documents'] as const

// 維修資訊分組（單一總開關，新增/編輯廠商與規則/掛載料號/標示已確認最新不分層級）
const MAINTENANCE_INFO_PERMS = ['manage_maintenance_info'] as const

const ACCOUNT_PERMS = ['manage_users', 'manage_roles'] as const

const FEATURE_PERMS = ['manage_subfilter_tags'] as const

const TRACKER_PERMS = [
  'view_tracker',
  'view_my_tasks',
] as const

const QUOTE_PERMS = [
  'view_quotes',
  'view_quotes_manager_price',
  'edit_quotes',
] as const

// 使用統計分組：獨立單一權限，不需父子連動
const ANALYTICS_PERMS = ['view_analytics'] as const

// 設備組合分組：4 個獨立 key 互不隱含（edit_own_packages 在邏輯上隱含可看，
// 但存的 permission_key 本身沒有從屬關係，UI 上一樣扁平列出，比照 QUOTE_PERMS）
const PACKAGE_PERMS = [
  'view_own_packages',
  'edit_own_packages',
  'share_own_packages',
  'view_shared_packages',
] as const

const DEPT_GROUP_LABELS: Record<string, string> = {
  admin:        '管理',
  tech:         '技師',
  purchasing:   '採購',
  supply_chain: '供應鏈',
  engineering:  '工程',
  sales:        '業務',
}

function getDefaultAssignable(role: RoleData, allRoles: RoleData[]): string[] {
  if (role.level === 'super_admin') {
    return allRoles.map(r => r.name)
  }
  if (role.level === 'dept_admin' && role.department_id) {
    return allRoles
      .filter(r => r.department_id === role.department_id && ['member', 'viewer'].includes(r.level ?? ''))
      .map(r => r.name)
  }
  return []
}

function DeptBadge({ departmentName, level }: { departmentName: string | null; level: string | null }) {
  if (level === 'super_admin') {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(181,69,27,.1)] text-[#b5451b] border border-[rgba(181,69,27,.2)]">
        全域
      </span>
    )
  }
  if (!departmentName) {
    return (
      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.07)] text-[#a08060] border border-[rgba(122,82,48,.15)]">
        無群組
      </span>
    )
  }
  return (
    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
      {DEPT_GROUP_LABELS[departmentName] ?? departmentName}
    </span>
  )
}

export default function RolesManager({ initialRoles, currentUserRoleName, deptGroups, onSwitchSubTab }: Props) {
  const [roles, setRoles] = useState<RoleData[]>(initialRoles)
  // Step 40：嵌入首頁分頁後，RolesPanel 每次切回這個子分頁都會重新 fetch 一份 initialRoles
  // 傳進來（不會整個 remount 這個元件，避免打斷使用者正在編輯的展開/草稿勾選/新增角色表單等
  // UI 狀態）。這裡只同步「角色清單」本身；draftPerms/draftAssignable/expandedIds/newRoleOpen
  // 等都是獨立的 useState，不受影響——即使角色清單換了新的一份，正在編輯中的角色若已經有
  // draftPerms[role.id]，getDraft() 一律優先讀 draft，不會被新資料蓋掉。
  useEffect(() => {
    setRoles(initialRoles)
  }, [initialRoles])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [savingNameId, setSavingNameId] = useState<string | null>(null)

  const [newRoleOpen, setNewRoleOpen] = useState(false)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRolePerms, setNewRolePerms] = useState<string[]>([])
  const [newRoleDeptGroup, setNewRoleDeptGroup] = useState<string>('') // stores department_id
  const [newRoleLevel, setNewRoleLevel] = useState<string>('viewer')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const [savingPermId, setSavingPermId] = useState<string | null>(null)
  const [permError, setPermError] = useState<string | null>(null)
  const [draftPerms, setDraftPerms] = useState<Record<string, string[]>>({})

  const [draftAssignable, setDraftAssignable] = useState<Record<string, string[] | null>>({})
  const [saveError, setSaveError] = useState<string | null>(null)

  const [savingDefaultId, setSavingDefaultId] = useState<string | null>(null)
  const [defaultSavedFeedback, setDefaultSavedFeedback] = useState<string | null>(null)
  const [defaultSaveError, setDefaultSaveError] = useState<string | null>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<RoleData | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  function toggleExpand(id: string, role: RoleData) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
        setDraftPerms(d => ({ ...d, [id]: [...role.permissions] }))
        setDraftAssignable(d => ({
          ...d,
          [id]: role.assignable_role_names ?? getDefaultAssignable(role, roles),
        }))
      }
      return next
    })
  }

  function startRename(role: RoleData) {
    setEditingId(role.id)
    setEditingName(role.name)
  }

  async function saveRename(role: RoleData) {
    const trimmed = editingName.trim()
    if (!trimmed || trimmed === role.name) {
      setEditingId(null)
      return
    }
    setSavingNameId(role.id)
    try {
      const res = await fetch(`/api/roles/${role.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      })
      if (!res.ok) {
        const d = await res.json()
        alert(d.error ?? '重命名失敗')
      } else {
        setRoles(prev => prev.map(r => r.id === role.id ? { ...r, name: trimmed } : r))
        setEditingId(null)
      }
    } catch {
      alert('重命名失敗，請重試')
    } finally {
      setSavingNameId(null)
    }
  }

  async function saveAssignableOnly(role: RoleData) {
    const draft = draftAssignable[role.id]
    const res = await fetch(`/api/roles/${role.id}/assignable`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assignable_role_names: draft ?? [] }),
    })
    if (!res.ok) {
      const d = await res.json()
      throw new Error(d.error ?? '儲存失敗')
    }
    setRoles(prev => prev.map(r => r.id === role.id
      ? { ...r, assignable_role_names: draft && draft.length > 0 ? draft : null }
      : r
    ))
  }

  async function saveAll(role: RoleData) {
    setSavingPermId(role.id)
    setSaveError(null)
    setPermError(null)
    try {
      // 同時呼叫兩個 API
      await Promise.all([
        (async () => {
          const draft = getDraft(role)
          let safePerms = draft
          if (role.name === currentUserRoleName) {
            const locked = ['manage_users', 'manage_roles']
            for (const p of locked) {
              if (!safePerms.includes(p)) safePerms = [...safePerms, p]
            }
          }
          const res = await fetch(`/api/roles/${role.id}/permissions`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ permissions: safePerms }),
          })
          if (!res.ok) {
            const d = await res.json()
            throw new Error(d.error ?? '權限更新失敗')
          }
          setRoles(prev => prev.map(r => r.id === role.id ? { ...r, permissions: safePerms } : r))
        })(),
        saveAssignableOnly(role),
      ])
      // Step 40：改為嵌在首頁「系統管理」分頁的 client 元件，不再是獨立 /admin/roles 路由，
      // router.refresh() 對它已無意義（沒有 Server Component 可重新執行）。
      // setRoles(...) 已同步更新 permissions/assignable_role_names，畫面資料已完整，故直接移除。
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : '儲存失敗，請重試')
    } finally {
      setSavingPermId(null)
    }
  }

  function getDraft(role: RoleData): string[] {
    return draftPerms[role.id] ?? role.permissions
  }

  function isDirty(role: RoleData): boolean {
    const draftP = draftPerms[role.id]
    const draftA = draftAssignable[role.id]
    if (draftP === undefined && draftA === undefined) return false
    if (draftP !== undefined) {
      if (JSON.stringify([...draftP].sort()) !== JSON.stringify([...role.permissions].sort())) return true
    }
    if (draftA !== undefined) {
      const orig = role.assignable_role_names ?? getDefaultAssignable(role, roles)
      if (JSON.stringify([...(draftA ?? [])].sort()) !== JSON.stringify([...orig].sort())) return true
    }
    return false
  }

  function handleVisibilityChange(role: RoleData, selected: 'read_all_cards' | 'read_active_only') {
    const removed = selected === 'read_all_cards' ? 'read_active_only' : 'read_all_cards'
    const cur = getDraft(role).filter(p => p !== removed)
    const result = cur.includes(selected) ? cur : [...cur, selected]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function handleDetailToggle(role: RoleData, key: string) {
    const cur = getDraft(role)
    const result = cur.includes(key) ? cur.filter(p => p !== key) : [...cur, key]
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  // 「可看主管權限價」依附於「可看人為配件報價」：勾主管權限價時自動一併勾可看報價；
  // 取消可看報價時，主管權限價也一併取消（避免存到「主管權限價開了但看不到報價頁」的無效狀態）
  function handleQuoteViewToggle(role: RoleData) {
    const cur = getDraft(role)
    const isChecked = cur.includes('view_quotes')
    const result = isChecked
      ? cur.filter(p => p !== 'view_quotes' && p !== 'view_quotes_manager_price')
      : [...cur, 'view_quotes']
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function handleQuoteManagerPriceToggle(role: RoleData) {
    const cur = getDraft(role)
    const isChecked = cur.includes('view_quotes_manager_price')
    const result = isChecked
      ? cur.filter(p => p !== 'view_quotes_manager_price')
      : [...cur.filter(p => p !== 'view_quotes'), 'view_quotes', 'view_quotes_manager_price']
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  // 「編輯料卡」父選項連動：indeterminate / checked / unchecked
  function getEditCardParentState(draft: string[]): 'all' | 'some' | 'none' {
    const checkedCount = EDIT_CARD_CHILD_PERMS.filter(k => draft.includes(k)).length
    if (checkedCount === 0) return 'none'
    if (checkedCount === EDIT_CARD_CHILD_PERMS.length) return 'all'
    return 'some'
  }

  function handleEditCardParentToggle(role: RoleData) {
    const draft = getDraft(role)
    const state = getEditCardParentState(draft)
    let result: string[]
    if (state === 'none') {
      // 全勾
      result = [...draft, ...EDIT_CARD_CHILD_PERMS.filter(k => !draft.includes(k))]
    } else {
      // 已勾或 indeterminate → 全取消
      result = draft.filter(p => !(EDIT_CARD_CHILD_PERMS as readonly string[]).includes(p))
    }
    setDraftPerms(d => ({ ...d, [role.id]: result }))
  }

  function discardDraft(role: RoleData) {
    setDraftPerms(d => ({ ...d, [role.id]: [...role.permissions] }))
    setDraftAssignable(d => ({
      ...d,
      [role.id]: role.assignable_role_names ?? getDefaultAssignable(role, roles),
    }))
    setPermError(null)
    setSaveError(null)
  }

  async function handleSaveDefault(role: RoleData) {
    setSavingDefaultId(role.id)
    setDefaultSaveError(null)
    setDefaultSavedFeedback(null)
    try {
      const draft = getDraft(role)
      const assignableDraft = draftAssignable[role.id] ?? role.assignable_role_names
      const res = await fetch(`/api/roles/${role.id}/default`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          permissions: draft,
          assignable_role_names: assignableDraft ?? [],
        }),
      })
      if (!res.ok) {
        const d = await res.json()
        setDefaultSaveError(d.error ?? '記憶失敗')
        return
      }
      setRoles(prev => prev.map(r => r.id === role.id
        ? { ...r, custom_default_permissions: draft, custom_default_assignable_role_names: assignableDraft && assignableDraft.length > 0 ? assignableDraft : null }
        : r
      ))
      setDefaultSavedFeedback(role.id)
      setTimeout(() => setDefaultSavedFeedback(null), 2000)
    } catch {
      setDefaultSaveError('記憶失敗，請重試')
    } finally {
      setSavingDefaultId(null)
    }
  }

  function handleRestoreDefault(role: RoleData) {
    if (!role.custom_default_permissions) return
    setDraftPerms(d => ({ ...d, [role.id]: [...role.custom_default_permissions!] }))
    setDraftAssignable(d => ({
      ...d,
      [role.id]: role.custom_default_assignable_role_names ?? [],
    }))
    setSaveError(null)
    setPermError(null)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newRoleName.trim()
    if (!trimmed) return
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/roles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: trimmed,
          permissions: newRolePerms,
          department_id: newRoleDeptGroup || null,
          level: newRoleLevel || 'viewer',
        }),
      })
      const d = await res.json()
      if (!res.ok) {
        setCreateError(d.error ?? '新增失敗')
        return
      }
      const selectedDept = (deptGroups ?? []).find(dep => dep.id === newRoleDeptGroup) ?? null
      const newRole: RoleData = {
        id: d.id ?? d.role?.id ?? String(Date.now()),
        name: trimmed,
        is_system: false,
        department_id: newRoleDeptGroup || null,
        department_name: selectedDept?.name ?? null,
        level: d.level ?? null,
        permissions: newRolePerms,
        custom_default_permissions: null,
        custom_default_assignable_role_names: null,
      }
      setRoles(prev => [...prev, newRole])
      setNewRoleName('')
      setNewRolePerms([])
      setNewRoleDeptGroup('')
      setNewRoleLevel('viewer')
      setNewRoleOpen(false)
    } catch {
      setCreateError('新增失敗，請重試')
    } finally {
      setCreating(false)
    }
  }

  // 新建角色表單：扁平列出一組 perm keys 的共用 render（可見性/料卡列表/功能設定/料卡細節/
  // 帳號管理/追蹤板/人為配件報價共用；拆成函式讓 sections 陣列可以在「料卡管理」「文件管理」
  // 前後分兩段呼叫，藉此達成「料卡管理→文件管理→追蹤板」的顯示順序，不用整個重寫版面）
  function renderNewRolePermSection(section: { label: string; keys: readonly string[]; radio: boolean }) {
    return (
      <div key={section.label}>
        <p className="text-[11px] font-semibold text-[#a08060] mb-1">{section.label}</p>
        <div className="space-y-1 pl-1">
          {section.keys.map(key => (
            <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type={section.radio ? 'radio' : 'checkbox'}
                name={section.radio ? 'new-role-visibility' : undefined}
                checked={newRolePerms.includes(key)}
                onChange={() => {
                  if (section.radio) {
                    const other = key === 'read_all_cards' ? 'read_active_only' : 'read_all_cards'
                    setNewRolePerms(prev => [...prev.filter(p => p !== other && p !== key), key])
                  } else {
                    setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
                  }
                }}
                className="accent-[#7a5230]"
              />
              <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
            </label>
          ))}
          {/* 追蹤板：合併 checkbox */}
          {section.label === '追蹤板' && (
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newRolePerms.includes('create_issues') || newRolePerms.includes('tracker_edit_issue')}
                onChange={() => {
                  const hasAny = newRolePerms.includes('create_issues') || newRolePerms.includes('tracker_edit_issue')
                  if (hasAny) {
                    setNewRolePerms(prev => prev.filter(p => p !== 'create_issues' && p !== 'tracker_edit_issue'))
                  } else {
                    setNewRolePerms(prev => [...prev, 'create_issues', 'tracker_edit_issue'])
                  }
                }}
                className="accent-[#7a5230]"
              />
              <span className="text-xs text-[#4a3422]">可新增/編輯任務</span>
            </label>
          )}
        </div>
      </div>
    )
  }

  function askDelete(role: RoleData) {
    setPendingDelete(role)
    setDeleteError(null)
    setConfirmOpen(true)
  }

  async function doDelete(role: RoleData) {
    try {
      const res = await fetch(`/api/roles/${role.id}`, { method: 'DELETE' })
      if (res.status === 409) {
        const d = await res.json()
        setDeleteError(d.error ?? '此角色仍有使用者，無法刪除')
        return
      }
      if (!res.ok) {
        const d = await res.json()
        setDeleteError(d.error ?? '刪除失敗')
        return
      }
      setRoles(prev => prev.filter(r => r.id !== role.id))
    } catch {
      setDeleteError('刪除失敗，請重試')
    }
  }

  async function handleReorder(fromId: string, toId: string) {
    if (fromId === toId) return
    const fromIdx = roles.findIndex(r => r.id === fromId)
    const toIdx   = roles.findIndex(r => r.id === toId)
    if (fromIdx === -1 || toIdx === -1) return

    const reordered = [...roles]
    const [dragged] = reordered.splice(fromIdx, 1)
    reordered.splice(toIdx, 0, dragged)
    const orders = reordered.map((r, i) => ({ id: r.id, sort_order: (i + 1) * 1000 }))
    const sortMap = Object.fromEntries(orders.map(o => [o.id, o.sort_order]))
    const originalRoles = roles

    setRoles(reordered.map(r => ({ ...r, sort_order: sortMap[r.id] })))
    setDraggingId(null)
    setDragOverId(null)

    try {
      const res = await fetch('/api/roles/reorder', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orders }),
      })
      if (!res.ok) throw new Error('Failed')
    } catch {
      setRoles(originalRoles)
      alert('排序更新失敗，請重試')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-[#6b4f38]">角色清單</h2>
        <div className="flex items-center gap-2">
          {onSwitchSubTab && (
            <button
              type="button"
              onClick={() => onSwitchSubTab('departments')}
              className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-[#7a5230] border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
            >
              部門管理
            </button>
          )}
          <button
            onClick={() => setNewRoleOpen(v => !v)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors shadow-[0_0_8px_rgba(122,82,48,.35)]"
          >
            <Plus className="h-4 w-4" />
            新增角色
          </button>
        </div>
      </div>

      {/* 新增角色 inline form */}
      {newRoleOpen && (
        <div className="bg-white rounded-xl border border-[rgba(122,82,48,.2)] p-4 shadow-sm">
          <h3 className="text-sm font-semibold text-[#6b4f38] mb-3">新增角色</h3>
          <form onSubmit={handleCreate} className="space-y-3">
            <input
              type="text"
              value={newRoleName}
              onChange={e => setNewRoleName(e.target.value)}
              placeholder="角色名稱（如：倉管人員）"
              required
              disabled={creating}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
            />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#a08060] mb-1">部門</label>
                <select
                  value={newRoleDeptGroup}
                  onChange={e => setNewRoleDeptGroup(e.target.value)}
                  disabled={creating}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                >
                  <option value="">無部門</option>
                  {(deptGroups ?? []).map(d => (
                    <option key={d.id} value={d.id}>{DEPT_GROUP_LABELS[d.name] ?? d.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#a08060] mb-1">層級</label>
                <select
                  value={newRoleLevel}
                  onChange={e => setNewRoleLevel(e.target.value)}
                  disabled={creating}
                  className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
                >
                  <option value="viewer">一般</option>
                  <option value="member">成員</option>
                  <option value="dept_admin">部門管理員</option>
                  <option value="super_admin">管理員</option>
                </select>
              </div>
            </div>
            <p className="text-xs text-[#a08060]">初始權限（可新增後再調整）</p>
            {/* 新增角色：扁平列出所有 perm（除 edit_card_* 子選項展開在父下方） */}
            <div className="space-y-3">
              {[
                { label: '可見性', keys: VISIBILITY_PERMS, radio: true },
                { label: '料卡列表', keys: LIST_PERMS, radio: false },
                { label: '功能設定', keys: FEATURE_PERMS, radio: false },
                { label: '料卡細節', keys: DETAIL_PERMS, radio: false },
                { label: '帳號管理', keys: ACCOUNT_PERMS, radio: false },
              ].map(section => renderNewRolePermSection(section))}
              {/* 料卡管理 */}
              <div>
                <p className="text-[11px] font-semibold text-[#a08060] mb-1">料卡管理</p>
                <div className="space-y-1 pl-1">
                  {CARD_MGMT_PERMS.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(key)}
                        onChange={() => setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
                    </label>
                  ))}
                  {/* 編輯料卡父選項 */}
                  <div>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={EDIT_CARD_CHILD_PERMS.some(k => newRolePerms.includes(k))}
                        onChange={() => {
                          const anyChecked = EDIT_CARD_CHILD_PERMS.some(k => newRolePerms.includes(k))
                          if (anyChecked) {
                            setNewRolePerms(prev => prev.filter(p => !(EDIT_CARD_CHILD_PERMS as readonly string[]).includes(p)))
                          } else {
                            setNewRolePerms(prev => [...prev, ...EDIT_CARD_CHILD_PERMS.filter(k => !prev.includes(k))])
                          }
                        }}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">編輯料卡</span>
                    </label>
                    <div className="pl-5 mt-1 grid grid-cols-2 gap-x-2 gap-y-1">
                      {EDIT_CARD_CHILD_PERMS.map(fkey => (
                        <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={newRolePerms.includes(fkey)}
                            onChange={() => setNewRolePerms(prev => prev.includes(fkey) ? prev.filter(p => p !== fkey) : [...prev, fkey])}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-xs text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* 文件管理 */}
              <div>
                <p className="text-[11px] font-semibold text-[#a08060] mb-1">文件管理</p>
                <div className="space-y-1 pl-1">
                  {DOCUMENT_MGMT_PERMS.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(key)}
                        onChange={() => setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* 維修資訊 */}
              <div>
                <p className="text-[11px] font-semibold text-[#a08060] mb-1">維修資訊</p>
                <div className="space-y-1 pl-1">
                  {MAINTENANCE_INFO_PERMS.map(key => (
                    <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={newRolePerms.includes(key)}
                        onChange={() => setNewRolePerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-xs text-[#4a3422]">{PERM_LABELS[key]}</span>
                    </label>
                  ))}
                </div>
              </div>
              {[
                { label: '追蹤板', keys: TRACKER_PERMS, radio: false },
                { label: '人為配件報價', keys: QUOTE_PERMS, radio: false },
                { label: '設備組合', keys: PACKAGE_PERMS, radio: false },
                { label: '使用統計', keys: ANALYTICS_PERMS, radio: false },
              ].map(section => renderNewRolePermSection(section))}
            </div>
            {createError && <p className="text-xs text-[#b5451b]">{createError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => { setNewRoleOpen(false); setNewRoleName(''); setNewRolePerms([]); setNewRoleDeptGroup(''); setNewRoleLevel('viewer'); setCreateError(null) }}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={creating || !newRoleName.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
              >
                {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                新增
              </button>
            </div>
          </form>
        </div>
      )}

      {deleteError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {deleteError}
        </div>
      )}

      {permError && (
        <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-4 py-3">
          {permError}
        </div>
      )}

      {/* 角色卡片清單 */}
      {roles.length === 0 && (
        <p className="text-sm text-[#a08060] py-8 text-center">尚無角色資料（請先執行 SQL migration）</p>
      )}

      {roles.map(role => {
        const isExpanded = expandedIds.has(role.id)
        const isRenamingThis = editingId === role.id
        const isSavingPerm = savingPermId === role.id
        const isSavingName = savingNameId === role.id
        const draft = getDraft(role)
        const visibility = draft.includes('read_all_cards') ? 'read_all_cards' : draft.includes('read_active_only') ? 'read_active_only' : null

        return (
          <div
            key={role.id}
            draggable
            onDragStart={() => setDraggingId(role.id)}
            onDragOver={(e) => { e.preventDefault(); setDragOverId(role.id) }}
            onDrop={() => handleReorder(draggingId!, role.id)}
            onDragEnd={() => { setDraggingId(null); setDragOverId(null) }}
            className={`group bg-white rounded-xl border shadow-sm overflow-hidden transition-colors ${draggingId && dragOverId === role.id ? 'border-[#c49a72] border-2' : 'border-[rgba(122,82,48,.15)]'}`}
          >
            {/* 卡片 Header */}
            <div className="px-5 py-4 flex items-center gap-3">
              <GripVertical className="h-4 w-4 text-[#d4bda0] cursor-grab shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
              <div className="flex-1 min-w-0">
                {isRenamingThis ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') saveRename(role)
                        if (e.key === 'Escape') setEditingId(null)
                      }}
                      onBlur={() => saveRename(role)}
                      autoFocus
                      disabled={isSavingName}
                      className="border border-[#c49a72] rounded-lg px-2 py-1 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50 w-40"
                    />
                    {isSavingName && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />}
                    <button
                      type="button"
                      onClick={() => saveRename(role)}
                      disabled={isSavingName}
                      className="text-[#7a5230] hover:text-[#5a3820] disabled:opacity-40"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="text-[#a08060] hover:text-[#6b4f38]"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-[#2c1e12] text-sm">{role.name}</span>
                    {role.is_system && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                        系統
                      </span>
                    )}
                    <DeptBadge departmentName={role.department_name} level={role.level} />
                  </div>
                )}
                <p className="text-xs text-[#a08060] mt-0.5">
                  {visibility === 'read_all_cards'
                    ? '可見性：看全部料卡'
                    : visibility === 'read_active_only'
                    ? '可見性：只看現役料卡'
                    : '可見性：未設定'}
                </p>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  onClick={() => startRename(role)}
                  title="重命名"
                  className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {!role.is_system && (
                  <button
                    onClick={() => askDelete(role)}
                    title="刪除角色"
                    className="p-1.5 rounded-lg text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.08)] transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
                <button
                  onClick={() => toggleExpand(role.id, role)}
                  title={isExpanded ? '收合' : '展開'}
                  className="p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
                >
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* 展開的權限編輯區 */}
            {isExpanded && (
              <div className="border-t border-[rgba(122,82,48,.1)] px-5 py-4 space-y-4 bg-[#faf6f0]">
                {isSavingPerm && (
                  <div className="flex items-center gap-2 text-xs text-[#a08060]">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    儲存中…
                  </div>
                )}

                {/* 可見性：Radio */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">可見性</p>
                  <div className="space-y-1.5">
                    {VISIBILITY_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="radio"
                          name={`visibility-${role.id}`}
                          checked={draft.includes(key)}
                          onChange={() => handleVisibilityChange(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 料卡列表 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">料卡列表</p>
                  <div className="space-y-1.5">
                    {LIST_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 功能設定 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">功能設定</p>
                  <div className="space-y-1.5">
                    {FEATURE_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 料卡細節 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">料卡細節</p>
                  <div className="space-y-1.5">
                    {DETAIL_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 料卡管理 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">料卡管理</p>
                  <div className="space-y-1.5">
                    {CARD_MGMT_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                    {/* 編輯料卡：父子連動 */}
                    {(() => {
                      const parentState = getEditCardParentState(draft)
                      return (
                        <div>
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              ref={el => {
                                if (el) el.indeterminate = parentState === 'some'
                              }}
                              checked={parentState === 'all'}
                              onChange={() => handleEditCardParentToggle(role)}
                              disabled={isSavingPerm}
                              className="accent-[#7a5230]"
                            />
                            <span className="text-sm text-[#4a3422]">編輯料卡</span>
                          </label>
                          <div className="pl-5 mt-1.5 grid grid-cols-2 gap-x-2 gap-y-1.5">
                            {EDIT_CARD_CHILD_PERMS.map(fkey => (
                              <label key={fkey} className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={draft.includes(fkey)}
                                  onChange={() => handleDetailToggle(role, fkey)}
                                  disabled={isSavingPerm}
                                  className="accent-[#7a5230]"
                                />
                                <span className="text-sm text-[#4a3422]">{PERM_LABELS[fkey]}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                </div>

                {/* 文件管理 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">文件管理</p>
                  <div className="space-y-1.5">
                    {DOCUMENT_MGMT_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 維修資訊 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">維修資訊</p>
                  <div className="space-y-1.5">
                    {MAINTENANCE_INFO_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 追蹤板 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">追蹤板</p>
                  <div className="space-y-1.5">
                    {TRACKER_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                    {/* 合併 checkbox：可新增/編輯任務 */}
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={draft.includes('create_issues') || draft.includes('tracker_edit_issue')}
                        onChange={() => {
                          const hasAny = draft.includes('create_issues') || draft.includes('tracker_edit_issue')
                          if (hasAny) {
                            setDraftPerms(d => ({
                              ...d,
                              [role.id]: draft.filter(p => p !== 'create_issues' && p !== 'tracker_edit_issue'),
                            }))
                          } else {
                            const toAdd = ['create_issues', 'tracker_edit_issue'].filter(p => !draft.includes(p))
                            setDraftPerms(d => ({ ...d, [role.id]: [...draft, ...toAdd] }))
                          }
                        }}
                        disabled={isSavingPerm}
                        className="accent-[#7a5230]"
                      />
                      <span className="text-sm text-[#4a3422]">可新增/編輯任務</span>
                    </label>
                  </div>
                </div>

                {/* 人為配件報價 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">人為配件報價</p>
                  <div className="space-y-1.5">
                    {QUOTE_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => {
                            if (key === 'view_quotes') return handleQuoteViewToggle(role)
                            if (key === 'view_quotes_manager_price') return handleQuoteManagerPriceToggle(role)
                            return handleDetailToggle(role, key)
                          }}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 設備組合 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">設備組合</p>
                  <div className="space-y-1.5">
                    {PACKAGE_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 使用統計 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">使用統計</p>
                  <div className="space-y-1.5">
                    {ANALYTICS_PERMS.map(key => (
                      <label key={key} className="flex items-center gap-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={draft.includes(key)}
                          onChange={() => handleDetailToggle(role, key)}
                          disabled={isSavingPerm}
                          className="accent-[#7a5230]"
                        />
                        <span className="text-sm text-[#4a3422]">{PERM_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* 帳號管理 */}
                <div>
                  <p className="text-xs font-semibold text-[#6b4f38] mb-2">帳號管理</p>
                  <div className="space-y-1.5">
                    {ACCOUNT_PERMS.map(key => {
                      const isCurrentUserRole = role.name === currentUserRoleName
                      const isSuperAdminCore = role.is_system && role.level === 'super_admin'
                      const isLocked = isCurrentUserRole || isSuperAdminCore
                      const lockTooltip = isSuperAdminCore
                        ? '系統管理角色不可移除此權限'
                        : isCurrentUserRole
                        ? '當前帳號所屬角色，不可移除此權限'
                        : undefined
                      return (
                        <label
                          key={key}
                          className={`flex items-center gap-2 select-none ${isLocked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                          title={lockTooltip}
                        >
                          <input
                            type="checkbox"
                            checked={isLocked ? true : draft.includes(key)}
                            disabled={isLocked || isSavingPerm}
                            onChange={() => { if (!isLocked) handleDetailToggle(role, key) }}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-sm text-[#4a3422]">
                            {PERM_LABELS[key]}
                            {isLocked && <span className="ml-1 text-[10px] text-[#a08060]">（鎖定）</span>}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 可指派角色 */}
                <div className="mt-4 pt-4 border-t border-[rgba(122,82,48,.08)]">
                  <p className="text-xs font-semibold text-[#6b4f38] mb-1">可指派角色</p>
                  <p className="text-[10px] text-[#a08060] mb-2">
                    設定此角色在帳號管理頁可指派給他人的角色清單。
                  </p>
                  <div className="space-y-1.5">
                    {roles.map(r => {
                      const assignableDraft = draftAssignable[role.id]
                      const isChecked = Array.isArray(assignableDraft)
                        ? assignableDraft.includes(r.name)
                        : false
                      return (
                        <label key={r.id} className="flex items-center gap-2 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              setDraftAssignable(d => {
                                const cur: string[] = Array.isArray(d[role.id]) ? (d[role.id] as string[]) : []
                                const next = isChecked
                                  ? cur.filter(n => n !== r.name)
                                  : [...cur, r.name]
                                return { ...d, [role.id]: next }
                              })
                            }}
                            className="accent-[#7a5230]"
                          />
                          <span className="text-xs text-[#4a3422]">{r.name}</span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                {/* 錯誤訊息 */}
                {saveError && (
                  <p className="text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">{saveError}</p>
                )}

                {/* footer：儲存變更 / 取消 / 恢復預設 / 記憶預設 */}
                {defaultSaveError && (
                  <p className="text-xs text-[#b5451b]">{defaultSaveError}</p>
                )}
                <div className="flex items-center flex-wrap gap-2 pt-2 border-t border-[rgba(122,82,48,.1)]">
                  <button
                    onClick={() => saveAll(role)}
                    disabled={isSavingPerm || savingDefaultId === role.id || !isDirty(role)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors"
                  >
                    {isSavingPerm ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    儲存變更
                  </button>
                  <button
                    onClick={() => discardDraft(role)}
                    disabled={isSavingPerm || savingDefaultId === role.id || !isDirty(role)}
                    className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-50 transition-colors"
                  >
                    取消
                  </button>
                  <button
                    onClick={() => handleRestoreDefault(role)}
                    disabled={isSavingPerm || savingDefaultId === role.id || !role.custom_default_permissions || !isDirty(role)}
                    title={!role.custom_default_permissions ? '尚未記憶預設，請先按「記憶預設」' : '恢復至上次記憶的快照'}
                    className="px-3 py-1.5 text-xs text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    恢復預設
                  </button>
                  <button
                    onClick={() => handleSaveDefault(role)}
                    disabled={isSavingPerm || savingDefaultId === role.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-50 transition-colors"
                  >
                    {savingDefaultId === role.id
                      ? <Loader2 className="h-3 w-3 animate-spin" />
                      : defaultSavedFeedback === role.id
                        ? <Check className="h-3 w-3 text-green-600" />
                        : null
                    }
                    {defaultSavedFeedback === role.id ? '已記憶' : '記憶預設'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}

      <ConfirmDialog
        open={confirmOpen}
        title={`刪除角色「${pendingDelete?.name}」？`}
        message="刪除後無法復原。若仍有使用者套用此角色，將無法刪除。"
        confirmLabel="刪除"
        danger
        onConfirm={() => {
          setConfirmOpen(false)
          if (pendingDelete) doDelete(pendingDelete)
        }}
        onCancel={() => {
          setConfirmOpen(false)
          setPendingDelete(null)
        }}
      />
    </div>
  )
}
