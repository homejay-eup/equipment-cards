'use client'

import { useEffect, useState } from 'react'
import { Printer } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { printBoxLabels } from '@/components/print/printBoxLabels'

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

interface RowValue { location: string; quantity: string; note: string }

const inputCls =
  'w-full px-2.5 py-1.5 text-sm border border-[rgba(122,82,48,.25)] rounded-lg bg-white text-[#4a3422] placeholder-[#c0a882] focus:outline-none focus:border-[#c49a72] focus:ring-1 focus:ring-[rgba(122,82,48,.15)]'

// 封箱標籤：列印前填寫倉庫位置與數量（僅供這次列印，不存回料卡）
export default function BoxLabelDialog({ open, cards, onClose }: Props) {
  const [values, setValues] = useState<Record<string, RowValue>>({})
  const [allLocation, setAllLocation] = useState('')

  // 每次開啟都重新開始，避免殘留上次填的內容
  useEffect(() => {
    if (open) {
      setValues({})
      setAllLocation('')
    }
  }, [open])

  function setField(id: string, field: keyof RowValue, v: string) {
    setValues(prev => {
      const cur: RowValue = prev[id] ?? { location: '', quantity: '', note: '' }
      return { ...prev, [id]: { ...cur, [field]: v } }
    })
  }

  function applyAllLocation() {
    const loc = allLocation.trim()
    setValues(prev => {
      const next: Record<string, RowValue> = {}
      for (const c of cards) {
        const cur: RowValue = prev[c.equipment_id] ?? { location: '', quantity: '', note: '' }
        next[c.equipment_id] = { ...cur, location: loc }
      }
      return next
    })
  }

  function handlePrint() {
    const labels = cards.map(c => ({
      equipment_id: c.equipment_id,
      name: c.name,
      main_photo: c.main_photo,
      location: (values[c.equipment_id]?.location ?? '').trim(),
      quantity: (values[c.equipment_id]?.quantity ?? '').trim(),
      note: (values[c.equipment_id]?.note ?? '').trim(),
    }))
    void printBoxLabels(labels)
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="max-w-3xl bg-[#faf6f0] border-[rgba(122,82,48,.2)]">
        <DialogHeader>
          <DialogTitle className="text-[#7a5230]">列印封箱標籤（{cards.length}）</DialogTitle>
          <DialogDescription className="text-[#a08060]">
            A4 直式，每張一頁。位置與數量僅用於這次列印，不會存回料卡。
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <input
            type="text"
            value={allLocation}
            onChange={e => setAllLocation(e.target.value)}
            placeholder="全部套用同一倉庫位置，例如 A-03-2"
            className={inputCls}
          />
          <button
            type="button"
            onClick={applyAllLocation}
            className="px-3 py-1.5 text-sm whitespace-nowrap text-[#7a5230] bg-white border border-[rgba(122,82,48,.25)] rounded-lg hover:bg-[rgba(122,82,48,.06)] transition-colors"
          >
            套用到全部
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto border border-[rgba(122,82,48,.15)] rounded-lg bg-white">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_minmax(0,1.2fr)] gap-2 px-3 py-2 text-xs text-[#a08060] border-b border-[rgba(122,82,48,.15)] sticky top-0 bg-white">
            <span>品號 / 品名</span>
            <span>倉庫位置</span>
            <span>數量</span>
            <span>備註</span>
          </div>
          {cards.map(c => (
            <div
              key={c.equipment_id}
              className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_5rem_minmax(0,1.2fr)] gap-2 px-3 py-2 items-center border-b last:border-b-0 border-[rgba(122,82,48,.1)]"
            >
              <div className="min-w-0">
                <div className="font-mono text-xs text-[#7a5230]">{c.equipment_id}</div>
                <div className="text-sm text-[#4a3422] truncate" title={c.name}>{c.name}</div>
              </div>
              <input
                type="text"
                value={values[c.equipment_id]?.location ?? ''}
                onChange={e => setField(c.equipment_id, 'location', e.target.value)}
                className={inputCls}
                aria-label={`${c.equipment_id} 倉庫位置`}
              />
              <input
                type="text"
                inputMode="numeric"
                value={values[c.equipment_id]?.quantity ?? ''}
                onChange={e => setField(c.equipment_id, 'quantity', e.target.value)}
                className={inputCls}
                aria-label={`${c.equipment_id} 數量`}
              />
              <input
                type="text"
                value={values[c.equipment_id]?.note ?? ''}
                onChange={e => setField(c.equipment_id, 'note', e.target.value)}
                className={inputCls}
                aria-label={`${c.equipment_id} 備註`}
              />
            </div>
          ))}
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
