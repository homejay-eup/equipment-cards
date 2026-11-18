'use client'

import { useEffect, useRef } from 'react'
import { prefersReducedMotion } from '@/hooks/useFlipAnimation'

interface Props {
  message: string
  onUndo: () => void
  /** 倒數總長（毫秒），只控制倒數條；何時真的關閉由呼叫端決定 */
  duration?: number
  undoLabel?: string
}

/**
 * 底部「復原」提示：訊息＋復原按鈕＋倒數條。
 * 每次要顯示新的一則請換 key 讓它重新掛載（倒數條與滑入動畫才會重來）。
 * 何時送出／何時關閉由呼叫端控制，這個元件只負責畫面。
 */
export default function UndoToast({ message, onUndo, duration = 5000, undoLabel = '復原' }: Props) {
  const boxRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const box = boxRef.current
    const bar = barRef.current
    if (prefersReducedMotion()) return
    if (box && typeof box.animate === 'function') {
      box.animate(
        [{ transform: 'translateY(24px)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }],
        { duration: 250, easing: 'cubic-bezier(.2,.8,.2,1)' },
      )
    }
    if (bar && typeof bar.animate === 'function') {
      bar.animate(
        [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }],
        { duration, easing: 'linear', fill: 'forwards' },
      )
    }
  }, [duration])

  return (
    <div className="fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4 pointer-events-none">
      <div
        ref={boxRef}
        role="status"
        aria-live="polite"
        className="pointer-events-auto relative flex items-center gap-3 max-w-full overflow-hidden rounded-xl bg-[#2c1e12] text-[#faf6f0] text-sm pl-4 pr-2 py-2 shadow-[0_8px_24px_rgba(44,30,18,.35)]"
      >
        <span className="truncate">{message}</span>
        <button
          type="button"
          onClick={onUndo}
          className="flex-shrink-0 px-2.5 py-1 rounded-lg font-bold text-[#e8c39e] hover:bg-white/10 transition-colors"
        >
          {undoLabel}
        </button>
        <div
          ref={barRef}
          aria-hidden
          className="absolute left-0 bottom-0 h-[3px] w-full bg-[#c49a72] origin-left"
        />
      </div>
    </div>
  )
}
