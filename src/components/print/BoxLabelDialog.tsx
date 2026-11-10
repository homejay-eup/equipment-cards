'use client'

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { printBoxLabels, type BoxLabelLayout } from '@/components/print/printBoxLabels'

interface BoxLabelCard {
  equipment_id: string
  name: string
  main_photo: string | null
}

interface Props {
  open: boolean
  cards: BoxLabelCard[]
  onClose: () => void
}

// 五個欄位都可手動換行；品號、品名預設帶入料卡，僅供這次列印修改，不會改到料卡本身
interface RowValue { eid: string; name: string; location: string; quantity: string; receivedDate: string; note: string }

const LAYOUTS: { value: BoxLabelLayout; title: string; desc: string }[] = [
  { value: 'landscape-photo', title: '橫式含照片', desc: 'A4 橫式，左圖右文' },
  { value: 'portrait-photo', title: '直式含照片', desc: 'A4 直式，上圖下文' },
  { value: 'text-landscape', title: '純文字橫式', desc: '不印照片，適合小箱子' },
]

const inputCls =
  'w-full px-2.5 py-1.5 text-sm border border-[rgba(122,82,48,.25)] rounded-lg bg-white text-[#4a3422] placeholder-[#c0a882] focus:outline-none focus:border-[#c49a72] focus:ring-1 focus:ring-[rgba(122,82,48,.15)] resize-none leading-snug'

function defaults(c: BoxLabelCard): RowValue {
  return { eid: c.equipment_id, name: c.name, location: '', quantity: '', receivedDate: '', note: '' }
}

// 依目前內容的行數決定高度，按 Enter 換行時輸入框會跟著長高
function rowsOf(v: string): number {
  return Math.max(1, v.split('\n').length)
}

// 封箱標籤：列印前填寫倉庫位置、數量、備註（僅供這次列印，不存回料卡）
export default function BoxLabelDialog({ open, cards, onClose }: Props) {
  const [values, setValues] = useState<Record<string, RowValue>>({})
  const [layout, setLayout] = useState<BoxLabelLayout>('landscape-photo')

  // 每次開啟都重新開始，避免殘留上次填的內容
  useEffect(() => {
    if (open) {
      setValues({})
      setLayout('landscape-photo')
    }
  }, [open])

  function valueOf(c: BoxLabelCard): RowValue {
    return values[c.equipment_id] ?? defaults(c)
  }

  function setField(c: BoxLabelCard, field: keyof RowValue, v: string) {
    setValues(prev => {
      const cur = prev[c.equipment_id] ?? defaults(c)
      return { ...prev, [c.equipment_id]: { ...cur, [field]: v } }
    })
  }

  function handlePrint() {
    const labels = cards.map(c => {
      const v = valueOf(c)
      return {
        equipment_id: v.eid.trim(),
        name: v.name.trim(),
        main_photo: c.main_photo,
        location: v.location.trim(),
        quantity: v.quantity.trim(),
        received_date: v.receivedDate.trim(),
        note: v.note.trim(),
      }
    })
    void printBoxLabels(labels, layout)
    onClose()
  }

  const gridCols = 'grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_4.5rem_minmax(0,1fr)_minmax(0,1.1fr)]'

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl bg-[#faf6f0] border-[rgba(122,82,48,.2)]">
        <DialogHeader>
          <DialogTitle className="text-[#7a5230]">列印封箱標籤（{cards.length}）</DialogTitle>
          <DialogDescription className="text-[#a08060]">
            先選版面。每個欄位都可以按 Enter 手動換行。內容僅用於這次列印，不會存回料卡。
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="標籤版面">
          {LAYOUTS.map(l => {
            const active = layout === l.value
            return (
              <button
                key={l.value}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setLayout(l.value)}
                className={`text-left rounded-lg px-3 py-2 bg-white transition-colors ${
                  active
                    ? 'border-2 border-[#7a5230]'
                    : 'border border-[rgba(122,82,48,.3)] hover:bg-[rgba(122,82,48,.04)]'
                }`}
              >
                <div className="text-sm font-medium text-[#4a3422]">{l.title}</div>
                <div className="text-xs text-[#a08060]">{l.desc}</div>
              </button>
            )
          })}
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-[rgba(122,82,48,.15)] rounded-lg bg-white">
          <div className={`grid ${gridCols} gap-2 px-3 py-2 text-xs text-[#a08060] border-b border-[rgba(122,82,48,.15)] sticky top-0 bg-white z-10`}>
            <span>品號 / 品名</span>
            <span>倉庫位置</span>
            <span>數量</span>
            <span>進貨日</span>
            <span>備註</span>
          </div>
          {cards.map(c => {
            const v = valueOf(c)
            return (
              <div
                key={c.equipment_id}
                className={`grid ${gridCols} gap-2 px-3 py-2 items-start border-b last:border-b-0 border-[rgba(122,82,48,.1)]`}
              >
                <div className="min-w-0 flex flex-col gap-1">
                  <textarea
                    rows={rowsOf(v.eid)}
                    value={v.eid}
                    onChange={e => setField(c, 'eid', e.target.value)}
                    className={`${inputCls} font-mono text-xs`}
                    aria-label={`${c.equipment_id} 品號`}
                  />
                  <textarea
                    rows={rowsOf(v.name)}
                    value={v.name}
                    onChange={e => setField(c, 'name', e.target.value)}
                    className={inputCls}
                    aria-label={`${c.equipment_id} 品名`}
                  />
                </div>
                <textarea
                  rows={rowsOf(v.location)}
                  value={v.location}
                  onChange={e => setField(c, 'location', e.target.value)}
                  className={inputCls}
                  aria-label={`${c.equipment_id} 倉庫位置`}
                />
                <textarea
                  rows={rowsOf(v.quantity)}
                  value={v.quantity}
                  onChange={e => setField(c, 'quantity', e.target.value)}
                  className={inputCls}
                  aria-label={`${c.equipment_id} 數量`}
                />
                <textarea
                  rows={rowsOf(v.receivedDate)}
                  value={v.receivedDate}
                  onChange={e => setField(c, 'receivedDate', e.target.value)}
                  placeholder="2026/11/10"
                  className={inputCls}
                  aria-label={`${c.equipment_id} 進貨日`}
                />
                <textarea
                  rows={rowsOf(v.note)}
                  value={v.note}
                  onChange={e => setField(c, 'note', e.target.value)}
                  className={inputCls}
                  aria-label={`${c.equipment_id} 備註`}
                />
              </div>
            )
          })}
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.25)] rounded-lg hover:text-[#7a5230] transition-colors"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={cards.length === 0}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-[#7a5230] hover:bg-[#9c6b42] text-white text-sm font-semibold rounded-lg disabled:opacity-40 transition-colors"
          >
            <Printer className="h-4 w-4" />
            列印
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
