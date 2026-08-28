'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown, Settings } from 'lucide-react'
import type { UsageAnalyticsRow } from '@/lib/analytics'

interface Props {
  initialData: UsageAnalyticsRow[]
}

// 秒數格式化成「X 小時 Y 分」或「X 分鐘」，避免顯示原始秒數
function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60)
  if (totalMinutes < 1) return '不到 1 分鐘'
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} 分鐘`
  if (minutes === 0) return `${hours} 小時`
  return `${hours} 小時 ${minutes} 分`
}

// Step 43：新增 7 個可選欄位（預設全部不顯示，透過「欄位設定」勾選），對應各分頁切換/瀏覽事件的
// eventCounts key。跟既有 card_search/card_detail_view 一樣直接讀 row.eventCounts[key]，
// 顯示與否是全域設定（存在後端，所有管理員共用），不是 localStorage 個人偏好。
const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: 'tracker_tab_switch',     label: '任務板切換次數' },
  { key: 'issue_detail_open',      label: '任務卡議題打開次數' },
  { key: 'quotes_tab_switch',      label: '人為配件報價切換次數' },
  { key: 'documents_tab_switch',   label: '文件管理切換次數' },
  { key: 'packages_tab_switch',    label: '設備組合切換次數' },
  { key: 'package_expand',         label: '設備組合瀏覽次數' },
  { key: 'maintenance_tab_switch', label: '維修資訊切換次數' },
]

type SortKey = 'email' | 'loginCount' | 'totalDurationSeconds' | 'averageDurationSeconds' | string

// 各欄位取值（數字欄位皆回傳 number，email 回字串），供排序共用。
// 固定欄位（登入次數/停留時長）走明確 case，其餘（含既有 card_search/card_detail_view
// 與新增的 7 個可選欄位）一律直接查 eventCounts，不需要逐一列 case。
function sortValue(row: UsageAnalyticsRow, key: SortKey): string | number {
  switch (key) {
    case 'email': return row.email
    case 'loginCount': return row.loginCount
    case 'totalDurationSeconds': return row.totalDurationSeconds
    case 'averageDurationSeconds': return row.averageDurationSeconds
    default: return row.eventCounts[key] ?? 0
  }
}

export default function AnalyticsClient({ initialData }: Props) {
  // 前端排序：預設維持後端排序（總停留時長 desc），點欄位才切換
  const [sort, setSort] = useState<{ key: SortKey | null; dir: 'asc' | 'desc' }>({ key: null, dir: 'asc' })

  // ── 欄位顯示設定：全域設定（GET/PATCH /api/admin/analytics/columns），所有管理員共用 ──
  // 改成批次勾選＋按「套用」才一次送出（原本勾一個就立刻存檔+套用一個，使用者反映每勾一次
  // 都觸發重新整理很不順手）。draftColumns 只在開啟設定面板時同步一次，勾選期間都是本地
  // state，關閉面板（不論按套用或點外部）才決定要不要真的送出。
  const [visibleColumns, setVisibleColumns] = useState<string[]>([])
  const [draftColumns, setDraftColumns] = useState<string[]>([])
  const [columnSettingsOpen, setColumnSettingsOpen] = useState(false)
  const [savingColumns, setSavingColumns] = useState(false)
  const settingsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/admin/analytics/columns')
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setVisibleColumns(data.columns ?? [])
      } catch {
        // 靜默失敗：欄位設定只是加值功能，失敗就維持全部不顯示
      }
    })()
    return () => { cancelled = true }
  }, [])

  function openColumnSettings() {
    setDraftColumns(visibleColumns)
    setColumnSettingsOpen(true)
  }

  useEffect(() => {
    if (!columnSettingsOpen) return
    // 點外部＝取消，不套用這次勾選的變更（跟按「取消」等效）
    const close = (e: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(e.target as Node)) setColumnSettingsOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [columnSettingsOpen])

  function toggleDraftColumn(key: string) {
    setDraftColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key])
  }

  async function applyColumnSettings() {
    setSavingColumns(true)
    try {
      const res = await fetch('/api/admin/analytics/columns', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: draftColumns }),
      })
      if (!res.ok) throw new Error('儲存失敗')
      setVisibleColumns(draftColumns)
      setColumnSettingsOpen(false)
    } catch {
      // 失敗維持面板開啟＋現有勾選，讓使用者可以重試
    } finally {
      setSavingColumns(false)
    }
  }

  const activeOptionalColumns = useMemo(
    () => OPTIONAL_COLUMNS.filter(c => visibleColumns.includes(c.key)),
    [visibleColumns],
  )

  function handleSort(key: SortKey) {
    setSort(prev => prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }

  const sortedData = useMemo(() => {
    if (!sort.key) return initialData
    const dir = sort.dir === 'asc' ? 1 : -1
    const key = sort.key
    return [...initialData].sort((a, b) => {
      const av = sortValue(a, key)
      const bv = sortValue(b, key)
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv, 'zh-Hant') * dir
      return ((av as number) - (bv as number)) * dir
    })
  }, [initialData, sort])

  function SortableHeader({ label, column, className }: { label: string; column: SortKey; className?: string }) {
    return (
      <th className={`text-left px-4 py-3 font-medium text-[#6b4f38] whitespace-nowrap ${className ?? ''}`}>
        <button type="button" onClick={() => handleSort(column)} className="flex items-center gap-1 hover:text-[#7a5230] transition-colors">
          {label}
          {sort.key !== column
            ? <ChevronsUpDown className="h-3 w-3 opacity-40" />
            : sort.dir === 'asc' ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
      </th>
    )
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="text-sm text-[#a08060]">
          共 {initialData.length} 位使用者
        </div>
        <div ref={settingsRef} className="relative">
          <button
            type="button"
            onClick={() => columnSettingsOpen ? setColumnSettingsOpen(false) : openColumnSettings()}
            title="欄位設定"
            className="flex items-center gap-1 p-1.5 rounded-lg text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
          {columnSettingsOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden z-20">
              <p className="px-3 py-2 text-[10px] font-semibold text-[#a08060] border-b border-[rgba(122,82,48,.1)]">
                顯示欄位
              </p>
              <div className="max-h-64 overflow-y-auto">
                {OPTIONAL_COLUMNS.map(col => (
                  <label key={col.key}
                    className="flex items-center gap-2 px-3 py-1.5 text-xs cursor-pointer hover:bg-[rgba(122,82,48,.06)]">
                    <input
                      type="checkbox"
                      checked={draftColumns.includes(col.key)}
                      onChange={() => toggleDraftColumn(col.key)}
                      disabled={savingColumns}
                      className="accent-[#7a5230]"
                    />
                    <span className="text-[#4a3422]">{col.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2 px-3 py-2 border-t border-[rgba(122,82,48,.1)]">
                <button
                  type="button"
                  onClick={() => setColumnSettingsOpen(false)}
                  disabled={savingColumns}
                  className="text-xs text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={applyColumnSettings}
                  disabled={savingColumns}
                  className="px-2.5 py-1 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#6b4530] disabled:opacity-40 transition-colors"
                >
                  {savingColumns ? '套用中…' : '套用'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
        {initialData.length === 0 ? (
          <div className="py-12 text-center text-sm text-[#a08060]">尚無使用統計資料</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#faf6f0] border-b border-[rgba(122,82,48,.12)]">
                  <SortableHeader label="Email" column="email" />
                  <SortableHeader label="登入次數" column="loginCount" />
                  <SortableHeader label="總停留時長" column="totalDurationSeconds" />
                  <SortableHeader label="平均停留時長" column="averageDurationSeconds" />
                  <SortableHeader label="料卡搜尋次數" column="card_search" />
                  <SortableHeader label="料卡瀏覽次數" column="card_detail_view" />
                  {activeOptionalColumns.map(col => (
                    <SortableHeader key={col.key} label={col.label} column={col.key} />
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(122,82,48,.08)]">
                {sortedData.map(row => (
                  <tr key={row.email} className="hover:bg-[rgba(122,82,48,.03)] transition-colors">
                    <td className="px-4 py-3 text-[#2c1e12] whitespace-nowrap">{row.email}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.loginCount}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.totalDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422] whitespace-nowrap">{formatDuration(row.averageDurationSeconds)}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_search'] ?? 0}</td>
                    <td className="px-4 py-3 text-[#4a3422]">{row.eventCounts['card_detail_view'] ?? 0}</td>
                    {activeOptionalColumns.map(col => (
                      <td key={col.key} className="px-4 py-3 text-[#4a3422]">{row.eventCounts[col.key] ?? 0}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
