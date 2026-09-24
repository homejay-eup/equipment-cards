'use client'

import { useCallback, useState } from 'react'
import { ArrowLeft, Pencil, Trash2, History, CalendarDays, FileText } from 'lucide-react'
import type { StandardPriceItem } from '@/types/standardPrice'
import RichContentView from '@/components/tracker/RichContentView'
import UpdateImageLightbox from '@/components/UpdateImageLightbox'
import { formatMonth, formatNumber, formatWithUnit, headlinePrice } from './standardPriceUtils'

interface Props {
  item: StandardPriceItem
  /** 同名所有版本（新到舊，第 0 筆＝現行） */
  versions: StandardPriceItem[]
  canEdit: boolean
  onSelectVersion: (id: string) => void
  onEdit: (item: StandardPriceItem) => void
  onDelete: (item: StandardPriceItem) => void
  onBackToList: () => void
}

type Field = { label: string; value: string | null }

// 一個價格區塊：欄位全部為空就整個不顯示；個別空欄位也不顯示
function PriceBlock({ title, fields }: { title: string; fields: Field[] }) {
  const shown = fields.filter((f) => f.value !== null && f.value !== '')
  if (shown.length === 0) return null
  return (
    <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
      <p className="px-4 py-1.5 text-xs font-semibold text-[#a08060] bg-[#faf6f0] border-b border-[#e8ddd0]">{title}</p>
      <div className="flex flex-wrap py-1">
        {shown.map((f) => (
          <div key={f.label} className="w-1/2 sm:w-1/4 px-4 py-1.5">
            <p className="text-xs text-[#a08060]">{f.label}</p>
            <p className="text-sm font-medium text-[#7a5230] mt-0.5 break-words">{f.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function ProductDetail({ item, versions, canEdit, onSelectVersion, onEdit, onDelete, onBackToList }: Props) {
  const current = versions[0]
  const isCurrent = !current || current.id === item.id

  const [lightbox, setLightbox] = useState<{ images: { public_id: string; url: string }[]; index: number } | null>(null)
  const openLightbox = useCallback((images: { public_id: string; url: string }[], index: number) => setLightbox({ images, index }), [])

  const extraFees = item.extra_fees ?? []
  const noteImages = item.notes_image_urls ?? []
  const noteTable = item.notes_table_data ?? null
  const hasNotes = !!item.notes || noteImages.length > 0 || !!noteTable

  const blocks: { title: string; fields: Field[] }[] = [
    {
      title: '買斷',
      fields: [
        { label: '定價', value: formatWithUnit(item.buyout_list_price, '元') },
        { label: '業務價', value: formatWithUnit(item.buyout_sales_price, '元') },
        { label: '主管價', value: formatWithUnit(item.buyout_manager_price, '元') },
        { label: '保固', value: item.warranty },
      ],
    },
    {
      title: '租賃',
      fields: [
        { label: '月租', value: formatWithUnit(item.rent_monthly, '元/月') },
        { label: '合約期', value: item.rent_contract },
      ],
    },
    {
      title: '共通費用',
      fields: [
        { label: '平台費(買斷)', value: formatWithUnit(item.platform_fee_buyout, '元/月') },
        { label: '平台費(租賃)', value: formatWithUnit(item.platform_fee_rent, '元/月') },
        { label: '施工費', value: formatWithUnit(item.install_fee, '元/台') },
      ],
    },
    {
      title: '業績積分',
      fields: [
        { label: '買斷', value: formatWithUnit(item.points_buyout, '分/台') },
        { label: '租賃', value: formatWithUnit(item.points_rent, '分/台') },
      ],
    },
  ]
  // 其他費用插在共通費用之後、業績積分之前（獨立清單樣式）
  const beforeExtra = blocks.slice(0, 3)
  const afterExtra = blocks.slice(3)

  return (
    <div className="space-y-3">
      {/* 手機版返回清單 */}
      <button
        type="button"
        onClick={onBackToList}
        className="sm:hidden flex items-center gap-1 text-sm text-[#a08060] hover:text-[#7a5230] transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        返回清單
      </button>

      {!isCurrent && current && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[#e8c9a0] bg-[#fdf3e3] px-3 py-2 text-xs text-[#8a5a1c]">
          <History className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="flex-1 min-w-0">查看歷史版本（{formatMonth(item.effective_date)}），非目前現行價格</span>
          <button
            type="button"
            onClick={() => onSelectVersion(current.id)}
            className="font-semibold text-[#7a5230] hover:underline"
          >
            回到現行版本
          </button>
        </div>
      )}

      {/* 標題 */}
      <div className="rounded-lg border border-[#e8ddd0] bg-white px-4 py-3">
        <div className="flex items-start gap-2">
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-[#2c1e12] break-words">{item.name}</h2>
            <p className="text-xs text-[#a08060] mt-0.5">{item.category}</p>
          </div>
          {canEdit && (
            <div className="flex items-center gap-1 flex-shrink-0">
              <button type="button" onClick={() => onEdit(item)} title="編輯此版本"
                className="p-1.5 rounded-md text-[#a08060] hover:text-[#7a5230] hover:bg-[rgba(122,82,48,.06)] transition-colors">
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => onDelete(item)} title="刪除此版本"
                className="p-1.5 rounded-md text-[#a08060] hover:text-[#b5451b] hover:bg-[rgba(181,69,27,.06)] transition-colors">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-[#faf6f0] text-[#6b4f38] border border-[#e8ddd0]">
            <CalendarDays className="h-3 w-3" />
            生效 {formatMonth(item.effective_date)}
          </span>
          {isCurrent ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#7a5230] text-white">現行</span>
          ) : (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-[#efe6da] text-[#8a6a4a]">歷史</span>
          )}
        </div>
        {item.plan_name && (
          <p className="flex items-start gap-1 text-xs text-[#6b4f38] mt-2">
            <FileText className="h-3.5 w-3.5 mt-px flex-shrink-0 text-[#a08060]" />
            <span className="break-words">出自：{item.plan_name}</span>
          </p>
        )}
      </div>

      {beforeExtra.map((b) => <PriceBlock key={b.title} title={b.title} fields={b.fields} />)}

      {extraFees.length > 0 && (
        <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
          <p className="px-4 py-1.5 text-xs font-semibold text-[#a08060] bg-[#faf6f0] border-b border-[#e8ddd0]">其他費用</p>
          {extraFees.map((fee, idx) => {
            const amount = formatNumber(fee.amount)
            return (
              <div key={`${fee.name}-${idx}`} className={`flex items-center gap-3 px-4 py-2 ${idx > 0 ? 'border-t border-[#f0e8dc]' : ''}`}>
                <span className="flex-1 min-w-0 text-sm text-[#2c1e12] break-words">{fee.name}</span>
                <span className="text-sm font-medium text-[#7a5230] flex-shrink-0">
                  {amount !== null ? `${amount} 元${fee.unit ? `/${fee.unit}` : ''}` : '未列金額'}
                </span>
              </div>
            )
          })}
        </div>
      )}

      {afterExtra.map((b) => <PriceBlock key={b.title} title={b.title} fields={b.fields} />)}

      {hasNotes && (
        <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
          <p className="px-4 py-1.5 text-xs font-semibold text-[#a08060] bg-[#faf6f0] border-b border-[#e8ddd0]">備註</p>
          <div className="px-4 py-3">
            <RichContentView content={item.notes} images={noteImages} table={noteTable} onImageClick={openLightbox} />
          </div>
        </div>
      )}

      {/* 歷史版本 */}
      {versions.length > 0 && (
        <div className="rounded-lg border border-[#e8ddd0] bg-white overflow-hidden">
          <p className="px-4 py-1.5 text-xs font-semibold text-[#a08060] bg-[#faf6f0] border-b border-[#e8ddd0]">
            歷史版本（共 {versions.length} 版）
          </p>
          {versions.map((v, idx) => {
            const active = v.id === item.id
            const price = headlinePrice(v)
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => onSelectVersion(v.id)}
                className={`w-full flex items-center gap-2 px-4 py-2 text-left transition-colors ${idx > 0 ? 'border-t border-[#f0e8dc]' : ''} ${
                  active ? 'bg-[rgba(122,82,48,.08)]' : 'hover:bg-[rgba(122,82,48,.04)]'
                }`}
              >
                <span className={`text-sm ${active ? 'text-[#7a5230] font-semibold' : 'text-[#2c1e12]'}`}>{formatMonth(v.effective_date)}</span>
                {idx === 0 && <span className="px-1.5 py-px rounded-full text-[10px] font-medium bg-[#7a5230] text-white">現行</span>}
                <span className="flex-1" />
                {price && <span className="text-xs text-[#a08060]">{price}</span>}
              </button>
            )
          })}
        </div>
      )}

      {lightbox && (
        <UpdateImageLightbox
          images={lightbox.images}
          index={lightbox.index}
          onIndexChange={(i) => setLightbox((prev) => (prev ? { ...prev, index: i } : prev))}
          onClose={() => setLightbox(null)}
        />
      )}
    </div>
  )
}
