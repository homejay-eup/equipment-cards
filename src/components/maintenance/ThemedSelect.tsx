'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'

export interface ThemedSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  options: ThemedSelectOption[]
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  ariaLabel?: string
}

// 木質棕主題下拉選單（取代瀏覽器原生 <select>）。
// 清單以 absolute 定位在按鈕正下方，不使用 createPortal，因此不會有 Radix Dialog 的 pointer-events
// 問題；父層不可設 overflow-hidden（會裁切清單）。
export default function ThemedSelect({ value, options, onChange, placeholder, disabled, ariaLabel }: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const current = options.find(o => o.value === value)

  return (
    <div ref={wrapRef} className="relative flex-1 min-w-0">
      <button
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        className={`w-full flex items-center justify-between gap-1.5 text-left text-sm px-2.5 py-1.5 rounded-lg border bg-[#faf6f0] text-[#2c1e12] disabled:opacity-50 transition-colors ${
          open ? 'border-[#c49a72]' : 'border-[#e8ddd0] hover:border-[#c49a72]'
        }`}
      >
        <span className={`truncate ${current ? '' : 'text-[#a08060]'}`}>{current ? current.label : (placeholder ?? '請選擇')}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 text-[#a08060] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute z-30 left-0 right-0 top-full mt-1 max-h-52 overflow-y-auto p-1 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-[10px] shadow-[0_8px_30px_rgba(122,82,48,.18)]"
        >
          {options.length === 0 ? (
            <p className="px-2.5 py-1.5 text-xs text-[#a08060]">沒有可選項目</p>
          ) : options.map(o => {
            const selected = o.value === value
            return (
              <div
                key={o.value}
                role="option"
                aria-selected={selected}
                onClick={() => { onChange(o.value); setOpen(false) }}
                className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-sm cursor-pointer hover:bg-[rgba(122,82,48,.08)] ${
                  selected ? 'text-[#7a5230] font-medium bg-[rgba(122,82,48,.06)]' : 'text-[#4a3422]'
                }`}
              >
                <span className="truncate">{o.label}</span>
                {selected && <Check className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
