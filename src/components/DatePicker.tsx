'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { format, parseISO, isValid } from 'date-fns'
import { CalendarIcon, X } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'

interface Props {
  value: string           // YYYY-MM-DD
  onChange: (v: string) => void
  disabled?: boolean
}

// shadcn Calendar with [--cell-size:2.25rem]: conservative upper bounds
const CAL_W = 310
const CAL_H = 370

export default function DatePicker({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const dropRef = useRef<HTMLDivElement>(null)

  const parsed = value ? parseISO(value) : undefined
  const selected = parsed && isValid(parsed) ? parsed : undefined

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (dropRef.current?.contains(e.target as Node)) return
      if (triggerRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  function handleTrigger() {
    if (disabled) return
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      const vh = window.innerHeight
      const vw = window.innerWidth

      // 優先往下展開；空間不足時往上
      let top = rect.bottom + 4
      if (top + CAL_H > vh - 8) {
        top = rect.top - CAL_H - 4
      }
      // 夾住確保不超出視窗上下左右
      top = Math.max(8, Math.min(top, vh - CAL_H - 8))
      const left = Math.max(8, Math.min(rect.left, vw - CAL_W - 8))

      setPos({ top, left })
    }
    setOpen(v => !v)
  }

  function handleClear() {
    onChange('')
    setOpen(false)
  }

  function handleToday() {
    onChange(format(new Date(), 'yyyy-MM-dd'))
    setOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={handleTrigger}
        disabled={disabled}
        className="w-full flex items-center gap-2 border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm bg-[#faf6f0] text-left focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] disabled:opacity-50 transition-all"
      >
        <CalendarIcon className="h-3.5 w-3.5 text-[#a08060] shrink-0" />
        <span className={`flex-1 ${selected ? 'text-[#2c1e12]' : 'text-[#c0a882]'}`}>
          {selected ? format(selected, 'yyyy/MM/dd') : '選擇日期'}
        </span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); onChange('') }}
            className="text-[#c0a882] hover:text-[#b5451b] transition-colors"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={dropRef}
          data-portal-popover
          // 巢狀在 Radix Dialog 內開啟時，Dialog 會把 document.body 整個設成 pointer-events:none
          // 只留自己 auto；這個 div portal 到 body 底下、不是 DialogContent 的子節點，會繼承到 none
          // 導致整個日曆點不到（點擊會穿透到 Dialog 遮罩，誤觸關閉整個 Dialog）。必須自己明確蓋回 auto。
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, pointerEvents: 'auto' }}
          className="bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-xl shadow-[0_4px_24px_rgba(122,82,48,.18)] overflow-hidden"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(date) => {
              onChange(date ? format(date, 'yyyy-MM-dd') : '')
              setOpen(false)
            }}
            className="[--cell-size:2.25rem] p-3"
          />
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-[rgba(122,82,48,.12)] bg-[#faf6f0]">
            <button
              type="button"
              onClick={handleClear}
              className="text-sm text-[#a08060] hover:text-[#7a5230] transition-colors"
            >
              清除
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="text-sm text-[#7a5230] font-medium hover:text-[#5a3820] transition-colors"
            >
              今天
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
