'use client'

import { useMemo, useState } from 'react'
import { Search, AlertTriangle, Plus } from 'lucide-react'
import { MaintenanceVendor } from '@/types/maintenance'

interface Props {
  vendors: MaintenanceVendor[]
  selectedVendorId: string | null
  onSelect: (vendorId: string) => void
  canManage: boolean
  onAddVendor: () => void
}

// 廠商清單：緊湊列表（非卡片格），可搜尋代號/名稱，待覆核數要顯眼
export default function VendorListPanel({ vendors, selectedVendorId, onSelect, canManage, onAddVendor }: Props) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return vendors
    return vendors.filter(v =>
      v.name.includes(q) || (v.vendor_code ?? '').includes(q)
    )
  }, [vendors, query])

  return (
    <div className="bg-white border border-[#e8ddd0] rounded-lg overflow-hidden flex flex-col">
      <div className="p-2 border-b border-[rgba(122,82,48,.1)] space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#a08060]" />
          <input
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="搜尋廠商代號或名稱…"
            className="w-full pl-8 pr-2 py-1.5 border border-[#e8ddd0] rounded-lg text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72]"
          />
        </div>
        {canManage && (
          <button
            onClick={onAddVendor}
            className="w-full flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-white bg-[#7a5230] rounded-lg hover:bg-[#9c6b42] transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />新增廠商
          </button>
        )}
      </div>
      <div className="max-h-[60vh] md:max-h-[70vh] overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-4 text-xs text-[#a08060] text-center">沒有符合的廠商</p>
        ) : filtered.map(v => (
          <button
            key={v.id}
            onClick={() => onSelect(v.id)}
            className={`w-full text-left px-3 py-2.5 border-b border-[rgba(122,82,48,.06)] transition-colors ${
              selectedVendorId === v.id ? 'bg-[rgba(122,82,48,.08)]' : 'hover:bg-[rgba(122,82,48,.04)]'
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className={`text-sm font-medium truncate ${selectedVendorId === v.id ? 'text-[#7a5230]' : 'text-[#4a3422]'}`}>
                  {v.name}
                </p>
                {v.vendor_code && (
                  <p className="text-[11px] text-[#a08060] font-mono">{v.vendor_code}</p>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {(v.needs_review_count ?? 0) > 0 && (
                  <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-[rgba(181,69,27,.12)] text-[#b5451b] border border-[rgba(181,69,27,.3)]">
                    <AlertTriangle className="h-2.5 w-2.5" />{v.needs_review_count}
                  </span>
                )}
                <span className="text-[10px] text-[#a08060]">{v.rule_count ?? 0} 筆規則</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
