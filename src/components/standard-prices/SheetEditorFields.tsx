'use client'

import { createContext, useContext, useRef } from 'react'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'

// Step 48：價目表編輯器的共用欄位元件。
// 「本次調整」用 «…» 標記：整格都標記時，輸入框不顯示 «»、改用紅底呈現；只標記部分文字時保留 «» 原樣顯示。

export const C = {
  bg: '#f5f6f8', surface: '#ffffff', surface2: '#eef0f4', fg: '#1b2230', muted: '#5d6676',
  line: '#dde1e8', ink: '#24324a', chg: '#c8102e', chgBg: '#fde8eb',
}

const WHOLE_RE = /^«([^«»]*)»$/

// 編輯器記住「最後點過的欄位」，工具列的「標記調整」按鈕就作用在那一格
type ToggleFn = () => void
export const MarkContext = createContext<{ setActive: (fn: ToggleFn | null) => void }>({ setActive: () => {} })

interface FieldProps {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  multiline?: boolean
  align?: 'left' | 'right' | 'center'
  className?: string
  bold?: boolean
}

export function Field({ value, onChange, placeholder, multiline, align = 'left', className = '', bold }: FieldProps) {
  const { setActive } = useContext(MarkContext)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  const whole = WHOLE_RE.exec(value)
  const display = whole ? whole[1] : value
  const marked = !!whole

  function handleChange(v: string) {
    onChange(marked ? (v ? `«${v}»` : '') : v)
  }

  // 工具列按鈕在使用者打字之後才按，要讀「最新」的值，不能用 focus 當下的 closure
  const latest = useRef({ display, marked, onChange })
  latest.current = { display, marked, onChange }

  function toggle() {
    const el = ref.current
    const { display, marked, onChange } = latest.current
    if (marked) { onChange(display); return }
    const s = el?.selectionStart ?? 0
    const e = el?.selectionEnd ?? 0
    if (e > s && !(s === 0 && e === display.length)) {
      onChange(display.slice(0, s) + '«' + display.slice(s, e) + '»' + display.slice(e))
    } else if (display.includes('«')) {
      onChange(display.replace(/[«»]/g, ''))
    } else if (display) {
      onChange(`«${display}»`)
    }
  }

  const style: React.CSSProperties = {
    textAlign: align,
    background: marked ? C.chgBg : C.surface,
    color: marked ? C.chg : C.fg,
    fontWeight: marked || bold ? 700 : 400,
    borderColor: marked ? '#f3c3cb' : C.line,
  }
  const cls = `w-full border rounded-md px-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#24324a]/60 ${className}`
  const common = {
    ref,
    value: display,
    placeholder,
    style,
    onFocus: () => setActive(toggle),
  }
  return multiline
    ? <textarea {...common} rows={2} onChange={e => handleChange(e.target.value)} className={`${cls} py-1.5 resize-y leading-snug`} />
    : <input {...common} onChange={e => handleChange(e.target.value)} className={`${cls} h-8`} />
}

export function Label({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="flex items-baseline gap-2 mb-1 min-w-0">
      <span className="text-xs font-medium whitespace-nowrap" style={{ color: C.muted }}>{children}</span>
      {hint && <span className="text-[11px] min-w-0" style={{ color: '#8a93a3' }}>{hint}</span>}
    </div>
  )
}

export function IconBtn({ onClick, title, children, danger, disabled }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="h-7 w-7 inline-flex items-center justify-center rounded-md border bg-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[#eef0f4]"
      style={{ borderColor: C.line, color: danger ? C.chg : C.muted }}
    >
      {children}
    </button>
  )
}

export function AddBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] font-medium px-1.5 py-1 rounded-md hover:bg-[#eef0f4]"
      style={{ color: C.ink }}
    >
      <Plus className="h-3.5 w-3.5" />{children}
    </button>
  )
}

export function Section({ title, hint, children, actions }: {
  title: string; hint?: string; children: React.ReactNode; actions?: React.ReactNode
}) {
  return (
    <div className="mb-5">
      <div className="flex items-center gap-2 mb-1.5">
        <Label hint={hint}>{title}</Label>
        <span className="flex-1" />
        {actions}
      </div>
      {children}
    </div>
  )
}

// ── 陣列操作 ──
export function move<T>(arr: T[], i: number, d: number): T[] {
  const j = i + d
  if (j < 0 || j >= arr.length) return arr
  const next = arr.slice()
  ;[next[i], next[j]] = [next[j], next[i]]
  return next
}
export const setAt = <T,>(arr: T[], i: number, v: T): T[] => arr.map((x, k) => (k === i ? v : x))
export const removeAt = <T,>(arr: T[], i: number): T[] => arr.filter((_, k) => k !== i)

// 文字清單（標籤、備註、規則條文…）：每行一個輸入框，可上下移動、刪除、新增
export function StringList({ items, onChange, addLabel, placeholder, multiline }: {
  items: string[]; onChange: (v: string[]) => void; addLabel: string; placeholder?: string; multiline?: boolean
}) {
  return (
    <div className="space-y-1.5">
      {items.map((v, i) => (
        <div key={i} className="flex items-start gap-1">
          <div className="flex-1 min-w-0">
            <Field value={v} onChange={nv => onChange(setAt(items, i, nv))} placeholder={placeholder} multiline={multiline} />
          </div>
          <IconBtn title="上移" onClick={() => onChange(move(items, i, -1))} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="下移" onClick={() => onChange(move(items, i, 1))} disabled={i === items.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title="刪除" danger onClick={() => onChange(removeAt(items, i))}><X className="h-3.5 w-3.5" /></IconBtn>
        </div>
      ))}
      <AddBtn onClick={() => onChange([...items, ''])}>{addLabel}</AddBtn>
    </div>
  )
}
