'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject } from 'react'

/** 使用者是否在系統設定開啟「減少動態效果」；SSR 或不支援時視為否 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

interface FlipOptions {
  /** 這個值改變時才播放動畫（例如分類／狀態／排序組合成的字串）；搜尋字不要放進來 */
  trigger: string
  /** 這個值改變時只重新記錄位置、不播放動畫（例如網格／清單切換、分頁切換） */
  layoutKey?: string
}

type Pos = { x: number; y: number }

const MOVE_DURATION = 300
const FADE_DURATION = 260
const FADE_STAGGER = 40
const FADE_STAGGER_MAX = 8
const SKIP_ALL_REORDER_OVER = 300

/**
 * FLIP 動畫：容器底下帶 `data-flip-key` 的直接子元素，在 trigger 改變後從舊位置滑到新位置；
 * 新出現的元素依序淡入（每張延遲 40ms，最多延遲 8 張）。
 * - 位置以「相對容器左上角」記錄，捲動不影響比對
 * - 只動畫變動前後有出現在可視範圍內的元素，其他直接到位
 * - 超過 300 張且幾乎全部重排時直接跳過
 * - prefers-reduced-motion 時完全不動畫
 */
export function useFlipAnimation(
  containerRef: RefObject<HTMLElement>,
  keys: string[],
  { trigger, layoutKey = '' }: FlipOptions,
) {
  const rectsRef = useRef<Map<string, Pos>>(new Map())
  const prevTriggerRef = useRef(trigger)
  const prevLayoutRef = useRef(layoutKey)
  const animatingRef = useRef<Set<Animation>>(new Set())

  const cancelRunning = useCallback(() => {
    animatingRef.current.forEach(a => { try { a.cancel() } catch { /* ignore */ } })
    animatingRef.current.clear()
  }, [])

  const measure = useCallback((): { base: DOMRect | null; nodes: HTMLElement[]; map: Map<string, Pos> } => {
    const el = containerRef.current
    const map = new Map<string, Pos>()
    if (!el) return { base: null, nodes: [], map }
    const base = el.getBoundingClientRect()
    const nodes = Array.from(el.children).filter(
      (n): n is HTMLElement => n instanceof HTMLElement && !!n.dataset.flipKey,
    )
    for (const n of nodes) {
      const r = n.getBoundingClientRect()
      map.set(n.dataset.flipKey as string, { x: r.left - base.left, y: r.top - base.top })
    }
    return { base, nodes, map }
  }, [containerRef])

  const keysSig = keys.join('\u0001')

  useLayoutEffect(() => {
    const triggered = prevTriggerRef.current !== trigger && prevLayoutRef.current === layoutKey
    prevTriggerRef.current = trigger
    prevLayoutRef.current = layoutKey

    // 先停掉上一輪還在跑的動畫，量到的才是真正的最終位置
    cancelRunning()
    const { base, nodes, map } = measure()
    const prev = rectsRef.current
    rectsRef.current = map

    if (!triggered || !base || base.width === 0 || prefersReducedMotion()) return
    if (typeof Element === 'undefined' || typeof Element.prototype.animate !== 'function') return

    // 大量結果幾乎全部重排（例如換排序）：跳過，避免卡頓
    if (nodes.length > SKIP_ALL_REORDER_OVER) {
      let changed = 0
      for (const [k, p] of Array.from(map.entries())) {
        const o = prev.get(k)
        if (!o || Math.abs(o.x - p.x) > 1 || Math.abs(o.y - p.y) > 1) changed++
      }
      if (changed >= nodes.length * 0.9) return
    }

    const vh = window.innerHeight
    const inView = (top: number, h: number) => top < vh && top + h > 0
    let fadeIndex = 0

    for (const node of nodes) {
      const key = node.dataset.flipKey as string
      const pos = map.get(key)
      if (!pos) continue
      const h = node.offsetHeight
      const newTop = base.top + pos.y
      const old = prev.get(key)
      if (old) {
        const dx = old.x - pos.x
        const dy = old.y - pos.y
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue
        const oldTop = base.top + old.y
        if (!inView(newTop, h) && !inView(oldTop, h)) continue
        const anim = node.animate(
          [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
          { duration: MOVE_DURATION, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
        animatingRef.current.add(anim)
        anim.onfinish = () => { animatingRef.current.delete(anim) }
      } else {
        if (!inView(newTop, h)) continue
        const delay = Math.min(fadeIndex, FADE_STAGGER_MAX) * FADE_STAGGER
        fadeIndex++
        const anim = node.animate(
          [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'scale(1)' }],
          { duration: FADE_DURATION, delay, easing: 'ease-out', fill: 'backwards' },
        )
        animatingRef.current.add(anim)
        anim.onfinish = () => { animatingRef.current.delete(anim) }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysSig, trigger, layoutKey])

  // 視窗大小改變會改變排版：重新記錄位置（不播放動畫）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const onResize = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        cancelRunning()
        rectsRef.current = measure().map
      }, 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (timer) clearTimeout(timer)
    }
  }, [measure, cancelRunning])

  useEffect(() => () => cancelRunning(), [cancelRunning])
}
