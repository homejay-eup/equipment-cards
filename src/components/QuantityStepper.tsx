'use client'

// Step 35：數量欄位共用元件（我的關注／設備組合清單模式共用），
// -/數字/+ 三顆一組，範圍 1–999。點擊時 stopPropagation，避免被外層
// <label>/<button> 的點擊事件（如展開/收合、切換 checkbox）誤觸。
interface QuantityStepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  disabled?: boolean
}

export default function QuantityStepper({ value, onChange, min = 1, max = 999, disabled }: QuantityStepperProps) {
  function clamp(v: number): number {
    if (Number.isNaN(v)) return min
    return Math.min(max, Math.max(min, Math.round(v)))
  }

  return (
    <span
      className="flex items-center gap-1 flex-shrink-0"
      onClick={e => e.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={disabled || value <= min}
        title="減少數量"
        className="w-5 h-5 flex items-center justify-center rounded border border-[#e8ddd0] text-[#a08060] hover:text-[#7a5230] hover:border-[#c49a72] disabled:opacity-30 disabled:hover:text-[#a08060] disabled:hover:border-[#e8ddd0] transition-colors"
      >
        −
      </button>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onClick={e => e.stopPropagation()}
        onChange={e => onChange(clamp(Number(e.target.value)))}
        className="w-11 text-center text-xs border border-[#e8ddd0] rounded px-0.5 py-0.5 bg-white focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
      />
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={disabled || value >= max}
        title="增加數量"
        className="w-5 h-5 flex items-center justify-center rounded border border-[#e8ddd0] text-[#a08060] hover:text-[#7a5230] hover:border-[#c49a72] disabled:opacity-30 disabled:hover:text-[#a08060] disabled:hover:border-[#e8ddd0] transition-colors"
      >
        +
      </button>
    </span>
  )
}
