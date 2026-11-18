'use client'

import { useRef } from 'react'
import { Star } from 'lucide-react'
import { prefersReducedMotion } from '@/hooks/useFlipAnimation'

interface Props {
  isBookmarked: boolean
  onToggle: () => void
  /** 按鈕本身的 className（位置、顯示條件由呼叫端決定，這個元件不改） */
  className?: string
  iconClassName?: string
}

const DOT_COUNT = 8

/**
 * 關注星號：從未關注 → 關注時星星彈一下並迸出小點（Web Animations API，不加全域 CSS）；
 * 移除關注時不迸開，只換回空心。照片牆卡片與清單列共用。
 */
export default function BookmarkStar({ isBookmarked, onToggle, className = '', iconClassName = 'h-3.5 w-3.5' }: Props) {
  const wrapRef = useRef<HTMLSpanElement>(null)

  function burst() {
    const wrap = wrapRef.current
    if (!wrap || prefersReducedMotion() || typeof wrap.animate !== 'function') return
    const star = wrap.firstElementChild as HTMLElement | null
    if (star) star.style.transformOrigin = '50% 50%'
    star?.animate(
      [{ transform: 'scale(.6)' }, { transform: 'scale(1.35)', offset: 0.55 }, { transform: 'scale(1)' }],
      { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
    )
    for (let i = 0; i < DOT_COUNT; i++) {
      const dot = document.createElement('span')
      const angle = (Math.PI * 2 * i) / DOT_COUNT - Math.PI / 2
      const dist = 11 + (i % 2) * 3
      dot.style.cssText =
        'position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:9999px;pointer-events:none;' +
        `background:${i % 2 ? '#fbbf24' : '#c49a72'};`
      wrap.appendChild(dot)
      const anim = dot.animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${Math.cos(angle) * dist}px, ${Math.sin(angle) * dist}px) scale(.3)`, opacity: 0 },
        ],
        { duration: 480, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' },
      )
      const remove = () => dot.remove()
      anim.onfinish = remove
      anim.oncancel = remove
    }
  }

  return (
    <button
      type="button"
      onClick={e => {
        e.stopPropagation()
        if (!isBookmarked) burst()
        onToggle()
      }}
      className={className}
      title={isBookmarked ? '移除關注' : '加入關注'}
      aria-label={isBookmarked ? '移除關注' : '加入關注'}
      aria-pressed={isBookmarked}
    >
      <span ref={wrapRef} className="relative inline-flex">
        <Star className={`${iconClassName} ${isBookmarked ? 'fill-amber-400' : ''}`} />
      </span>
    </button>
  )
}
