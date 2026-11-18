'use client'

import { useState, useMemo, useEffect, useLayoutEffect, useCallback, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Fuse from 'fuse.js'
import { EquipmentCard, AppSettings, UserGroup, QuoteItem } from '@/types/equipment'
import { Input } from '@/components/ui/input'
import EquipmentCardItem from '@/components/EquipmentCardItem'
import EquipmentCardRow from '@/components/EquipmentCardRow'
import { useFlipAnimation, prefersReducedMotion } from '@/hooks/useFlipAnimation'
import CardDetailDialog from '@/components/CardDetailDialog'
import { printCards } from '@/components/print/printCards'
import BoxLabelDialog from '@/components/print/BoxLabelDialog'
import CardFormDialog from '@/components/CardFormDialog'
import UserMenu from '@/components/UserMenu'
import BatchImportDialog from '@/components/BatchImportDialog'
import ConfirmDialog from '@/components/ConfirmDialog'
import GroupsPanel from '@/components/GroupsPanel'
import SubfilterTagBar from '@/components/SubfilterTagBar'
import QuotesClient from '@/components/QuotesClient'
import DocumentsClient from '@/components/DocumentsClient'
import PackagesClient from '@/components/PackagesClient'
import MaintenanceInfoClient from '@/components/maintenance/MaintenanceInfoClient'
import SystemAdminClient from '@/components/admin/SystemAdminClient'
import ResidualClient from '@/components/residual/ResidualClient'
import StandardPriceSheetClient from '@/components/standard-prices/StandardPriceSheetClient'
import InventoryHub from '@/components/inventory/InventoryHub'
import { Search, X, ArrowUp, ArrowDown, Plus, Trash2, Loader2, CheckSquare, Printer, FileUp, FileDown, Users, ChevronDown, SlidersHorizontal, AlertTriangle, Star, Folder, Check, ClipboardList, Receipt, FileText, LayoutGrid, Package, Wrench, Settings, Tags, Calculator, Warehouse, List as ListIcon } from 'lucide-react'
import TrackerClient from '@/app/tracker/TrackerClient'
import type { Issue } from '@/app/tracker/page'
import type { EquipmentPackage, SharedEquipmentPackage } from '@/hooks/usePackages'
import { useHeartbeat } from '@/hooks/useHeartbeat'
import { logUsageEvent } from '@/lib/analyticsClient'

interface TrackerData {
  initialIssues: Issue[]
  allowedEmails: string[]
  issueTypes: string[]
  issueTags: string[]
  userDepartmentId?: string | null
}

interface PackagesData {
  ownPackages: EquipmentPackage[]
  sharedPackages: SharedEquipmentPackage[]
  departments: { id: string; name: string }[]
  userDepartmentId: string | null
  sourceGroupUpdatedAt: Record<string, string>
}

interface Props {
  initialCards: EquipmentCard[]
  isAdmin: boolean
  settings: AppSettings
  userEmail: string
  initialGroups?: UserGroup[]
  initialBookmarkNotes?: Record<string, string>
  permissions?: string[]
  userRole?: string
  trackerData?: TrackerData
  subfilterConfig?: Record<string, string[]>
  quoteItems?: QuoteItem[]
  packagesData?: PackagesData
}

const SORT_OPTIONS = [
  { value: 'id',   label: '料號排序' },
  { value: 'name', label: '品名排序' },
  { value: 'date', label: '新增日期' },
]

// Step 55-05：滾輪式數字（每一位數上下滾動換數字），只用在批次操作列的「已選 N 張」
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
function RollingNumber({ value }: { value: number }) {
  const digits = String(value).split('')
  const reduce = prefersReducedMotion()
  return (
    <span className="inline-flex align-bottom tabular-nums">
      <span className="sr-only">{value}</span>
      {digits.map((d, i) => {
        const pos = digits.length - 1 - i // 以「個位數＝0」當 key，位數增減時其他位數不會重建
        return (
          <span key={pos} aria-hidden className="relative inline-block h-5 overflow-hidden leading-5">
            <span
              className="block"
              style={{
                transform: `translateY(-${Number(d) * 1.25}rem)`,
                transition: reduce ? 'none' : 'transform .35s cubic-bezier(.2,.8,.2,1)',
              }}
            >
              {DIGITS.map(n => <span key={n} className="block h-5 leading-5 text-center">{n}</span>)}
            </span>
          </span>
        )
      })}
    </span>
  )
}

export default function PhotoWall({ initialCards, isAdmin, settings, userEmail, initialGroups, initialBookmarkNotes, permissions = [], userRole, trackerData, subfilterConfig, quoteItems = [], packagesData }: Props) {
  const router       = useRouter()
  const searchParams = useSearchParams()

  useHeartbeat()

  const canManage        = permissions.includes('manage_users')
  const canEditCard      = permissions.includes('create_delete_cards') || permissions.some(p => p.startsWith('edit_card_'))
  const canUseBookmarks  = permissions.includes('use_bookmarks')
  const canPrint         = permissions.includes('print_cards')

  const [localSubfilterConfig, setLocalSubfilterConfig] = useState<Record<string, string[]>>(subfilterConfig ?? {})

  const activeStatus = settings.statuses[0] ?? '現役'

  const [query,        setQuery]        = useState(() => searchParams.get('q')      ?? '')
  const [selectedCats, setSelectedCats] = useState<Set<string>>(() => {
    const cat = searchParams.get('cat')
    return cat ? new Set(cat.split(',').filter(Boolean)) : new Set()
  })
  const [selectedSubTags, setSelectedSubTags] = useState<string[]>([])
  const [selectedStatuses, setSelectedStatuses] = useState<Set<string>>(() => {
    const s = searchParams.get('status')
    return s ? new Set(s.split(',').filter(Boolean)) : new Set()
  })
  const [sortBy,   setSortBy]   = useState(() => searchParams.get('sort')   ?? 'id')
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>(() => (searchParams.get('dir') ?? 'asc') as 'asc' | 'desc')
  const [isNewFilter, setIsNewFilter] = useState(() => searchParams.get('new') === '1')
  const [noPhotoFilter, setNoPhotoFilter] = useState(false)
  const [changhuiFilter, setChanghuiFilter] = useState(false)
  const [selected, setSelected] = useState<EquipmentCard | null>(null)

  const [formMode,    setFormMode]    = useState<'create' | 'edit'>('create')
  const [formOpen,    setFormOpen]    = useState(false)
  const [editingCard, setEditingCard] = useState<EquipmentCard | undefined>(undefined)

  const [selectMode,   setSelectMode]   = useState(false)
  const [selectedIds,  setSelectedIds]  = useState<Set<string>>(new Set())
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [boxLabelOpen, setBoxLabelOpen] = useState(false)
  // 從細節頁開啟的單張封箱標籤：直接存料卡本身，細節頁關閉或換卡時不會殘留舊的開啟狀態
  const [boxLabelSingle, setBoxLabelSingle] = useState<EquipmentCard | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [sortOpen, setSortOpen] = useState(false)
  const [fabOpen, setFabOpen] = useState(false)
  const fabRef = useRef<HTMLDivElement>(null)
  const [showFilters, setShowFilters] = useState(() => {
    if (typeof window === 'undefined') return false
    try {
      const saved = localStorage.getItem('equipmentShowFilters')
      if (saved !== null) return saved === 'true'
      return window.innerWidth >= 768
    } catch { return window.innerWidth >= 768 }
  })
  const sortRef = useRef<HTMLDivElement>(null)

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string; message?: string; detail?: string; onConfirm: () => void
  }>({ title: '', onConfirm: () => {} })

  // 凍結工具列高度量測：供「我的關注」「文件管理」「設備組合」內部工具列 sticky 定位使用，
  // 動態量測而非寫死像素值，因為不同分頁/螢幕寬度下這層高度不同
  const stickyHeaderRef = useRef<HTMLDivElement>(null)
  const [stickyHeaderHeight, setStickyHeaderHeight] = useState(0)
  useEffect(() => {
    const el = stickyHeaderRef.current
    if (!el) return
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setStickyHeaderHeight(entry.contentRect.height)
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 組合 state
  const [groups, setGroups] = useState<UserGroup[]>(initialGroups ?? [])
  const [activeTab, setActiveTab] = useState<'all' | 'bookmarks' | 'tracker' | 'quotes' | 'documents' | 'packages' | 'maintenance' | 'admin' | 'prices' | 'residual' | 'inventory'>('all')
  // 進網站後稍等一下（讓主頁先畫好），就在背景把其他分頁都載入；切過去時資料已經在了，不用再等。
  // visited：這個分頁使用者去過沒。沒去過之前一律當作「啟用中」，讓掛載時的第一次載入在背景跑完；
  // 去過之後切回來，才會照原本的做法靜默重抓最新資料（畫面不會出現讀取中）。
  const [warm, setWarm] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setWarm(true), 800)
    return () => clearTimeout(t)
  }, [])
  const [visited, setVisited] = useState<Set<string>>(new Set())
  const act = (tab: string) => activeTab === tab || !visited.has(tab)
  useEffect(() => {
    setVisited(v => (v.has(activeTab) ? v : new Set(v).add(activeTab)))
  }, [activeTab])
  // 首次切到「我的關注」才 mount GroupsPanel，之後保持常駐（CSS hide/show）
  const [groupsMounted, setGroupsMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'bookmarks') setGroupsMounted(true)
  }, [activeTab])
  // 首次切到「任務板」才 mount TrackerClient，之後保持常駐（CSS hide/show）保留 state
  const [trackerMounted, setTrackerMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'tracker' || (warm && permissions.includes('view_tracker'))) setTrackerMounted(true)
  }, [activeTab, warm, permissions])
  // 首次切到「人為配件報價」才 mount QuotesClient，之後保持常駐（CSS hide/show）保留 state
  const [quotesMounted, setQuotesMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'quotes') setQuotesMounted(true)
  }, [activeTab])
  // 首次切到「標準售價」才 mount StandardPricesClient，之後保持常駐（CSS hide/show）保留 state
  const [pricesMounted, setPricesMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'prices') setPricesMounted(true)
  }, [activeTab])
  // Step 54：首次切到「庫存」才 mount InventoryClient，之後保持常駐（CSS hide/show）
  const [inventoryMounted, setInventoryMounted] = useState(false)
  // 有庫存權限的人：進網站就先掛載（背景載入資料），切到庫存分頁時不用再等
  useEffect(() => {
    if (activeTab === 'inventory' || permissions.includes('view_inventory') || permissions.includes('view_erp_inventory')) setInventoryMounted(true)
  }, [activeTab, permissions])
  // 首次切到「文件管理」才 mount DocumentsClient，之後保持常駐（CSS hide/show）保留 state
  const [documentsMounted, setDocumentsMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'documents' || (warm && permissions.includes('manage_documents'))) setDocumentsMounted(true)
  }, [activeTab, warm, permissions])
  // 文件管理批次動作背景執行中時，即使切走分頁也要在分頁按鈕上維持提示
  const [documentsBusy, setDocumentsBusy] = useState(false)
  // 首次切到「設備組合」才 mount PackagesClient，之後保持常駐（CSS hide/show）保留 state
  const [packagesMounted, setPackagesMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'packages' || (warm && (permissions.includes('view_own_packages') || permissions.includes('edit_own_packages')
      || permissions.includes('share_own_packages') || permissions.includes('view_shared_packages')))) setPackagesMounted(true)
  }, [activeTab, warm, permissions])
  // 首次切到「維修資訊」才 mount MaintenanceInfoClient，之後保持常駐（CSS hide/show）保留 state
  const [maintenanceMounted, setMaintenanceMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'maintenance' || (warm && permissions.includes('manage_maintenance_info'))) setMaintenanceMounted(true)
  }, [activeTab, warm, permissions])
  // 首次切到「設備殘值計算」才 mount ResidualClient，之後保持常駐（CSS hide/show）保留計算中的資料
  const [residualMounted, setResidualMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'residual' || (warm && (permissions.includes('view_residual') || permissions.includes('edit_residual')))) setResidualMounted(true)
  }, [activeTab, warm, permissions])
  // 供 CardDetailDialog「查看維修資訊」入口設定：跳轉維修資訊分頁時自動篩選出與該料號相關的規則
  const [maintenanceFilter, setMaintenanceFilter] = useState<{ equipmentId: string } | null>(null)
  // 首次切到「系統管理」才 mount SystemAdminClient，之後保持常駐（CSS hide/show）保留 state
  const [adminMounted, setAdminMounted] = useState(false)
  useEffect(() => {
    if (activeTab === 'admin' || (warm && (permissions.includes('manage_users') || permissions.includes('manage_roles') || permissions.includes('view_analytics')))) setAdminMounted(true)
  }, [activeTab, warm, permissions])
  // 供標題列「帳號管理」徽章點擊後跳轉系統管理分頁內的帳號管理子分頁：
  // 每次點擊帶一個新的 requestId，讓 SystemAdminClient 能區分「同一個 tab 但這是新的一次跳轉請求」
  const [adminSubTabRequest, setAdminSubTabRequest] = useState<{ tab: 'users' | 'roles' | 'departments' | 'analytics'; requestId: number } | null>(null)
  const adminSubTabRequestIdRef = useRef(0)
  // 若 use_bookmarks 權限被移除，回退到全部料卡
  useEffect(() => {
    if (activeTab === 'bookmarks' && !permissions.includes('use_bookmarks')) {
      setActiveTab('all')
    }
  }, [permissions, activeTab])

  // 若 filter_all_statuses 權限被移除，清除狀態篩選
  useEffect(() => {
    if (!permissions.includes('filter_all_statuses') && selectedStatuses.size > 0) {
      setSelectedStatuses(new Set())
    }
  }, [permissions]) // eslint-disable-line react-hooks/exhaustive-deps

  // 加入組合 popup
  const [addToGroupPopup, setAddToGroupPopup] = useState<{ card: EquipmentCard; rect: DOMRect } | null>(null)
  const addToGroupPopupRef = useRef<HTMLDivElement>(null)
  const [popupPendingIds, setPopupPendingIds] = useState<Set<string>>(new Set())

  // 個人備註 state（只有自己看得到，儲存於 user_bookmarks.notes）
  const [bookmarkNotes, setBookmarkNotes] = useState<Record<string, string>>(initialBookmarkNotes ?? {})
  const bookmarkSaveTimerRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // 追蹤板待處理計數（以指派給我且未完成的議題計算）
  const [trackerPendingCount, setTrackerPendingCount] = useState(() =>
    trackerData
      ? trackerData.initialIssues.filter(
          (i) => i.status !== '已完成' && i.assignee_emails.includes(userEmail),
        ).length
      : 0,
  )

  // 計算 defaultGroup 的書籤 IDs
  const defaultGroup = groups.find(g => g.is_default)
  const bookmarkedIds = useMemo(() =>
    new Set(defaultGroup?.group_items.map(i => i.equipment_id) ?? []),
  [defaultGroup])

  // 非預設組合（用於加入組合 popup）
  const nonDefaultGroups = useMemo(() => groups.filter(g => !g.is_default), [groups])

  // Step 55-12：主分頁滑動底塊。依目前分頁按鈕的位置與寬高移動（換行時也能跨行），
  // 視窗寬度、分頁按鈕數量（權限）、徽章數字改變時重新計算
  const tabsRef = useRef<HTMLDivElement>(null)
  const [tabPill, setTabPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [tabPillAnimate, setTabPillAnimate] = useState(false)
  const measureTabPill = useCallback(() => {
    const wrap = tabsRef.current
    if (!wrap) return
    const btn = wrap.querySelector<HTMLElement>(`[data-tab="${activeTab}"]`)
    if (!btn || btn.offsetWidth === 0) { setTabPill(null); return }
    const next = { x: btn.offsetLeft, y: btn.offsetTop, w: btn.offsetWidth, h: btn.offsetHeight }
    setTabPill(prev => (prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next))
  }, [activeTab])
  useLayoutEffect(() => {
    measureTabPill()
  }, [measureTabPill, permissions, trackerPendingCount, bookmarkedIds.size, documentsBusy])
  useEffect(() => {
    const wrap = tabsRef.current
    if (!wrap || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(() => measureTabPill())
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [measureTabPill])
  const tabPillReady = tabPill !== null
  useEffect(() => {
    // 第一次定位不播放滑動，之後切換才滑
    if (!tabPillReady) { setTabPillAnimate(false); return }
    const id = requestAnimationFrame(() => setTabPillAnimate(true))
    return () => cancelAnimationFrame(id)
  }, [tabPillReady])
  const tabCls = (tab: string) => `relative z-[1] flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
    activeTab === tab
      ? (tabPillReady
          ? 'bg-transparent text-white border-transparent'
          : 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]')
      : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
  }`

  function askConfirm(cfg: typeof confirmConfig) {
    setConfirmConfig(cfg)
    setConfirmOpen(true)
  }

  useEffect(() => {
    try { localStorage.setItem('equipmentShowFilters', String(showFilters)) } catch {}
  }, [showFilters])

  useEffect(() => {
    if (!sortOpen) return
    const close = (e: MouseEvent) => {
      if (sortRef.current && !sortRef.current.contains(e.target as Node)) setSortOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [sortOpen])

  useEffect(() => {
    if (!fabOpen) return
    const close = (e: MouseEvent) => {
      if (fabRef.current && !fabRef.current.contains(e.target as Node)) setFabOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [fabOpen])

  useEffect(() => {
    const params = new URLSearchParams()
    if (query)                params.set('q',      query)
    if (selectedCats.size > 0)     params.set('cat',    Array.from(selectedCats).join(','))
    if (selectedStatuses.size > 0) params.set('status', Array.from(selectedStatuses).join(','))
    if (sortBy   !== 'id')         params.set('sort',   sortBy)
    if (sortDir  !== 'asc')        params.set('dir',    sortDir)
    if (isNewFilter)               params.set('new',    '1')
    const qs = params.toString()
    router.replace(qs ? `?${qs}` : '/', { scroll: false })
  }, [query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, router])

  // 使用統計埋點：搜尋 debounce 800ms 後才記錄一次，避免每個按鍵都送
  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) return
    const timer = setTimeout(() => {
      logUsageEvent('card_search', { query: trimmed })
    }, 800)
    return () => clearTimeout(timer)
  }, [query])

  const fuse = useMemo(() => new Fuse(initialCards, {
    keys: [
      { name: 'equipment_id',   weight: 2 },
      { name: 'name',           weight: 2 },
      { name: 'vendor',         weight: 1 },
      { name: 'tags',           weight: 1 },
      { name: 'notes',          weight: 0.5 },
      { name: 'category',          weight: 0.5 },
      { name: 'documents.name', weight: 0.5 },
    ],
    threshold: 0.3,
    includeScore: true,
    minMatchCharLength: 2,
  }), [initialCards])

  // Step 55-S01/S02：搜尋階段單獨算（還沒套分類／狀態等其他篩選），同時回報這次是否走模糊備援；
  // S02「不限篩選有 N 筆」也直接用這份結果
  const searchBase = useMemo((): { list: EquipmentCard[]; fuzzy: boolean } => {
    const q = query.trim()
    if (!q) return { list: initialCards, fuzzy: false }
    if (/^\d+$/.test(q)) {
      // 純數字查詢：用精確包含比對，避免模糊算法造成不相關結果
      return {
        list: initialCards.filter(c =>
          c.equipment_id.includes(q) ||
          c.name.includes(q)
        ),
        fuzzy: false,
      }
    }
    // 兩階段搜尋：先精確比對（避免「MDVR-4G-4鏡」誤命中「HS 4G-DVR」這種
    // 只是部分片段對得上、但整體不相關的料卡），只有完全沒有精確結果時
    // 才 fallback 回 Fuse 模糊搜尋，保留給打錯字/記不清楚名稱的情境用
    const exactMatches = initialCards.filter(c =>
      c.equipment_id.includes(q) ||
      c.name.includes(q) ||
      c.tags.some(tag => tag.includes(q)) ||
      (c.vendor ?? '').includes(q) ||
      (c.category ?? '').includes(q)
    )
    if (exactMatches.length > 0) return { list: exactMatches, fuzzy: false }
    const fuseQ = q.replace(/[()[\]{}*+?\\^$|.]/g, '').trim()
    return fuseQ
      ? { list: fuse.search(fuseQ).map(r => r.item), fuzzy: true }
      : { list: initialCards, fuzzy: false }
  }, [initialCards, query, fuse])

  const { filtered, usedFuzzyFallback } = useMemo(() => {
    const q = query.trim()
    let result: EquipmentCard[] = [...searchBase.list]

    if (selectedCats.size > 0)     result = result.filter(c => selectedCats.has(c.category ?? ''))
    if (selectedStatuses.size > 0) result = result.filter(c => selectedStatuses.has(c.status ?? ''))
    if (isNewFilter)               result = result.filter(c => c.is_new)
    if (noPhotoFilter)             result = result.filter(c => !c.main_photo)
    if (changhuiFilter)            result = result.filter(c => c.vendor === '長輝')
    if (selectedSubTags.length > 0) {
      // 次級篩選是精確的預設標籤（例如「MDVR-4G-2鏡」），一律用精確包含比對，
      // 不能走 Fuse 模糊搜尋——否則「MDVR-4G-2鏡」跟「MDVR-4G-8鏡」這種只差一個字元
      // 的標籤會互相模糊命中，篩選範圍變得不精確
      const matchedIds = new Set<string>()
      for (const tag of selectedSubTags) {
        const t = tag.trim()
        result.forEach(c => {
          if (
            c.equipment_id.includes(t) ||
            c.name.includes(t) ||
            c.tags.some(cardTag => cardTag.includes(t))
          ) {
            matchedIds.add(c.equipment_id)
          }
        })
      }
      result = result.filter(c => matchedIds.has(c.equipment_id))
    }

    if (!q) {
      result.sort((a, b) => {
        let cmp = 0
        if (sortBy === 'name') {
          cmp = a.name.localeCompare(b.name, 'zh-TW')
        } else if (sortBy === 'date') {
          cmp = new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        } else {
          cmp = a.equipment_id.localeCompare(b.equipment_id)
        }
        return sortDir === 'desc' ? -cmp : cmp
      })
    }
    return { filtered: result, usedFuzzyFallback: searchBase.fuzzy }
  }, [searchBase, query, selectedCats, selectedStatuses, sortBy, sortDir, isNewFilter, noPhotoFilter, changhuiFilter, selectedSubTags])

  const hasActiveFilters = !!(query || selectedCats.size > 0 || selectedStatuses.size > 0 || isNewFilter || noPhotoFilter || changhuiFilter || selectedSubTags.length > 0)
  const activeFilterCount = selectedCats.size + selectedStatuses.size + selectedSubTags.length + (isNewFilter ? 1 : 0) + (noPhotoFilter ? 1 : 0) + (changhuiFilter ? 1 : 0)

  // Step 55-S02：有搜尋字＋有其他篩選＋結果 0 筆時，算出「只套搜尋字」的筆數與分類分布
  const broaderMatch = useMemo(() => {
    if (!query.trim() || activeFilterCount === 0 || filtered.length > 0) return null
    const list = searchBase.list
    if (list.length === 0) return null
    const byCat = new Map<string, number>()
    for (const c of list) {
      const k = c.category || '未分類'
      byCat.set(k, (byCat.get(k) ?? 0) + 1)
    }
    const parts = Array.from(byCat.entries()).sort((a, b) => b[1] - a[1])
    return { total: list.length, parts }
  }, [query, activeFilterCount, filtered.length, searchBase])

  // Step 55-S02：保留搜尋字、清除其他篩選（不能用 clearFilters，它會連搜尋字一起清掉；排序不算篩選，保留）
  function clearFiltersKeepQuery() {
    setSelectedCats(new Set())
    setSelectedStatuses(new Set())
    setIsNewFilter(false)
    setNoPhotoFilter(false)
    setChanghuiFilter(false)
    setSelectedSubTags([])
  }

  // Step 55-09：全部料卡網格／清單切換，記在 localStorage
  const [display, setDisplayState] = useState<'grid' | 'list'>('grid')
  useEffect(() => {
    try {
      const v = localStorage.getItem('photowall_display')
      if (v === 'grid' || v === 'list') setDisplayState(v)
    } catch { /* ignore */ }
  }, [])
  function setDisplay(v: 'grid' | 'list') {
    setDisplayState(v)
    try { localStorage.setItem('photowall_display', v) } catch { /* ignore */ }
  }

  // Step 55-03：篩選時卡片滑動補位。只有分類／次級篩選／狀態／NEW／無主圖／長輝／排序改變才播放，打字不播放
  const gridRef = useRef<HTMLDivElement>(null)
  const flipKeys = useMemo(() => filtered.map(c => c.equipment_id), [filtered])
  const flipTrigger = [
    Array.from(selectedCats).sort().join(','),
    selectedSubTags.join(','),
    Array.from(selectedStatuses).sort().join(','),
    isNewFilter, noPhotoFilter, changhuiFilter, sortBy, sortDir,
  ].join('|')
  useFlipAnimation(gridRef, flipKeys, { trigger: flipTrigger, layoutKey: `${display}|${activeTab === 'all' ? 1 : 0}` })

  // Step 55-10：全部料卡捲動後凍結列變矮（>160 收、<40 展，兩個門檻避免抖動）＋回到頂端鈕
  // ⚠️ 捲動錨定（Chrome scroll anchoring）：凍結列在文件流裡，收起變矮 D px 時瀏覽器會把 scrollY 一起減 D
  // 保持畫面內容不動。若收起門檻 < D + 展開門檻，收起後 scrollY 掉到展開門檻以下又展開，永遠捲不過去。
  // 因此收起門檻改為 max(160, D + 80)（D＝實際會被收掉的高度，收起前即時量測），收起後 scrollY 仍 ≥ 80；
  // 展開（<40）時瀏覽器反向加回 D，也一定低於收起門檻。沒有捲動錨定的瀏覽器（Safari）scrollY 不變，同樣不會來回切換。
  const [headerCompact, setHeaderCompact] = useState(false)
  const headerCompactRef = useRef(false)
  headerCompactRef.current = headerCompact
  const [showBackToTop, setShowBackToTop] = useState(false)
  const collapsibleChipsRef = useRef<HTMLDivElement>(null)
  const collapsibleFiltersRef = useRef<HTMLDivElement>(null)
  // 使用者手動按「篩選」強制展開時記下當時位置；再往下捲超過 600px 才恢復自動收起
  const forceExpandAtRef = useRef<number | null>(null)
  useEffect(() => {
    let raf = 0
    const update = () => {
      raf = 0
      const y = window.scrollY
      setShowBackToTop(y > 1200)
      if (y < 40) {
        forceExpandAtRef.current = null
        setHeaderCompact(false)
        return
      }
      if (headerCompactRef.current || activeTab !== 'all') return
      const collapseBy = (collapsibleChipsRef.current?.offsetHeight ?? 0) + (collapsibleFiltersRef.current?.offsetHeight ?? 0)
      if (y > Math.max(160, collapseBy + 80)) {
        const forcedAt = forceExpandAtRef.current
        if (forcedAt !== null) {
          if (y <= forcedAt + 600) return
          forceExpandAtRef.current = null
        }
        // 收起後頁面變短 collapseBy；可捲動距離不夠時不收，避免捲動位置被瀏覽器夾回而來回切換
        const room = document.documentElement.scrollHeight - window.innerHeight
        if (room - collapseBy > Math.max(160, collapseBy + 80)) setHeaderCompact(true)
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    window.addEventListener('scroll', onScroll, { passive: true })
    update()
    return () => {
      window.removeEventListener('scroll', onScroll)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [activeTab])
  // 只在全部料卡分頁收起：stickyHeaderHeight 也被我的關注／文件管理／設備組合當 stickyTop，其他分頁高度維持現狀
  const headerCollapsed = activeTab === 'all' && headerCompact

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  // Step 55-S03：搜尋字改變、且已捲過凍結列高度時，捲回結果頂端（只在全部料卡分頁）
  const queryEffectMountedRef = useRef(false)
  useEffect(() => {
    if (!queryEffectMountedRef.current) { queryEffectMountedRef.current = true; return }
    if (activeTab !== 'all') return
    if (window.scrollY > stickyHeaderHeight) scrollToTop()
  }, [query]) // eslint-disable-line react-hooks/exhaustive-deps

  // 畫面上有可見的全螢幕固定遮罩（自製對話框）時回傳 true
  function hasVisibleFullscreenOverlay(): boolean {
    const nodes = document.querySelectorAll<HTMLElement>('.fixed.inset-0')
    for (const n of Array.from(nodes)) {
      if (n.getClientRects().length === 0) continue
      const cs = window.getComputedStyle(n)
      if (cs.visibility === 'hidden' || cs.pointerEvents === 'none' || Number(cs.opacity) === 0) continue
      return true
    }
    return false
  }

  // Step 55-S04：全域「/」聚焦搜尋框；搜尋框內 Esc 清空、Enter 收鍵盤
  const searchInputRef = useRef<HTMLInputElement>(null)
  const [searchFocused, setSearchFocused] = useState(false)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return
      if (activeTab !== 'all' && activeTab !== 'bookmarks') return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || t.closest('input, textarea, select, [contenteditable]'))) return
      // 有任何對話框／遮罩開著就不攔截：Radix 的 role=dialog，以及 ConfirmDialog、GroupsPanel 內
      // 自製 modal（沒有 role，是 fixed inset-0 的全螢幕遮罩）
      if (document.querySelector('[role="dialog"], [role="alertdialog"], [aria-modal="true"]')) return
      if (hasVisibleFullscreenOverlay()) return
      if (formOpen || importOpen) return
      const input = searchInputRef.current
      if (!input || input.offsetParent === null) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, formOpen, importOpen])

  // Step 55-05：批次操作列從下方滑入
  const selectBarRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = selectBarRef.current
    if (!selectMode || !el || prefersReducedMotion() || typeof el.animate !== 'function') return
    el.animate(
      [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
      { duration: 300, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
  }, [selectMode])

  function toggleCat(cat: string) {
    if (cat === '全部') { setSelectedCats(new Set()); setSelectedSubTags([]); return }
    setSelectedCats(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
    setSelectedSubTags([])
  }

  function toggleStatus(s: string) {
    if (s === 'all') { setSelectedStatuses(new Set()); return }
    setSelectedStatuses(prev => {
      const next = new Set(prev)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return next
    })
  }

  // toggleDefaultGroup：Optimistic Update 操作預設組合書籤
  const toggleDefaultGroup = useCallback(async (card: EquipmentCard) => {
    const dg = groups.find(g => g.is_default)
    if (!dg) {
      // 若還沒有 defaultGroup，先從 API 取（會觸發懶遷移）
      const res = await fetch('/api/groups')
      if (res.ok) {
        const fresh = await res.json()
        setGroups(fresh)
      }
      return
    }

    const isBookmarked = dg.group_items.some(i => i.equipment_id === card.equipment_id)

    if (isBookmarked) {
      // Optimistic remove
      setGroups(prev => prev.map(g =>
        g.id === dg.id
          ? { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
          : g
      ))
      const res = await fetch(`/api/groups/${dg.id}/items/${card.equipment_id}`, { method: 'DELETE' })
      if (!res.ok) {
        // Rollback
        setGroups(prev => prev.map(g =>
          g.id === dg.id
            ? { ...g, group_items: [...g.group_items, { equipment_id: card.equipment_id, added_at: new Date().toISOString(), quantity: 1, sort_order: Math.max(0, ...dg.group_items.map(i => i.sort_order)) + 1000 }] }
            : g
        ))
      }
    } else {
      // Optimistic add
      const tempItem = { equipment_id: card.equipment_id, added_at: new Date().toISOString(), quantity: 1, sort_order: Math.max(0, ...dg.group_items.map(i => i.sort_order)) + 1000 }
      setGroups(prev => prev.map(g =>
        g.id === dg.id
          ? { ...g, group_items: [tempItem, ...g.group_items] }
          : g
      ))
      const res = await fetch(`/api/groups/${dg.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id }),
      })
      if (!res.ok) {
        // Rollback
        setGroups(prev => prev.map(g =>
          g.id === dg.id
            ? { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
            : g
        ))
      }
    }
  }, [groups])

  useEffect(() => {
    if (!addToGroupPopup) return
    const close = (e: MouseEvent) => {
      if (addToGroupPopupRef.current && !addToGroupPopupRef.current.contains(e.target as Node)) {
        setAddToGroupPopup(null)
      }
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [addToGroupPopup])

  const handleOpenAddToGroupPopup = useCallback((card: EquipmentCard, rect: DOMRect) => {
    setAddToGroupPopup(prev => {
      if (prev?.card.equipment_id === card.equipment_id) return null
      return { card, rect }
    })
    setPopupPendingIds(
      new Set(nonDefaultGroups
        .filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))
        .map(g => g.id))
    )
  }, [nonDefaultGroups])

  const handleConfirmAddToGroups = useCallback(async () => {
    if (!addToGroupPopup) return
    const { card } = addToGroupPopup
    const currentIds = new Set(
      nonDefaultGroups
        .filter(g => g.group_items.some(i => i.equipment_id === card.equipment_id))
        .map(g => g.id)
    )
    const toAdd = Array.from(popupPendingIds).filter(id => !currentIds.has(id))
    const toRemove = Array.from(currentIds).filter(id => !popupPendingIds.has(id))
    setAddToGroupPopup(null)
    if (toAdd.length === 0 && toRemove.length === 0) return
    const now = new Date().toISOString()
    setGroups(prev => prev.map(g => {
      if (toAdd.includes(g.id)) return { ...g, group_items: [{ equipment_id: card.equipment_id, added_at: now, quantity: 1, sort_order: Math.max(0, ...g.group_items.map(i => i.sort_order)) + 1000 }, ...g.group_items] }
      if (toRemove.includes(g.id)) return { ...g, group_items: g.group_items.filter(i => i.equipment_id !== card.equipment_id) }
      return g
    }))
    await Promise.allSettled([
      ...toAdd.map(id => fetch(`/api/groups/${id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id }),
      })),
      ...toRemove.map(id => fetch(`/api/groups/${id}/items/${card.equipment_id}`, { method: 'DELETE' })),
    ])
  }, [addToGroupPopup, nonDefaultGroups, popupPendingIds]) // eslint-disable-line react-hooks/exhaustive-deps

  const updateBookmarkNotes = useCallback((card: EquipmentCard, notes: string) => {
    setBookmarkNotes(prev => ({ ...prev, [card.equipment_id]: notes }))
    if (bookmarkSaveTimerRef.current[card.equipment_id]) {
      clearTimeout(bookmarkSaveTimerRef.current[card.equipment_id])
    }
    bookmarkSaveTimerRef.current[card.equipment_id] = setTimeout(async () => {
      await fetch('/api/bookmarks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment_id: card.equipment_id, notes }),
      })
    }, 800)
  }, [])

  const clearFilters = () => { setQuery(''); setSelectedCats(new Set()); setSelectedStatuses(new Set()); setSortBy('id'); setSortDir('asc'); setIsNewFilter(false); setNoPhotoFilter(false); setChanghuiFilter(false); setSelectedSubTags([]) }

  function openCreate() { setEditingCard(undefined); setFormMode('create'); setFormOpen(true) }
  function openEdit(card: EquipmentCard) { setEditingCard(card); setFormMode('edit'); setFormOpen(true) }

  const handleDelete = useCallback((card: EquipmentCard) => {
    askConfirm({
      title: `刪除「${card.name}」？`,
      message: '此操作無法還原，Cloudinary 照片也會一併刪除。',
      onConfirm: async () => {
        try {
          const res = await fetch(`/api/cards/${card.equipment_id}`, { method: 'DELETE' })
          if (!res.ok) { alert('刪除失敗，請重試'); return }
          router.refresh()
        } catch {
          alert('刪除失敗，請重試')
        }
      },
    })
  }, [router]) // eslint-disable-line react-hooks/exhaustive-deps

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) { next.delete(id) } else { next.add(id) }
      return next
    })
  }

  function toggleSelectAll() {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filtered.map(c => c.equipment_id)))
    }
  }

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  const handleBatchDelete = useCallback(() => {
    const count = selectedIds.size
    const names = filtered
      .filter(c => selectedIds.has(c.equipment_id))
      .map(c => `${c.equipment_id} ${c.name}`)
      .join('\n')
    askConfirm({
      title: `確定刪除 ${count} 筆料卡？`,
      message: '此操作無法還原。',
      detail: names,
      onConfirm: async () => {
        setBatchDeleting(true)
        try {
          const results = await Promise.allSettled(
            Array.from(selectedIds).map(id =>
              fetch(`/api/cards/${id}`, { method: 'DELETE' })
            )
          )
          const failed = results.filter(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)).length
          if (failed > 0) alert(`${count - failed} 筆刪除成功，${failed} 筆失敗`)
          exitSelectMode()
          router.refresh()
        } catch {
          alert('刪除失敗，請重試')
        } finally {
          setBatchDeleting(false)
        }
      },
    })
  }, [selectedIds, filtered, router]) // eslint-disable-line react-hooks/exhaustive-deps

  // 批次列印：依畫面目前篩選＋排序後的順序（filtered）輸出，每張 1 份
  function handleBatchPrint() {
    const list = filtered.filter(c => selectedIds.has(c.equipment_id))
    if (list.length === 0) return
    void printCards(list)
  }

  const categories = ['全部', ...settings.categories]
  const statusOptions = [
    { value: 'all', label: '全部狀態' },
    ...settings.statuses.map(s => ({ value: s, label: s })),
  ]

  // 孤兒分類：存在於料卡資料，但不在設定清單內
  const orphanCategories = useMemo(() => {
    const official = new Set(settings.categories)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.category && !official.has(c.category)) found.add(c.category)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.categories])

  // 孤兒狀態：存在於料卡資料，但不在設定清單內
  const orphanStatuses = useMemo(() => {
    const official = new Set(settings.statuses)
    const found = new Set<string>()
    for (const c of initialCards) {
      if (c.status && !official.has(c.status)) found.add(c.status)
    }
    return Array.from(found).sort()
  }, [initialCards, settings.statuses])

