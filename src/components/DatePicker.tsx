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

  // 底部/右側超出視窗時位移
  useEffect(() => {
    if (!open || !dropRef.current) return
    const dd = dropRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    const vw = window.innerWidth
    if (dd.bottom > vh - 8) {
      const triggerRect = triggerRef.current?.getBoundingClientRect()
      if (triggerRect) setPos(prev => ({ ...prev, top: triggerRect.top - dd.height - 4 }))
    }
    if (dd.right > vw - 8) {
      setPos(prev => ({ ...prev, left: vw - dd.width - 8 }))
    }
  }, [open])

  function handleTrigger() {
    if (disabled) return
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.left })
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
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999 }}
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