const mainPhotosCount = initialCards.filter(c => c.main_photo).length
  const detailPhotosCount = initialCards.reduce((sum, c) => sum + c.detail_photos.length, 0)

  return (
    <>
      {/* 單一凍結列：標題列 + 搜尋 + 篩選 */}
      <div ref={stickyHeaderRef} className="sticky top-0 z-40 bg-[#faf6f0] border-b border-[rgba(122,82,48,.18)] shadow-sm">
        {/* 標題列 */}
        <div className="max-w-7xl mx-auto px-4 pt-2 pb-2 flex items-center justify-between">
          <div className="flex items-baseline gap-2 min-w-0">
            <h1 className="text-xl font-bold text-[#7a5230] whitespace-nowrap">設備料卡管理系統</h1>
            <p className={`hidden ${headerCollapsed ? '' : 'sm:block'} text-xs text-[#a08060] whitespace-nowrap`}>共 {mainPhotosCount} 張主圖、{detailPhotosCount} 張細節</p>
          </div>
          <div className="flex items-center gap-3">
            {canManage ? (
              <button
                type="button"
                onClick={() => {
                  setActiveTab('admin')
                  adminSubTabRequestIdRef.current += 1
                  setAdminSubTabRequest({ tab: 'users', requestId: adminSubTabRequestIdRef.current })
                }}
                className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
              >
                <span className="badge-admin-pulse text-xs font-bold tracking-wider border border-[rgba(122,82,48,.35)] text-[#7a5230] bg-[rgba(122,82,48,.07)] px-2.5 py-0.5 rounded">
                  {userRole ?? '管理員'}
                </span>
                <Users className="h-4 w-4 text-[#a08060]" />
                <span className="hidden sm:inline text-xs text-[#a08060]">帳號管理</span>
              </button>
            ) : userRole ? (
              <span className={`text-xs font-medium border px-2.5 py-0.5 rounded ${
                isAdmin
                  ? 'badge-admin-pulse font-bold tracking-wider border-[rgba(122,82,48,.35)] text-[#7a5230] bg-[rgba(122,82,48,.07)]'
                  : 'border-[rgba(122,82,48,.2)] text-[#a08060] bg-[rgba(122,82,48,.04)]'
              }`}>
                {userRole}
              </span>
            ) : null}
            {userEmail && <UserMenu email={userEmail} />}
          </div>
        </div>
        <div className="max-w-7xl mx-auto px-4 pt-0 pb-2">
          {/* Tab 切換：手機版只顯示圖示＋數字，桌面版（sm 以上）顯示完整文字 */}
          <div ref={tabsRef} className="relative flex flex-wrap gap-1 mb-2">
            {tabPill && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-0 top-0 z-0 rounded-full bg-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.4)]"
                style={{
                  width: tabPill.w,
                  height: tabPill.h,
                  transform: `translate(${tabPill.x}px, ${tabPill.y}px)`,
                  transition: tabPillAnimate && !prefersReducedMotion()
                    ? 'transform .3s cubic-bezier(.2,.8,.2,1), width .3s cubic-bezier(.2,.8,.2,1), height .3s cubic-bezier(.2,.8,.2,1)'
                    : 'none',
                }}
              />
            )}
            <button
              onClick={() => setActiveTab('all')}
              title="全部料卡"
              data-tab="all"
              className={tabCls('all')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">全部料卡</span>
            </button>
            {(permissions.includes('view_quotes') || permissions.includes('edit_quotes')) && (
              <button
                onClick={() => { logUsageEvent('quotes_tab_switch'); setActiveTab('quotes') }}
                title="人為配件報價"
                data-tab="quotes"
              className={tabCls('quotes')}
              >
                <Receipt className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">人為配件報價</span>
              </button>
            )}
            {(permissions.includes('view_residual') || permissions.includes('edit_residual')) && (
              <button
                onClick={() => setActiveTab('residual')}
                title="設備殘值計算"
                data-tab="residual"
              className={tabCls('residual')}
              >
                <Calculator className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">設備殘值計算</span>
              </button>
            )}
            {(permissions.includes('view_standard_prices') || permissions.includes('edit_standard_prices')) && (
              <button
                onClick={() => setActiveTab('prices')}
                title="標準售價"
                data-tab="prices"
              className={tabCls('prices')}
              >
                <Tags className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">標準售價</span>
              </button>
            )}
            {permissions.includes('use_bookmarks') && (
              <button
                onClick={() => setActiveTab('bookmarks')}
                title="我的關注"
                data-tab="bookmarks"
              className={tabCls('bookmarks')}
              >
                <Star className={`h-3.5 w-3.5 ${activeTab === 'bookmarks' ? 'fill-white text-white' : bookmarkedIds.size > 0 ? 'fill-amber-400 text-amber-400' : ''}`} />
                <span className="hidden sm:inline">我的關注</span>
                {bookmarkedIds.size > 0 && (
                  <span className="text-xs">{bookmarkedIds.size}</span>
                )}
              </button>
            )}
            {permissions.includes('view_tracker') && (
              <button
                onClick={() => { logUsageEvent('tracker_tab_switch'); setActiveTab('tracker') }}
                title="任務板"
                data-tab="tracker"
              className={tabCls('tracker')}
              >
                <ClipboardList className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">任務板</span>
                {trackerPendingCount > 0 && (
                  <span className="text-xs">{trackerPendingCount}</span>
                )}
              </button>
            )}
            {permissions.includes('manage_documents') && (
              <button
                onClick={() => { logUsageEvent('documents_tab_switch'); setActiveTab('documents') }}
                title="文件管理"
                data-tab="documents"
              className={tabCls('documents')}
              >
                <FileText className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">文件管理</span>
                {documentsBusy && (
                  <span className="h-1.5 w-1.5 rounded-full bg-[#b5451b] animate-pulse" title="批次動作背景執行中" />
                )}
              </button>
            )}
            {(permissions.includes('view_own_packages') || permissions.includes('edit_own_packages')
              || permissions.includes('share_own_packages') || permissions.includes('view_shared_packages')) && (
              <button
                onClick={() => { logUsageEvent('packages_tab_switch'); setActiveTab('packages') }}
                title="設備組合"
                data-tab="packages"
              className={tabCls('packages')}
              >
                <Package className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">設備組合</span>
              </button>
            )}
            {(permissions.includes('view_inventory') || permissions.includes('view_erp_inventory')) && (
              <button
                onClick={() => setActiveTab('inventory')}
                title="庫存"
                data-tab="inventory"
              className={tabCls('inventory')}
              >
                <Warehouse className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">庫存</span>
              </button>
            )}
            {permissions.includes('manage_maintenance_info') && (
              <button
                onClick={() => { logUsageEvent('maintenance_tab_switch'); setActiveTab('maintenance') }}
                title="維修資訊"
                data-tab="maintenance"
              className={tabCls('maintenance')}
              >
                <Wrench className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">維修資訊</span>
              </button>
            )}
            {(permissions.includes('manage_users') || permissions.includes('manage_roles') || permissions.includes('view_analytics')) && (
              <button
                onClick={() => setActiveTab('admin')}
                title="系統管理"
                data-tab="admin"
              className={tabCls('admin')}
              >
                <Settings className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">系統管理</span>
              </button>
            )}
          </div>

          {/* 搜尋列 + 篩選列 */}
          <div className={activeTab === 'tracker' || activeTab === 'quotes' || activeTab === 'documents' || activeTab === 'packages' || activeTab === 'maintenance' || activeTab === 'admin' || activeTab === 'prices' || activeTab === 'residual' || activeTab === 'inventory' ? 'hidden' : ''}>
          <div className="flex gap-2 mb-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input ref={searchInputRef} className="pl-9 pr-9" placeholder="搜尋料號、品名、廠商、備註…（支援模糊比對）"
                enterKeyHint="search"
                value={query} onChange={e => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onKeyDown={e => {
                  // 注音等輸入法選字中（macOS Safari 的 isComposing 不可靠，另判斷 keyCode 229）不處理
                  if (e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return
                  if (e.key === 'Escape') {
                    if (query) { e.preventDefault(); setQuery('') }
                  } else if (e.key === 'Enter') {
                    e.currentTarget.blur()
                  }
                }} />
              {!query && !searchFocused && (
                <kbd
                  aria-hidden
                  className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 items-center justify-center h-5 min-w-[20px] px-1 rounded border border-[#e8ddd0] bg-white text-[11px] font-mono text-[#c0a890] pointer-events-none"
                  title="按 / 快速搜尋"
                >
                  /
                </kbd>
              )}
              {query && (
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  onClick={() => setQuery('')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1">
              {/* 手機篩選切換按鈕 */}
              <button
                onClick={() => {
                  if (headerCollapsed) {
                    // 收起狀態下按篩選：強制展開並顯示篩選列
                    forceExpandAtRef.current = window.scrollY
                    setHeaderCompact(false)
                    setShowFilters(true)
                  } else {
                    setShowFilters(v => !v)
                  }
                }}
                className={`flex items-center gap-1.5 h-9 px-2.5 border rounded-md bg-white transition-colors focus:outline-none ${
                  showFilters || hasActiveFilters
                    ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                    : 'border-[#e8ddd0] text-[#a08060] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                }`}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span className="text-sm">篩選</span>
                {activeFilterCount > 0 && (
                  <span className="bg-[#7a5230] text-white text-xs rounded-full px-1.5 leading-5 min-w-[20px] text-center">{activeFilterCount}</span>
                )}
              </button>
              {/* 自訂排序下拉 */}
              <div ref={sortRef} className="relative">
                <button
                  onClick={() => setSortOpen(v => !v)}
                  className={`flex items-center gap-2 pl-3 pr-2.5 py-2 border rounded-md text-sm bg-white text-[#6b4f38] cursor-pointer transition-colors focus:outline-none whitespace-nowrap ${
                    sortOpen
                      ? 'border-[#c49a72] text-[#7a5230] glow-wood'
                      : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230]'
                  }`}
                >
                  {SORT_OPTIONS.find(o => o.value === sortBy)?.label}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-150 ${sortOpen ? 'rotate-180' : ''}`} />
                </button>
                {sortOpen && (
                  <div className="absolute top-full mt-1 left-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-[8px] shadow-md overflow-hidden z-50 min-w-full">
                    {SORT_OPTIONS.map(o => (
                      <button key={o.value}
                        onClick={() => { setSortBy(o.value); setSortOpen(false) }}
                        className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                          sortBy === o.value
                            ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                            : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
                        }`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}
                title={sortDir === 'asc' ? '升冪（點擊切換降冪）' : '降冪（點擊切換升冪）'}
                className="flex items-center justify-center w-9 h-9 border border-[#e8ddd0] rounded-md bg-white text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] transition-colors focus:outline-none"
              >
                {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* 手機版：收合時顯示已選條件 chips */}
          {!showFilters && hasActiveFilters && !headerCollapsed && (
            <div ref={collapsibleChipsRef} className="flex flex-wrap gap-1.5 pb-1">
              {Array.from(selectedCats).map(cat => (
                <button key={cat} onClick={() => toggleCat(cat)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[#c8b89a]">
                  {cat}<X className="h-3 w-3" />
                </button>
              ))}
              {Array.from(selectedStatuses).map(s => (
                <button key={s} onClick={() => toggleStatus(s)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[#c8b89a]">
                  {s}<X className="h-3 w-3" />
                </button>
              ))}
              {selectedSubTags.map(tag => (
                <button key={tag}
                  onClick={() => setSelectedSubTags(prev => prev.filter(t => t !== tag))}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[#c8b89a]">
                  {tag}<X className="h-3 w-3" />
                </button>
              ))}
              {isNewFilter && (
                <button onClick={() => setIsNewFilter(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-[rgba(181,69,27,.1)] text-[#b5451b] border border-[rgba(181,69,27,.35)]">
                  NEW<X className="h-3 w-3" />
                </button>
              )}
              {noPhotoFilter && (
                <button onClick={() => setNoPhotoFilter(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[#c8b89a]">
                  無主圖<X className="h-3 w-3" />
                </button>
              )}
              {changhuiFilter && (
                <button onClick={() => setChanghuiFilter(false)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[#c8b89a]">
                  長輝<X className="h-3 w-3" />
                </button>
              )}
              <button onClick={clearFilters}
                className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs text-[#a08060] border border-[#e8ddd0] hover:text-[#7a5230]">
                <X className="h-3 w-3" />清除篩選
              </button>
            </div>
          )}

          {/* 篩選列：桌面永遠顯示，手機按按鈕展開 */}
          <div ref={collapsibleFiltersRef} className={`${showFilters && !headerCollapsed ? 'block' : 'hidden'} pb-1`}>
            {/* 類別 */}
            <div className="flex flex-wrap gap-2 items-center mb-2">
              <span className="block md:hidden text-xs font-medium text-[#a08060] mr-1">類別</span>
              {categories.map(cat => {
                const isActive = cat === '全部' ? selectedCats.size === 0 : selectedCats.has(cat)
                return (
                  <button key={cat} onClick={() => toggleCat(cat)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                      isActive
                        ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                        : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                    }`}>
                    {cat}
                  </button>
                )
              })}
              {orphanCategories.map(cat => {
                const isActive = selectedCats.has(cat)
                const count = initialCards.filter(c => c.category === cat).length
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCat(cat)}
                    title={`此分類已從清單移除，仍有 ${count} 張料卡使用此值`}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                      isActive
                        ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                        : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                    }`}
                  >
                    <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                    {cat}
                    <span className="opacity-70">({count})</span>
                  </button>
                )
              })}
              <button onClick={() => setChanghuiFilter(v => !v)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                  changhuiFilter
                    ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                    : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                }`}>
                長輝
              </button>
            </div>
            {/* 次級篩選：緊接在類別下方 */}
            {selectedCats.size === 1 &&
              (localSubfilterConfig[Array.from(selectedCats)[0]]?.length > 0 ||
                permissions.includes('manage_subfilter_tags')) && (
              <div className="mb-2">
                <SubfilterTagBar
                  category={Array.from(selectedCats)[0]}
                  tags={localSubfilterConfig[Array.from(selectedCats)[0]] ?? []}
                  selectedTags={selectedSubTags}
                  onTagToggle={(tag) => setSelectedSubTags(prev =>
                    prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
                  )}
                  canManage={permissions.includes('manage_subfilter_tags')}
                  onTagsUpdated={(cat, newTags) => {
                    setLocalSubfilterConfig(prev => ({ ...prev, [cat]: newTags }))
                  }}
                />
              </div>
            )}
            {/* 狀態 + 其他篩選 */}
            <div className="flex flex-wrap gap-2 items-center">
              <span className="block md:hidden text-xs font-medium text-[#a08060] mr-1">狀態</span>
              {permissions.includes('filter_all_statuses') && (
                <>
                  {statusOptions.map(opt => {
                    const isActive = opt.value === 'all' ? selectedStatuses.size === 0 : selectedStatuses.has(opt.value)
                    return (
                      <button key={opt.value} onClick={() => toggleStatus(opt.value)}
                        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                          isActive
                            ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                            : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                        }`}>
                        {opt.label}
                      </button>
                    )
                  })}
                </>
              )}
              {orphanStatuses.length > 0 && (
                <>
                  <span className="hidden md:inline-block w-px h-5 bg-[rgba(122,82,48,.2)] mx-1" />
                  {orphanStatuses.map(s => {
                    const isActive = selectedStatuses.has(s)
                    const count = initialCards.filter(c => c.status === s).length
                    return (
                      <button
                        key={s}
                        onClick={() => toggleStatus(s)}
                        title={`此狀態已從清單移除，仍有 ${count} 張料卡使用此值`}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium border border-dashed transition-all duration-200 ${
                          isActive
                            ? 'bg-[rgba(122,82,48,.1)] text-[#7a5230] border-[#c49a72]'
                            : 'bg-transparent text-[#a08060] border-[rgba(122,82,48,.3)] hover:border-[rgba(122,82,48,.5)] hover:text-[#7a5230]'
                        }`}
                      >
                        <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                        {s}
                        <span className="opacity-70">({count})</span>
                      </button>
                    )
                  })}
                </>
              )}
              <span className="hidden md:inline-block w-px h-5 bg-[#e8ddd0] mx-1" />
              <button onClick={() => setIsNewFilter(v => !v)}
                className={`badge-new-pulse px-3 py-1.5 rounded-full text-sm font-bold tracking-widest border transition-all duration-200 ${
                  isNewFilter
                    ? 'bg-[#b5451b] text-white border-[#b5451b] shadow-[0_0_10px_rgba(181,69,27,.5),0_0_20px_rgba(181,69,27,.18)]'
                    : 'bg-white text-[#b5451b] border-[rgba(181,69,27,.35)] hover:border-[#b5451b] hover:shadow-[0_0_8px_rgba(181,69,27,.3)]'
                }`}>
                NEW
              </button>
              {permissions.includes('filter_no_photo') && (
                <button
                  onClick={() => setNoPhotoFilter(v => !v)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${
                    noPhotoFilter
                      ? 'bg-[#7a5230] text-white border-[#7a5230] shadow-[0_0_10px_rgba(122,82,48,.5),0_0_20px_rgba(122,82,48,.18)]'
                      : 'bg-white text-[#6b4f38] border-[#e8ddd0] hover:border-[rgba(122,82,48,.4)] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.28)]'
                  }`}
                >
                  無主圖
                </button>
              )}
              {hasActiveFilters && (
                <button onClick={clearFilters}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm text-[#a08060] border border-[#e8ddd0] hover:border-[rgba(122,82,48,.3)] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.18)] transition-all duration-200">
                  <X className="h-3 w-3" />
                  清除篩選
                </button>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>

      {/* 主內容區：兩個 view 皆常駐 DOM，以 hidden 切換，避免重複 mount 的延遲 */}

      {/* 全部料卡網格 */}
      <div className={activeTab !== 'all' ? 'hidden' : ''}>
        <div className="max-w-7xl mx-auto px-4 pt-4 pb-6">
          {/* 結果數量＋網格／清單切換（Step 55-S01：走模糊備援時改為虛線框明講） */}
          <div className="flex items-start justify-between gap-3 mb-4">
            {usedFuzzyFallback && filtered.length > 0 ? (
              <p className="text-sm text-[#7a5230] border border-dashed border-[#c49a72] bg-[rgba(196,154,114,.08)] rounded-lg px-3 py-1.5">
                沒有完全符合「{query.trim()}」的料卡，以下是相近的 {filtered.length} 筆
              </p>
            ) : (
              <p className="text-sm text-[#a08060] py-0.5">
                顯示 {filtered.length} / {initialCards.length} 筆
                {query && <span className="ml-1.5 text-[#7a5230]">— 搜尋「{query}」</span>}
              </p>
            )}
            <div className="flex flex-shrink-0 border border-[rgba(122,82,48,.25)] rounded-lg overflow-hidden text-xs bg-white">
              <button
                type="button"
                onClick={() => setDisplay('grid')}
                title="網格模式"
                aria-pressed={display === 'grid'}
                className={`p-1.5 transition-colors ${display === 'grid' ? 'bg-[#7a5230] text-white' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)]'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setDisplay('list')}
                title="清單模式"
                aria-pressed={display === 'list'}
                className={`p-1.5 transition-colors ${display === 'list' ? 'bg-[#7a5230] text-white' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)]'}`}
              >
                <ListIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 網格／清單 */}
          {filtered.length === 0 ? (
            broaderMatch ? (
              /* Step 55-S02：目前篩選條件下找不到，但不限篩選有結果 */
              <div className="text-center py-16 px-2">
                <p className="text-base text-[#6b4f38]">目前篩選條件下找不到「{query.trim()}」</p>
                <p className="text-sm text-[#a08060] mt-1.5">
                  不限篩選有 {broaderMatch.total} 筆：
                  {broaderMatch.parts.slice(0, 5).map(([cat, n]) => `${cat} ${n}`).join('、')}
                  {broaderMatch.parts.length > 5 ? ' 等' : ''}
                </p>
                <button
                  onClick={clearFiltersKeepQuery}
                  className="mt-4 px-4 py-1.5 rounded-full text-sm font-medium bg-[#7a5230] text-white hover:bg-[#9c6b42] shadow-[0_0_10px_rgba(122,82,48,.35)] transition-colors"
                >
                  保留搜尋字，清除其他篩選
                </button>
              </div>
            ) : (
              <div className="text-center py-20 text-gray-400">
                <p className="text-lg">找不到符合的料卡</p>
                <p className="text-sm mt-1">試著更換關鍵字或篩選條件</p>
                {hasActiveFilters && (
                  <button onClick={clearFilters} className="mt-3 text-[#7a5230] text-sm underline hover:text-[#9c6b42]">
                    清除所有篩選
                  </button>
                )}
              </div>
            )
          ) : display === 'list' ? (
            <div ref={gridRef} className="flex flex-col gap-1.5">
              {filtered.map(card => (
                <div key={card.equipment_id} data-flip-key={card.equipment_id}>
                  <EquipmentCardRow
                    card={card}
                    onClick={() => setSelected(card)}
                    isAdmin={isAdmin}
                    onEdit={() => openEdit(card)}
                    onDelete={() => handleDelete(card)}
                    activeStatus={activeStatus}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(card.equipment_id)}
                    onSelect={() => toggleSelect(card.equipment_id)}
                    isNew={card.is_new}
                    isBookmarked={bookmarkedIds.has(card.equipment_id)}
                    onToggleBookmark={canUseBookmarks ? () => toggleDefaultGroup(card) : undefined}
                    onAddToGroup={canUseBookmarks && nonDefaultGroups.length > 0 ? (rect) => handleOpenAddToGroupPopup(card, rect) : undefined}
                    showVendor={permissions.includes('read_vendor')}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div ref={gridRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {filtered.map(card => (
                /* 包一層給 FLIP 動畫定位用；[&>div]:h-full 讓卡片維持跟原本一樣撐滿整列高度 */
                <div key={card.equipment_id} data-flip-key={card.equipment_id} className="[&>div]:h-full">
                  <EquipmentCardItem
                    card={card}
                    onClick={() => setSelected(card)}
                    isAdmin={isAdmin}
                    onEdit={() => openEdit(card)}
                    onDelete={() => handleDelete(card)}
                    activeStatus={activeStatus}
                    selectMode={selectMode}
                    isSelected={selectedIds.has(card.equipment_id)}
                    onSelect={() => toggleSelect(card.equipment_id)}
                    isNew={card.is_new}
                    isBookmarked={bookmarkedIds.has(card.equipment_id)}
                    onToggleBookmark={canUseBookmarks ? () => toggleDefaultGroup(card) : undefined}
                    onAddToGroup={canUseBookmarks && nonDefaultGroups.length > 0 ? (rect) => handleOpenAddToGroupPopup(card, rect) : undefined}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 我的關注：首次切入才 mount，之後 CSS hide/show 不 unmount */}
      {groupsMounted && (
        <div className={activeTab !== 'bookmarks' ? 'hidden' : ''}>
          <GroupsPanel
            initialGroups={groups}
            allCards={initialCards}
            onCardClick={(card) => setSelected(card)}
            onGroupsChange={setGroups}
            activeStatus={activeStatus}
            onDelete={handleDelete}
            filteredCards={filtered}
            bookmarkedIds={bookmarkedIds}
            onToggleBookmark={toggleDefaultGroup}
            canManagePackages={permissions.includes('edit_own_packages')}
            stickyTop={stickyHeaderHeight}
          />
        </div>
      )}

      {/* 任務板：首次進入後保持常駐（CSS hide/show），避免切 tab 時 state 重置 */}
      {trackerMounted && trackerData && (
        <div className={activeTab !== 'tracker' ? 'hidden' : ''}>
          <TrackerClient
            initialIssues={trackerData.initialIssues}
            permissions={permissions}
            userEmail={userEmail}
            allowedEmails={trackerData.allowedEmails}
            issueTypes={trackerData.issueTypes}
            issueTags={trackerData.issueTags}
            onMyTasksCountChange={setTrackerPendingCount}
            userDepartmentId={trackerData.userDepartmentId ?? null}
            isActive={act('tracker')}
          />
        </div>
      )}

      {/* 人為配件報價：首次進入後保持常駐（CSS hide/show） */}
      {quotesMounted && (
        <div className={activeTab !== 'quotes' ? 'hidden' : ''}>
          <QuotesClient
            initialItems={quoteItems}
            categories={settings.quoteCategories}
            permissions={permissions}
          />
        </div>
      )}

      {/* 標準售價（Step 47 改為 HTML 價目表）：首次進入後保持常駐（CSS hide/show），view/edit_standard_prices 可看，edit_standard_prices 可上傳/刪除版本 */}
      {pricesMounted && (
        <div className={activeTab !== 'prices' ? 'hidden' : ''}>
          <StandardPriceSheetClient canEdit={permissions.includes('edit_standard_prices')} />
        </div>
      )}

      {/* 庫存（Step 54）：首次進入後保持常駐（CSS hide/show）；view_inventory 可看 */}
      {inventoryMounted && (
        <div className={activeTab !== 'inventory' ? 'hidden' : ''}>
          <InventoryHub canCrm={permissions.includes('view_inventory')} canErp={permissions.includes('view_erp_inventory')} />
        </div>
      )}

      {/* 文件管理：首次進入後保持常駐（CSS hide/show），批次動作不受切換分頁影響 */}
      {documentsMounted && (
        <div className={activeTab !== 'documents' ? 'hidden' : ''}>
          <DocumentsClient
            allCards={initialCards}
            documentTypes={settings.documentTypes}
            onBusyChange={setDocumentsBusy}
            stickyTop={stickyHeaderHeight}
          />
        </div>
      )}

      {/* 設備組合：首次進入後保持常駐（CSS hide/show），資料由 page.tsx 一次 fetch 好往下傳 */}
      {packagesMounted && packagesData && (
        <div className={activeTab !== 'packages' ? 'hidden' : ''}>
          <PackagesClient
            initialOwnPackages={packagesData.ownPackages}
            initialSharedPackages={packagesData.sharedPackages}
            departments={packagesData.departments}
            allCards={initialCards}
            permissions={permissions}
            userDepartmentId={packagesData.userDepartmentId}
            sourceGroupUpdatedAt={packagesData.sourceGroupUpdatedAt}
            isActive={act('packages')}
            stickyTop={stickyHeaderHeight}
            onCardClick={(card) => setSelected(card)}
          />
        </div>
      )}

      {/* 維修資訊：首次進入後保持常駐（CSS hide/show） */}
      {maintenanceMounted && (
        <div className={activeTab !== 'maintenance' ? 'hidden' : ''}>
          <MaintenanceInfoClient
            isActive={act('maintenance')}
            filter={maintenanceFilter}
            permissions={permissions}
            allCards={initialCards}
          />
        </div>
      )}

      {/* 設備殘值計算：首次進入後保持常駐（CSS hide/show）；view/edit_residual 可看，edit_residual 可管理品項 */}
      {residualMounted && (
        <div className={activeTab !== 'residual' ? 'hidden' : ''}>
          <ResidualClient isActive={act('residual')} canEdit={permissions.includes('edit_residual')} />
        </div>
      )}

      {/* 系統管理：首次進入後保持常駐（CSS hide/show），資料由各 Panel 自行 client fetch */}
      {adminMounted && (
        <div className={activeTab !== 'admin' ? 'hidden' : ''}>
          <SystemAdminClient
            isActive={act('admin')}
            permissions={permissions}
            subTabRequest={adminSubTabRequest}
          />
        </div>
      )}

      {/* 細節 Dialog（在兩個 view 都可開啟） */}
      {selected && (
        <CardDetailDialog
          card={selected}
          open={!!selected}
          onClose={() => setSelected(null)}
          activeStatus={activeStatus}
          isAdmin={isAdmin}
          // 我的關注／設備組合開啟的細節頁純檢視，不提供編輯入口，只有全部料卡 tab 才能編輯
          onEdit={(canEditCard && activeTab === 'all') ? () => { openEdit(selected); setSelected(null) } : undefined}
          permissions={permissions}
          bookmarkNotes={activeTab === 'bookmarks' ? (bookmarkNotes[selected.equipment_id] ?? '') : undefined}
          onBookmarkNotesChange={activeTab === 'bookmarks' ? (notes) => updateBookmarkNotes(selected, notes) : undefined}
          onViewMaintenanceInfo={permissions.includes('manage_maintenance_info') ? (equipmentId) => {
            setActiveTab('maintenance')
            setMaintenanceFilter({ equipmentId })
            setSelected(null)
          } : undefined}
          onPrint={canPrint ? () => { void printCards([selected]) } : undefined}
          onPrintBoxLabel={canPrint ? () => setBoxLabelSingle(selected) : undefined}
        />
      )}
      {canPrint && boxLabelSingle && (
        <BoxLabelDialog
          open
          cards={[boxLabelSingle]}
          onClose={() => setBoxLabelSingle(null)}
        />
      )}

      {/* 管理員浮動按鈕區（僅全部料卡 tab 顯示，我的關注與任務板不適用） */}
      {(isAdmin || canPrint) && activeTab === 'all' && (
        <>
          {canPrint && (
            <BoxLabelDialog
              open={boxLabelOpen}
              cards={filtered.filter(c => selectedIds.has(c.equipment_id))}
              onClose={() => setBoxLabelOpen(false)}
            />
          )}
          {/* 批次選取 action bar：全寬固定底部 */}
          {selectMode && (
            <div ref={selectBarRef} className="fixed bottom-0 left-0 right-0 z-50 bg-[#faf6f0] border-t border-[rgba(122,82,48,.2)] shadow-[0_-4px_16px_rgba(122,82,48,.1)] px-4 py-3 flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-1.5 text-sm text-[#6b4f38] hover:text-[#7a5230] transition-colors whitespace-nowrap shrink-0"
              >
                {selectedIds.size === filtered.length
                  ? <CheckSquare className="h-4 w-4 text-[#7a5230]" />
                  : <CheckSquare className="h-4 w-4 opacity-50" />
                }
                <span className="hidden sm:inline">{selectedIds.size === filtered.length ? '取消全選' : '全選'}</span>
              </button>
              <span className="flex-1 text-sm font-semibold text-[#7a5230] text-center">
                已選 <RollingNumber value={selectedIds.size} /> 張
              </span>
              <button
                onClick={exitSelectMode}
                className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.25)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors shrink-0"
              >
                取消
              </button>
              {canPrint && (
                <button
                  onClick={handleBatchPrint}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#7a5230] hover:bg-[#9c6b42] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
                >
                  <Printer className="h-4 w-4" />
                  列印（{selectedIds.size}）
                </button>
              )}
              {canPrint && (
                <button
                  onClick={() => setBoxLabelOpen(true)}
                  disabled={selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#7a5230] hover:bg-[#9c6b42] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
                >
                  <Package className="h-4 w-4" />
                  封箱標籤（{selectedIds.size}）
                </button>
              )}
              {isAdmin && (
                <button
                  onClick={handleBatchDelete}
                  disabled={batchDeleting || selectedIds.size === 0}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-[#b5451b] hover:bg-[#9a3a16] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors shrink-0 whitespace-nowrap"
                >
                  {batchDeleting
                    ? <Loader2 className="h-4 w-4 animate-spin" />
                    : <Trash2 className="h-4 w-4" />
                  }
                  刪除（{selectedIds.size}）
                </button>
              )}
            </div>
          )}

          {/* 批次選取 + 批次匯入 + 匯出 CSV + 新增料卡（僅限有 CRUD 權限者）：收合成 speed dial，
              收合時只有一顆圓形按鈕，展開才往上彈出 4 個操作項目 */}
          {((isAdmin && canEditCard) || canPrint) && (
            <div ref={fabRef} className={`fixed ${selectMode ? 'bottom-20' : 'bottom-6'} right-4 sm:right-6 z-40 transition-all duration-200`}>
              {fabOpen && (
                <div className="absolute bottom-full right-0 mb-3 flex flex-col items-end gap-2">
                  {isAdmin && canEditCard && (<>
                  <button onClick={() => { setFabOpen(false); window.location.href = '/api/cards/export' }}
                    title="匯出 CSV"
                    className="flex items-center gap-2 bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] font-medium px-4 py-3 rounded-full shadow-lg transition-all duration-200 focus:outline-none hover:shadow-[0_0_10px_rgba(122,82,48,.3)] whitespace-nowrap">
                    <FileDown className="h-5 w-5" />
                    <span>匯出 CSV</span>
                  </button>
                  <button onClick={() => { setFabOpen(false); setImportOpen(true) }}
                    title="批次匯入"
                    className="flex items-center gap-2 bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] font-medium px-4 py-3 rounded-full shadow-lg transition-all duration-200 focus:outline-none hover:shadow-[0_0_10px_rgba(122,82,48,.3)] whitespace-nowrap">
                    <FileUp className="h-5 w-5" />
                    <span>批次匯入</span>
                  </button>
                  </>)}
                  <button
                    onClick={() => { setFabOpen(false); if (selectMode) { exitSelectMode() } else { setSelectMode(true) } }}
                    title={selectMode ? '取消選取' : '批次選取'}
                    className={`flex items-center gap-2 font-medium px-4 py-3 rounded-full shadow-lg transition-all duration-200 focus:outline-none whitespace-nowrap ${
                      selectMode
                        ? 'bg-[#7a5230] hover:bg-[#9c6b42] text-white shadow-[0_0_10px_rgba(122,82,48,.45)]'
                        : 'bg-white hover:bg-[#faf6f0] text-[#7a5230] border border-[rgba(122,82,48,.32)] hover:shadow-[0_0_10px_rgba(122,82,48,.3)]'
                    }`}
                  >
                    <CheckSquare className="h-5 w-5" />
                    <span>{selectMode ? '取消選取' : '批次選取'}</span>
                  </button>
                  {isAdmin && canEditCard && (
                  <button onClick={() => { setFabOpen(false); openCreate() }}
                    title="新增料卡"
                    className="flex items-center gap-2 bg-[#7a5230] hover:bg-[#9c6b42] text-white font-medium px-4 py-3 rounded-full shadow-lg transition-all duration-200 focus:outline-none shadow-[0_0_10px_rgba(122,82,48,.45)] hover:shadow-[0_0_16px_rgba(122,82,48,.6)] whitespace-nowrap">
                    <Plus className="h-5 w-5" />
                    <span>新增料卡</span>
                  </button>
                  )}
                </div>
              )}
              <button
                onClick={() => setFabOpen(prev => !prev)}
                title={fabOpen ? '收合操作選單' : '更多操作'}
                aria-label={fabOpen ? '收合操作選單' : '更多操作'}
                aria-expanded={fabOpen}
                className="flex items-center justify-center h-14 w-14 rounded-full bg-[#7a5230] hover:bg-[#9c6b42] text-white shadow-lg shadow-[0_0_10px_rgba(122,82,48,.45)] hover:shadow-[0_0_16px_rgba(122,82,48,.6)] transition-all duration-200 focus:outline-none"
              >
                <Plus className={`h-6 w-6 transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`} />
              </button>
            </div>
          )}

          {isAdmin && (
            <>
              <CardFormDialog
                mode={formMode}
                card={editingCard}
                open={formOpen}
                onClose={() => setFormOpen(false)}
                settings={settings}
                permissions={permissions}
              />
              <BatchImportDialog
                open={importOpen}
                onClose={() => setImportOpen(false)}
                settings={settings}
              />
            </>
          )}
        </>
      )}

      {/* Step 55-10：回到頂端（只在全部料卡；FAB 存在時放在 FAB 左邊，選取模式時跟著上移避開操作列） */}
      {activeTab === 'all' && (() => {
        const hasFab = (isAdmin && canEditCard) || canPrint
        const pos = hasFab
          ? `${selectMode ? 'bottom-[5.375rem]' : 'bottom-[1.875rem]'} right-[5.5rem] sm:right-[6.5rem]`
          : 'bottom-6 right-4 sm:right-6'
        return (
          <button
            type="button"
            onClick={scrollToTop}
            title="回到頂端"
            aria-label="回到頂端"
            aria-hidden={!showBackToTop}
            tabIndex={showBackToTop ? 0 : -1}
            className={`fixed ${pos} z-40 flex items-center justify-center h-11 w-11 rounded-full bg-white text-[#7a5230] border border-[rgba(122,82,48,.32)] shadow-lg hover:shadow-[0_0_10px_rgba(122,82,48,.3)] transition-all duration-200 motion-reduce:transition-none focus:outline-none ${
              showBackToTop ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'
            }`}
          >
            <ArrowUp className="h-5 w-5" />
          </button>
        )
      })()}

      {/* 加入組合 popup（fixed，定位在按鈕上方） */}
      {addToGroupPopup && (
        <div
          ref={addToGroupPopupRef}
          style={{
            position: 'fixed',
            top: addToGroupPopup.rect.top - 6,
            left: addToGroupPopup.rect.left,
            zIndex: 9999,
            transform: 'translateY(-100%)',
          }}
          className="bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-xl shadow-xl overflow-hidden min-w-[11rem] max-w-[15rem]"
        >
          <div className="px-3 py-2 border-b border-[rgba(122,82,48,.08)]">
            <p className="text-[10px] font-semibold text-[#a08060] uppercase tracking-wider">加入組合</p>
          </div>
          {nonDefaultGroups.length === 0 ? (
            <p className="px-3 py-3 text-xs text-[#a08060]">尚無組合，請至「我的關注」建立</p>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto">
                {nonDefaultGroups.map(group => {
                  const isPending = popupPendingIds.has(group.id)
                  return (
                    <button
                      key={group.id}
                      onClick={() => setPopupPendingIds(prev => {
                        const next = new Set(prev)
                        if (next.has(group.id)) next.delete(group.id); else next.add(group.id)
                        return next
                      })}
                      className="w-full text-left px-3 py-2 flex items-center gap-2 transition-colors hover:bg-[rgba(122,82,48,.06)]"
                    >
                      <span className={`flex-shrink-0 w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors ${
                        isPending ? 'bg-[#7a5230] border-[#7a5230]' : 'border-[#d0b898]'
                      }`}>
                        {isPending && <Check className="h-2.5 w-2.5 text-white" />}
                      </span>
                      <Folder className="h-3.5 w-3.5 flex-shrink-0 text-[#c49a72]" />
                      <span className="flex-1 truncate text-xs text-[#4a3422]">{group.name}</span>
                    </button>
                  )
                })}
              </div>
              <div className="px-3 py-2 border-t border-[rgba(122,82,48,.08)] flex gap-2 justify-end">
                <button
                  onClick={() => setAddToGroupPopup(null)}
                  className="px-2.5 py-1 text-xs text-[#a08060] hover:text-[#7a5230] transition-colors"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirmAddToGroups}
                  className="px-2.5 py-1 text-xs bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors"
                >
                  確定
                </button>
              </div>
            </>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title={confirmConfig.title}
        message={confirmConfig.message}
        detail={confirmConfig.detail}
        confirmLabel="刪除"
        danger
        onConfirm={() => { setConfirmOpen(false); confirmConfig.onConfirm() }}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  )
}
