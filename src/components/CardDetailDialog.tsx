'use client'

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minimize2, Pencil, Printer, Package, FileText, ExternalLink, Wrench } from 'lucide-react'
import { logUsageEvent } from '@/lib/analyticsClient'
import RichContentView from '@/components/tracker/RichContentView'
import UpdateImageLightbox from '@/components/UpdateImageLightbox'
import { prefersReducedMotion } from '@/hooks/useFlipAnimation'

interface Props {
  card: EquipmentCard
  open: boolean
  onClose: () => void
  activeStatus: string
  isAdmin?: boolean
  onEdit?: () => void
  permissions?: string[]
  bookmarkNotes?: string
  onBookmarkNotesChange?: (notes: string) => void
  onViewMaintenanceInfo?: (equipmentId: string) => void
  onPrint?: () => void
  onPrintBoxLabel?: () => void
}

const SWIPE_THRESHOLD = 50
// Step 55-08：燈箱手勢參數
const ZOOM_SCALE = 2
const DIRECTION_LOCK_PX = 10
const SWIPE_CLOSE_DISTANCE = 120
const SWIPE_CLOSE_VELOCITY = 0.6 // px/ms
const DOUBLE_TAP_MS = 300
const DOUBLE_TAP_SLOP = 30

function isSafeUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch { return false }
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' })
}

function emailPrefix(email: string) {
  return email.split('@')[0]
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function CardDetailDialog({ card, open, onClose, activeStatus, isAdmin, onEdit, permissions = [], bookmarkNotes, onBookmarkNotesChange, onViewMaintenanceInfo, onPrint, onPrintBoxLabel }: Props) {
  const canEditCard = permissions.includes('create_delete_cards')
    || permissions.some(p => p.startsWith('edit_card_'))
  const allPhotos = [
    ...(card.main_photo ? [{ url: card.main_photo, label: '主圖', caption: undefined as string | undefined }] : []),
    ...card.detail_photos.filter(Boolean).map((p, i) => ({ url: p.url, label: `細節 ${i + 1}`, caption: p.caption })),
    ...(card.weight_photos ?? []).filter(Boolean).map((p, i) => ({ url: p.url, label: `淨重 ${i + 1}`, caption: undefined as string | undefined })),
  ]
  const [photoIndex, setPhotoIndex] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const [lightbox, setLightbox] = useState<{ images: { public_id: string; url: string }[]; index: number } | null>(null)
  const openLightbox = useCallback((images: { public_id: string; url: string }[], index: number) => setLightbox({ images, index }), [])

  // 使用統計埋點：Dialog 開啟時記錄一次料卡瀏覽
  useEffect(() => {
    if (open) {
      logUsageEvent('card_detail_view', { equipment_id: card.equipment_id })
    }
  }, [open, card.equipment_id])

  // Step 38：Dialog 開啟時查詢與此料號相關的維修資訊筆數，供「查看維修資訊」入口顯示/隱藏
  const [maintenanceRuleCount, setMaintenanceRuleCount] = useState(0)
  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/maintenance/rules/by-equipment?equipment_id=${encodeURIComponent(card.equipment_id)}`)
        const data = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setMaintenanceRuleCount((data.rules ?? []).length)
      } catch { /* 靜默失敗，入口維持不顯示 */ }
    })()
    return () => { cancelled = true }
  }, [open, card.equipment_id])

  const touchStartX = useRef<number | null>(null)
  const touchStartY = useRef<number | null>(null)
  const prev = () => setPhotoIndex(i => (i - 1 + allPhotos.length) % allPhotos.length)
  const next = () => setPhotoIndex(i => (i + 1) % allPhotos.length)

  function handleTouchStart(e: React.TouchEvent) {
    if (zoomed) { touchStartX.current = null; return }
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || allPhotos.length <= 1 || zoomed) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    const dy = e.changedTouches[0].clientY - (touchStartY.current ?? 0)
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) next(); else prev()
    }
    touchStartX.current = null
    touchStartY.current = null
  }

  /* ── 手機版燈箱照片左右滑（跟手拖曳＋物理回饋），只用在 MobilePhotoArea，桌機箭頭/縮圖/DesktopPhotoArea 的簡易滑動不受影響 ── */
  const mobileDragStart = useRef<{ x: number; y: number; t: number } | null>(null)
  const mobileDragDx = useRef(0)
  const mobileDragDy = useRef(0)
  const mobileDragDir = useRef<'prev' | 'next' | null>(null)
  const mobileActiveRef = useRef<HTMLDivElement>(null)
  const mobileBehindRef = useRef<HTMLDivElement>(null)
  const mobileHintLeftRef = useRef<HTMLDivElement>(null)
  const mobileHintRightRef = useRef<HTMLDivElement>(null)
  const mobileToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mobilePreviewIndex, setMobilePreviewIndex] = useState<number | null>(null)
  const [mobileToast, setMobileToast] = useState<string | null>(null)

  useEffect(() => () => { if (mobileToastTimer.current) clearTimeout(mobileToastTimer.current) }, [])

  function showMobileToast(msg: string) {
    setMobileToast(msg)
    if (mobileToastTimer.current) clearTimeout(mobileToastTimer.current)
    mobileToastTimer.current = setTimeout(() => setMobileToast(null), 900)
  }

  /* ── Step 55-08：雙擊放大＋拖曳查看、手機下滑關閉 ──
     縮放狀態放在本體（MobilePhotoArea 等是每次 render 重建的內部元件，狀態放裡面會一 re-render 就歸零）。
     拖曳移動時直接改 DOM（不觸發 re-render），位置記在 zoomPanRef，重建時從 ref 讀回。 */
  const [zoomed, setZoomed] = useState(false)
  const zoomPanRef = useRef({ x: 0, y: 0 })
  const prevZoomTransformRef = useRef('none')
  const mobileZoomLayerRef = useRef<HTMLDivElement>(null)
  const desktopZoomLayerRef = useRef<HTMLDivElement>(null)
  const zoomSourceRef = useRef<'mobile' | 'desktop'>('desktop')
  const contentRef = useRef<HTMLDivElement>(null)
  const gestureRef = useRef<{ x: number; y: number; t: number; mode: 'h' | 'v' | 'none' | null; panX: number; panY: number } | null>(null)
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null)
  const lastTouchZoomAtRef = useRef(0)
  const desktopPanRef = useRef<{ x: number; y: number; panX: number; panY: number; id: number } | null>(null)

  function zoomTransform(): string {
    return zoomed
      ? `translate(${zoomPanRef.current.x}px, ${zoomPanRef.current.y}px) scale(${ZOOM_SCALE})`
      : 'none'
  }

  function clampPan(layer: HTMLElement, x: number, y: number) {
    const w = layer.offsetWidth
    const h = layer.offsetHeight
    return {
      x: Math.min(0, Math.max(-(ZOOM_SCALE - 1) * w, x)),
      y: Math.min(0, Math.max(-(ZOOM_SCALE - 1) * h, y)),
    }
  }

  function toggleZoomAt(layer: HTMLElement | null, clientX: number, clientY: number, source: 'mobile' | 'desktop') {
    if (!layer || allPhotos.length === 0) return
    if (zoomed) { setZoomed(false); return }
    const r = layer.getBoundingClientRect()
    const cx = clientX - r.left
    const cy = clientY - r.top
    // 以點擊位置為中心放大：放大後該點維持在原位置（transform-origin 0 0）
    zoomPanRef.current = clampPan(layer, cx - ZOOM_SCALE * cx, cy - ZOOM_SCALE * cy)
    zoomSourceRef.current = source
    setZoomed(true)
  }

  function applyPan(layer: HTMLElement | null, x: number, y: number) {
    if (!layer) return
    zoomPanRef.current = clampPan(layer, x, y)
    layer.style.transition = 'none'
    layer.style.transform = `translate(${zoomPanRef.current.x}px, ${zoomPanRef.current.y}px) scale(${ZOOM_SCALE})`
  }

  // 換照片、關閉、換卡片、切換視窗大小時自動縮回（直接縮回，不播放從 2 倍縮回的過場，
  // 否則放大中按箭頭換照片時，新照片會先以 2 倍出現再縮回）
  const zoomedRef = useRef(false)
  zoomedRef.current = zoomed
  const skipZoomAnimRef = useRef(false)
  useEffect(() => {
    if (zoomedRef.current) skipZoomAnimRef.current = true
    setZoomed(false)
    zoomPanRef.current = { x: 0, y: 0 }
  }, [photoIndex, open, card.equipment_id, expanded])

  // 縮放切換的過場（內部照片區每次 render 都是新元素，CSS transition 不會生效，改用 WAAPI）
  useLayoutEffect(() => {
    const to = zoomTransform()
    const from = prevZoomTransformRef.current
    prevZoomTransformRef.current = to
    if (skipZoomAnimRef.current) { skipZoomAnimRef.current = false; return }
    if (from === to || prefersReducedMotion()) return
    const layer = zoomSourceRef.current === 'mobile' ? mobileZoomLayerRef.current : desktopZoomLayerRef.current
    if (!layer || typeof layer.animate !== 'function') return
    layer.animate([{ transform: from }, { transform: to }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed])

  function canSwipeToClose() {
    return !zoomed && !expanded && (contentRef.current?.scrollTop ?? 0) <= 0
  }

  function setDialogDrag(dy: number, withTransition: boolean) {
    const content = contentRef.current
    if (!content) return
    const prevEl = content.previousElementSibling as HTMLElement | null
    // shadcn DialogContent 的前一個兄弟節點就是遮罩（DialogOverlay），兩者都帶 data-state
    const overlay = prevEl?.hasAttribute('data-state') ? prevEl : null
    const d = Math.max(0, dy)
    if (withTransition && prefersReducedMotion()) withTransition = false
    content.style.transition = withTransition ? 'transform .25s cubic-bezier(.2,.8,.2,1)' : 'none'
    content.style.transform = d > 0 ? `translate(-50%, calc(-50% + ${d}px))` : ''
    if (overlay) {
      overlay.style.transition = withTransition ? 'opacity .25s' : 'none'
      overlay.style.opacity = d > 0 ? String(Math.max(0.25, 1 - d / 400)) : ''
    }
    if (d === 0) {
      // 彈回後把 inline transition 拿掉，還給原本 className 的 transition（放大／縮小視窗的過場）
      setTimeout(() => {
        if (contentRef.current === content && !content.style.transform) content.style.transition = ''
        if (overlay) overlay.style.transition = ''
      }, 300)
    }
  }

  function closeBySwipe() {
    const content = contentRef.current
    const prevEl = content?.previousElementSibling as HTMLElement | null | undefined
    const overlay = prevEl?.hasAttribute('data-state') ? prevEl : null
    if (!content || prefersReducedMotion()) { onClose(); return }
    content.style.transition = 'transform .2s ease-in'
    content.style.transform = 'translate(-50%, calc(-50% + 100vh))'
    if (overlay) { overlay.style.transition = 'opacity .2s'; overlay.style.opacity = '0' }
    setTimeout(() => {
      // 已經滑出畫面：關掉 shadcn 的關閉動畫（否則會從 +100vh 往上飄回中央再淡出），直接消失
      content.style.animation = 'none'
      content.style.opacity = '0'
      if (overlay) { overlay.style.animation = 'none'; overlay.style.opacity = '0' }
      onClose()
    }, 180)
  }

  /* 手機照片區的統一觸控入口：方向鎖定 10px 後分流
     - 放大中：單指拖曳移動查看
     - 水平：交給既有換照片邏輯（handleMobileTouch*，行為不變）
     - 垂直往下且內容捲在最上面、未放大：下滑關閉 */
  function onMobileGestureStart(e: React.TouchEvent) {
    if (e.touches.length > 1) { gestureRef.current = null; return }
    const t = e.touches[0]
    gestureRef.current = { x: t.clientX, y: t.clientY, t: performance.now(), mode: null, panX: zoomPanRef.current.x, panY: zoomPanRef.current.y }
    if (zoomed) return
    handleMobileTouchStart(e)
  }

  function onMobileGestureMove(e: React.TouchEvent) {
    const g = gestureRef.current
    if (!g || e.touches.length > 1) return
    const dx = e.touches[0].clientX - g.x
    const dy = e.touches[0].clientY - g.y
    if (zoomed) {
      if (g.mode === null && Math.hypot(dx, dy) < DIRECTION_LOCK_PX) return
      g.mode = 'none'
      applyPan(mobileZoomLayerRef.current, g.panX + dx, g.panY + dy)
      return
    }
    if (g.mode === null) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return
      if (Math.abs(dx) > Math.abs(dy)) {
        g.mode = 'h'
      } else if (dy > 0 && canSwipeToClose()) {
        g.mode = 'v'
        mobileDragStart.current = null
      } else {
        g.mode = 'none'
        mobileDragStart.current = null
      }
    }
    if (g.mode === 'h') handleMobileTouchMove(e)
    else if (g.mode === 'v') setDialogDrag(dy, false)
  }

  function onMobileGestureEnd(e: React.TouchEvent) {
    const g = gestureRef.current
    gestureRef.current = null
    if (!g) return
    const touch = e.changedTouches[0]
    const dy = touch.clientY - g.y
    const elapsed = Math.max(1, performance.now() - g.t)
    if (g.mode === 'h') { handleMobileTouchEnd(); return }
    if (g.mode === 'v') {
      if (dy > SWIPE_CLOSE_DISTANCE || (dy > 30 && dy / elapsed > SWIPE_CLOSE_VELOCITY)) closeBySwipe()
      else setDialogDrag(0, true)
      return
    }
    if (g.mode === null) {
      // 沒有移動：判斷是否為雙點（點在箭頭等按鈕上不算）
      mobileDragStart.current = null
      if ((e.target as HTMLElement).closest('button')) { lastTapRef.current = null; return }
      const now = performance.now()
      const last = lastTapRef.current
      if (last && now - last.t < DOUBLE_TAP_MS && Math.hypot(touch.clientX - last.x, touch.clientY - last.y) < DOUBLE_TAP_SLOP) {
        lastTapRef.current = null
        lastTouchZoomAtRef.current = now
        toggleZoomAt(mobileZoomLayerRef.current, touch.clientX, touch.clientY, 'mobile')
      } else {
        lastTapRef.current = { t: now, x: touch.clientX, y: touch.clientY }
      }
    }
  }

  function onMobileGestureCancel() {
    const g = gestureRef.current
    gestureRef.current = null
    if (g?.mode === 'v') setDialogDrag(0, true)
    else if (g?.mode === 'h') handleMobileTouchEnd()
    else mobileDragStart.current = null
  }

  /* 桌機照片區：雙擊放大、放大後按住拖曳移動 */
  function onDesktopDoubleClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    // 觸控裝置的雙點已在觸控事件處理過，避免同一下又被 dblclick 切回去
    if (performance.now() - lastTouchZoomAtRef.current < 500) return
    e.preventDefault()
    toggleZoomAt(desktopZoomLayerRef.current, e.clientX, e.clientY, 'desktop')
  }

  function onDesktopPointerDown(e: React.PointerEvent) {
    if (!zoomed || e.pointerType === 'touch' || e.button !== 0) return
    if ((e.target as HTMLElement).closest('button')) return
    desktopPanRef.current = { x: e.clientX, y: e.clientY, panX: zoomPanRef.current.x, panY: zoomPanRef.current.y, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    e.preventDefault()
  }

  function onDesktopPointerMove(e: React.PointerEvent) {
    const p = desktopPanRef.current
    if (!p || p.id !== e.pointerId) return
    applyPan(desktopZoomLayerRef.current, p.panX + e.clientX - p.x, p.panY + e.clientY - p.y)
  }

  function onDesktopPointerUp(e: React.PointerEvent) {
    const p = desktopPanRef.current
    if (!p || p.id !== e.pointerId) return
    desktopPanRef.current = null
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  function handleMobileTouchStart(e: React.TouchEvent) {
    if (allPhotos.length <= 1) return
    mobileDragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
    mobileDragDx.current = 0
    mobileDragDy.current = 0
    mobileDragDir.current = null
    if (mobileActiveRef.current) mobileActiveRef.current.style.transition = 'none'
  }

  function handleMobileTouchMove(e: React.TouchEvent) {
    if (!mobileDragStart.current || allPhotos.length <= 1) return
    const dx = e.touches[0].clientX - mobileDragStart.current.x
    const dy = e.touches[0].clientY - mobileDragStart.current.y
    mobileDragDx.current = dx
    mobileDragDy.current = dy
    const dir: 'prev' | 'next' = dx < 0 ? 'next' : 'prev'
    if (dir !== mobileDragDir.current) {
      mobileDragDir.current = dir
      const targetIdx = dir === 'next' ? photoIndex + 1 : photoIndex - 1
      setMobilePreviewIndex(targetIdx >= 0 && targetIdx < allPhotos.length ? targetIdx : null)
    }
    const active = mobileActiveRef.current
    const behind = mobileBehindRef.current
    const hintL = mobileHintLeftRef.current
    const hintR = mobileHintRightRef.current
    const fadeFrac = Math.min(1, Math.abs(dx) / 160)
    if (active) {
      active.style.transform = `translate(${dx}px, ${dy * 0.35}px) rotate(${dx / 18}deg)`
      active.style.opacity = String(1 - 0.65 * fadeFrac)
    }
    const atBoundary = (dir === 'next' && photoIndex === allPhotos.length - 1) || (dir === 'prev' && photoIndex === 0)
    if (behind) {
      behind.style.transition = 'none'
      behind.style.opacity = atBoundary ? '0' : '1'
    }
    const hintFrac = Math.min(1, Math.abs(dx) / 120)
    if (hintL) hintL.style.opacity = dir === 'prev' ? String(hintFrac) : '0'
    if (hintR) hintR.style.opacity = dir === 'next' ? String(hintFrac) : '0'
  }

  function springBackMobilePhoto() {
    const active = mobileActiveRef.current
    const behind = mobileBehindRef.current
    if (active) {
      active.style.transition = 'transform .32s cubic-bezier(.2,1.2,.4,1), opacity .32s cubic-bezier(.2,1.2,.4,1)'
      active.style.transform = 'translate(0px,0px) rotate(0deg)'
      active.style.opacity = '1'
    }
    if (behind) {
      behind.style.transition = 'opacity .2s'
      behind.style.opacity = '0'
    }
    setTimeout(() => setMobilePreviewIndex(null), 200)
  }

  function bounceMobileBoundary(dir: 'prev' | 'next') {
    const active = mobileActiveRef.current
    const behind = mobileBehindRef.current
    const bounceX = dir === 'next' ? -14 : 14
    if (active) {
      active.style.transition = 'transform .12s ease-out'
      active.style.transform = `translate(${bounceX}px,0px) rotate(${bounceX / 18}deg)`
      active.style.opacity = '1'
    }
    if (behind) {
      behind.style.transition = 'opacity .15s'
      behind.style.opacity = '0'
    }
    setTimeout(() => {
      if (active) {
        active.style.transition = 'transform .28s cubic-bezier(.2,1.2,.4,1)'
        active.style.transform = 'translate(0px,0px) rotate(0deg)'
      }
    }, 120)
    setTimeout(() => setMobilePreviewIndex(null), 200)
    showMobileToast(dir === 'next' ? '已經是最後一張' : '已經是第一張')
  }

  function flyOffMobilePhoto(dir: 'prev' | 'next', targetIdx: number, dy: number) {
    const active = mobileActiveRef.current
    const behind = mobileBehindRef.current
    const stageWidth = active?.clientWidth ?? 320
    const flyX = (dir === 'next' ? -1 : 1) * (stageWidth * 1.3)
    const rot = dir === 'next' ? -18 : 18
    if (active) {
      active.style.transition = 'transform .22s ease-in, opacity .22s ease-in'
      active.style.transform = `translate(${flyX}px, ${dy * 0.35}px) rotate(${rot}deg)`
      active.style.opacity = '0'
    }
    if (behind) {
      behind.style.transition = 'transform .22s ease-out, filter .22s ease-out'
      behind.style.transform = 'scale(1) translateY(0px)'
      behind.style.filter = 'brightness(1)'
    }
    setTimeout(() => {
      setPhotoIndex(targetIdx)
      setMobilePreviewIndex(null)
      if (active) {
        active.style.transition = 'none'
        active.style.transform = 'translate(0px,0px) rotate(0deg)'
        active.style.opacity = '1'
      }
      if (behind) {
        behind.style.transition = 'none'
        behind.style.transform = 'scale(.94) translateY(10px)'
        behind.style.filter = 'brightness(.85)'
        behind.style.opacity = '0'
      }
    }, 220)
  }

  function handleMobileTouchEnd() {
    if (!mobileDragStart.current || allPhotos.length <= 1) { mobileDragStart.current = null; return }
    const dx = mobileDragDx.current
    const dy = mobileDragDy.current
    const elapsed = Math.max(1, performance.now() - mobileDragStart.current.t)
    const velocity = Math.abs(dx) / elapsed
    const stageWidth = mobileActiveRef.current?.clientWidth ?? 320
    const thresholdPx = Math.min(stageWidth * 0.22, 120)
    const dir: 'prev' | 'next' = dx < 0 ? 'next' : 'prev'
    const passedThreshold = Math.abs(dx) > thresholdPx || velocity > 0.55
    const targetIdx = dir === 'next' ? photoIndex + 1 : photoIndex - 1
    const inBounds = targetIdx >= 0 && targetIdx < allPhotos.length

    if (mobileHintLeftRef.current) { mobileHintLeftRef.current.style.transition = 'opacity .2s'; mobileHintLeftRef.current.style.opacity = '0' }
    if (mobileHintRightRef.current) { mobileHintRightRef.current.style.transition = 'opacity .2s'; mobileHintRightRef.current.style.opacity = '0' }

    if (passedThreshold && inBounds) {
      flyOffMobilePhoto(dir, targetIdx, dy)
    } else if (passedThreshold && !inBounds) {
      bounceMobileBoundary(dir)
    } else {
      springBackMobilePhoto()
    }
    mobileDragStart.current = null
  }

  /* ── 照片內容（共用） ── */
  function PhotoContent({ sizes, zoomLayerRef }: { sizes: string; zoomLayerRef: React.RefObject<HTMLDivElement> }) {
    if (allPhotos.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[#c49a72]">
          <ImageOff className="h-12 w-12" />
        </div>
      )
    }
    return (
      <>
        <div
          ref={zoomLayerRef}
          className="absolute inset-0"
          style={{ transform: zoomTransform(), transformOrigin: '0 0' }}
        >
          <Image
            key={allPhotos[photoIndex].url}
            src={allPhotos[photoIndex].url}
            alt={card.name}
            fill
            sizes={sizes}
            className="object-contain"
            priority
            draggable={false}
          />
        </div>
        {allPhotos.length > 1 && (
          <>
            <button onClick={prev} className="absolute left-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.45)] hover:bg-[rgba(44,30,18,.7)] text-white rounded-full p-2 transition-colors shadow">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={next} className="absolute right-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.45)] hover:bg-[rgba(44,30,18,.7)] text-white rounded-full p-2 transition-colors shadow">
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
        <span className="absolute top-3 left-3 bg-[rgba(44,30,18,.55)] text-[#f2ebe0] text-xs px-2 py-0.5 rounded-full pointer-events-none">
          {allPhotos[photoIndex].label}（{photoIndex + 1}/{allPhotos.length}）
        </span>
      </>
    )
  }

  /* ── 手機照片區：padding-bottom 自適應比例，左右滑跟手拖曳＋物理回饋 ── */
  function MobilePhotoArea() {
    return (
      <div
        className="bg-[#f2ebe0] w-full relative overflow-hidden"
        style={{ paddingBottom: '80%' }}
      >
        {mobilePreviewIndex !== null && (
          <div
            ref={mobileBehindRef}
            className="absolute inset-0 pointer-events-none"
            style={{ transform: 'scale(.94) translateY(10px)', filter: 'brightness(.85)', opacity: 0 }}
          >
            <Image src={allPhotos[mobilePreviewIndex].url} alt="" fill sizes="100vw" className="object-contain" />
          </div>
        )}
        <div
          ref={mobileActiveRef}
          className="absolute inset-0 select-none"
          style={{ touchAction: zoomed ? 'none' : 'pan-y' }}
          onTouchStart={onMobileGestureStart}
          onTouchMove={onMobileGestureMove}
          onTouchEnd={onMobileGestureEnd}
          onTouchCancel={onMobileGestureCancel}
        >
          <PhotoContent sizes="100vw" zoomLayerRef={mobileZoomLayerRef} />
        </div>
        {allPhotos.length > 1 && (
          <>
            <div
              ref={mobileHintLeftRef}
              className="absolute left-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.6)] text-white text-xs font-medium px-2.5 py-1 rounded-full pointer-events-none"
              style={{ opacity: 0 }}
            >
              ‹ 上一張
            </div>
            <div
              ref={mobileHintRightRef}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-[rgba(44,30,18,.6)] text-white text-xs font-medium px-2.5 py-1 rounded-full pointer-events-none"
              style={{ opacity: 0 }}
            >
              下一張 ›
            </div>
          </>
        )}
        {mobileToast && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 bg-[rgba(44,30,18,.8)] text-white text-xs px-3 py-1 rounded-full pointer-events-none whitespace-nowrap">
            {mobileToast}
          </div>
        )}
      </div>
    )
  }

  /* ── 桌機照片區：flex-1 填滿 ── */
  function DesktopPhotoArea() {
    return (
      <div
        className={`relative flex-1 overflow-hidden select-none ${allPhotos.length > 0 ? (zoomed ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in') : ''}`}
        style={{ minHeight: '200px', touchAction: zoomed ? 'none' : 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onDoubleClick={onDesktopDoubleClick}
        onPointerDown={onDesktopPointerDown}
        onPointerMove={onDesktopPointerMove}
        onPointerUp={onDesktopPointerUp}
        onPointerCancel={onDesktopPointerUp}
      >
        <PhotoContent sizes="(max-width: 768px) 100vw, 500px" zoomLayerRef={desktopZoomLayerRef} />
      </div>
    )
  }

  /* ── 縮圖列：左(上一張)、中(當前)、右(下一張)，跟隨主圖連動 ── */
  function ThumbnailStrip() {
    if (allPhotos.length <= 1) return null
    const len = allPhotos.length
    const indices = len === 2
      ? [0, 1]
      : [(photoIndex - 1 + len) % len, photoIndex, (photoIndex + 1) % len]
    return (
      <div className="flex justify-center gap-2 px-3 py-1.5 bg-[#e8ddd0] flex-shrink-0 border-t border-[rgba(122,82,48,.15)]">
        {indices.map(idx => (
          <button key={idx} onClick={() => setPhotoIndex(idx)}
            className={`relative h-14 w-14 rounded overflow-hidden border-2 transition-all flex-shrink-0 ${
              idx === photoIndex
                ? 'border-[#c49a72] shadow-[0_0_8px_rgba(196,154,114,.6)] scale-[1.05]'
                : 'border-transparent opacity-55 hover:opacity-85'
            }`}>
            <Image src={allPhotos[idx].url} alt="" fill sizes="56px" className="object-cover" />
          </button>
        ))}
      </div>
    )
  }

  return (
    <>
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      {/* 手機：overflow-y-auto 可上下捲動；桌機：overflow-hidden 固定高 */}
      <DialogContent ref={contentRef} className={`w-full p-0 transition-all duration-200 ${
        expanded
          ? 'max-w-[min(90vh,90vw)] overflow-hidden'
          : 'max-w-5xl overflow-x-hidden overflow-y-auto max-h-[92vh] md:overflow-hidden md:max-h-none'
      }`}>

        {/* 編輯按鈕（有編輯權限） */}
        {canEditCard && onEdit && (
          <button
            onClick={onEdit}
            className="absolute top-3 right-[4.75rem] z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
            aria-label="編輯料卡"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}

        {/* 列印按鈕（有列印權限才傳 onPrint）：有編輯鈕時在其左側，否則佔編輯鈕位置 */}
        {onPrint && (
          <button
            onClick={onPrint}
            className={`absolute top-3 ${canEditCard && onEdit ? 'right-[7.25rem]' : 'right-[4.75rem]'} z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity`}
            aria-label="列印料卡"
            title="列印料卡"
          >
            <Printer className="h-4 w-4" />
          </button>
        )}

        {/* 封箱標籤按鈕（有列印權限才傳 onPrintBoxLabel）：排在列印按鈕左側，沒有列印鈕時佔其位置 */}
        {onPrintBoxLabel && (
          <button
            onClick={onPrintBoxLabel}
            style={{ right: `${(canEditCard && onEdit ? 7.25 : 4.75) + (onPrint ? 2.5 : 0)}rem` }}
            className="absolute top-3 z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
            aria-label="列印封箱標籤"
            title="列印封箱標籤"
          >
            <Package className="h-4 w-4" />
          </button>
        )}

        {/* 放大／縮小按鈕 */}
        <button
          onClick={() => setExpanded(v => !v)}
          className="absolute top-3 right-11 z-50 rounded-full bg-[#fff9f4]/90 backdrop-blur-sm p-1.5 shadow text-[#a08060] opacity-90 hover:opacity-100 hover:text-[#7a5230] transition-opacity"
          aria-label={expanded ? '縮小視窗' : '放大視窗'}
        >
          {expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>

        {expanded ? (
          /* ── 放大模式 ── */
          <div className="bg-[#f2ebe0] flex flex-col" style={{ height: 'min(90vh, 90vw)' }}>
            <DesktopPhotoArea />
            <div className="bg-[#e8ddd0] px-4 py-3 border-t border-[rgba(122,82,48,.2)] text-center flex-shrink-0">
              <p className="text-xs text-[#a08060] font-mono leading-none">{card.equipment_id}</p>
              <p className="text-base font-bold text-[#5a3820] mt-1 leading-snug">{card.name}</p>
            </div>
          </div>
        ) : (
          <>
            {/* ── 手機版：上下流動 ── */}
            <div className="md:hidden flex flex-col">
              <MobilePhotoArea />
              <div className="px-4 pt-3 pb-2 border-b border-[rgba(122,82,48,.12)]">
                <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                <p className="text-sm font-bold text-[#5a3820] mt-0.5 leading-snug">{card.name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.12)] text-[#7a5230] border border-[rgba(122,82,48,.25)]">
                    {card.status}
                  </span>
                  {card.category && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                      {card.category}
                    </span>
                  )}
                  {permissions.includes('read_vendor') && card.vendor && (
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">{card.vendor}</span>
                  )}
                </div>
              </div>
              <div className="px-4 py-2 space-y-2">
                {allPhotos[photoIndex]?.caption && (
                  <div className="bg-[rgba(44,30,18,.38)] text-[#f2ebe0] text-xs px-3 py-2 rounded-lg leading-relaxed">
                    <span className="opacity-70 mr-1">{allPhotos[photoIndex].label} 說明：</span>
                    {allPhotos[photoIndex].caption}
                  </div>
                )}
                {permissions.includes('read_tags') && card.tags.length > 0 && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">標籤</p>
                    <div className="flex flex-wrap gap-1">
                      {card.tags.map(tag => (
                        <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {onBookmarkNotesChange && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">⭐ 個人備註 <span className="text-[10px]">（只有你看得到）</span></p>
                    <textarea
                      value={bookmarkNotes ?? ''}
                      onChange={e => onBookmarkNotesChange(e.target.value)}
                      rows={6}
                      placeholder="記錄你的私人備忘…"
                      className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                    />
                  </div>
                )}
                {permissions.includes('read_notes') && (card.notes || (card.notes_image_urls ?? []).length > 0 || card.notes_table_data) && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">備註</p>
                    <RichContentView
                      content={card.notes}
                      images={card.notes_image_urls ?? []}
                      table={card.notes_table_data ?? null}
                      onImageClick={openLightbox}
                    />
                  </div>
                )}
                {permissions.includes('read_weight') && card.net_weight != null && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">淨重</p>
                    <p className="text-sm text-[#4a3422]">{card.net_weight} kg</p>
                  </div>
                )}
                {permissions.includes('read_documents') && card.documents?.length > 0 && (
                  <div>
                    <p className="text-xs text-[#a08060] mb-1">文件</p>
                    <div className="flex flex-col gap-1.5">
                      {card.documents.map((doc, i) => (
                        <a key={i} href={isSafeUrl(doc.url) ? doc.url : '#'} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-2 text-xs text-[#5a3820] hover:text-[#7a5230] group">
                          <FileText className="h-3.5 w-3.5 flex-shrink-0 text-[#a08060] group-hover:text-[#7a5230]" />
                          <span className="flex-1 leading-snug">{doc.name}</span>
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                            doc.type === 'spec' || doc.type === '規格書' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                            : doc.type === 'contract' || doc.type === '合約書' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                            : 'bg-[rgba(156,107,66,.08)] text-[#9c6b42] border border-[rgba(156,107,66,.25)]'
                          }`}>
                            {doc.type === 'spec' ? '規格書' : doc.type === 'contract' ? '合約書' : doc.type === 'other' ? '其他' : doc.type}
                          </span>
                          <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
                {maintenanceRuleCount > 0 && onViewMaintenanceInfo && (
                  <button
                    onClick={() => onViewMaintenanceInfo(card.equipment_id)}
                    className="flex items-center gap-1.5 text-xs text-[#7a5230] hover:text-[#9c6b42] transition-colors"
                  >
                    <Wrench className="h-3.5 w-3.5" />
                    查看維修資訊（{maintenanceRuleCount} 筆與此料號相關）
                  </button>
                )}
                <div className="pt-1 border-t border-[rgba(122,82,48,.1)] space-y-0.5">
                  {permissions.includes('read_created_at') && (
                    <p className="text-xs text-[#b0967a]">新增時間：{fmtDate(card.created_at)}</p>
                  )}
                  {permissions.includes('read_updated_at') && (
                    <p className="text-xs text-[#b0967a]">最後更新：{fmtDate(card.updated_at)}</p>
                  )}
                  {permissions.includes('read_updated_by') && card.updated_by && (
                    <p className="text-xs text-[#b0967a]">更新人員：{emailPrefix(card.updated_by)}</p>
                  )}
                  {permissions.includes('read_updated_content') && card.updated_fields && card.updated_fields.length > 0 && (
                    <p className="text-xs text-[#b0967a]">更新內容：{card.updated_fields.join('、')}</p>
                  )}
                </div>
              </div>
              <ThumbnailStrip />
            </div>

            {/* ── 桌機版：左右並排 ── */}
            <div className="hidden md:flex flex-row h-[min(85vh,680px)]">
              <div className="bg-[#f2ebe0] w-3/5 flex-shrink-0 flex flex-col">
                <DesktopPhotoArea />
              </div>
              <div className="flex flex-col flex-1 overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto">
                  <DialogHeader className="px-5 pt-5 pb-3 border-b border-[rgba(122,82,48,.12)] pr-14">
                    <p className="text-xs text-[#a08060] font-mono">{card.equipment_id}</p>
                    <DialogTitle className="text-base font-bold text-[#5a3820] mt-0.5 leading-snug">
                      {card.name}
                    </DialogTitle>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.12)] text-[#7a5230] border border-[rgba(122,82,48,.25)]">
                        {card.status}
                      </span>
                      {card.category && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">
                          {card.category}
                        </span>
                      )}
                      {permissions.includes('read_vendor') && card.vendor && (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.1)] text-[#7a5230] border border-[rgba(122,82,48,.2)]">{card.vendor}</span>
                      )}
                    </div>
                  </DialogHeader>
                  <div className="px-5 py-4 space-y-4">
                    {allPhotos[photoIndex]?.caption && (
                      <div className="bg-[rgba(44,30,18,.38)] text-[#f2ebe0] text-xs px-3 py-2 rounded-lg leading-relaxed">
                        <span className="opacity-70 mr-1">{allPhotos[photoIndex].label} 說明：</span>
                        {allPhotos[photoIndex].caption}
                      </div>
                    )}
                    {permissions.includes('read_tags') && card.tags.length > 0 && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1.5">標籤</p>
                        <div className="flex flex-wrap gap-1.5">
                          {card.tags.map(tag => (
                            <span key={tag} className="px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.18)]">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    {onBookmarkNotesChange && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">⭐ 個人備註 <span className="text-[10px]">（只有你看得到）</span></p>
                        <textarea
                          value={bookmarkNotes ?? ''}
                          onChange={e => onBookmarkNotesChange(e.target.value)}
                          rows={6}
                          placeholder="記錄你的私人備忘…"
                          className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all resize-none"
                        />
                      </div>
                    )}
                    {permissions.includes('read_notes') && (card.notes || (card.notes_image_urls ?? []).length > 0 || card.notes_table_data) && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">備註</p>
                        <RichContentView
                          content={card.notes}
                          images={card.notes_image_urls ?? []}
                          table={card.notes_table_data ?? null}
                          onImageClick={openLightbox}
                        />
                      </div>
                    )}
                    {permissions.includes('read_weight') && card.net_weight != null && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">淨重</p>
                        <p className="text-sm text-[#4a3422]">{card.net_weight} kg</p>
                      </div>
                    )}
                    {permissions.includes('read_documents') && card.documents?.length > 0 && (
                      <div>
                        <p className="text-xs text-[#a08060] mb-1">文件</p>
                        <div className="flex flex-col gap-2">
                          {card.documents.map((doc, i) => (
                            <a key={i} href={isSafeUrl(doc.url) ? doc.url : '#'} target="_blank" rel="noopener noreferrer"
                              className="flex items-center gap-2 text-sm text-[#5a3820] hover:text-[#7a5230] group">
                              <FileText className="h-4 w-4 flex-shrink-0 text-[#a08060] group-hover:text-[#7a5230]" />
                              <span className="flex-1 leading-snug">{doc.name}</span>
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${
                                doc.type === 'spec' || doc.type === '規格書' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                                : doc.type === 'contract' || doc.type === '合約書' ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] border border-[rgba(122,82,48,.2)]'
                                : 'bg-[rgba(156,107,66,.08)] text-[#9c6b42] border border-[rgba(156,107,66,.25)]'
                              }`}>
                                {doc.type === 'spec' ? '規格書' : doc.type === 'contract' ? '合約書' : doc.type === 'other' ? '其他' : doc.type}
                              </span>
                              <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-50 group-hover:opacity-100" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {maintenanceRuleCount > 0 && onViewMaintenanceInfo && (
                      <button
                        onClick={() => onViewMaintenanceInfo(card.equipment_id)}
                        className="flex items-center gap-1.5 text-sm text-[#7a5230] hover:text-[#9c6b42] transition-colors"
                      >
                        <Wrench className="h-4 w-4" />
                        查看維修資訊（{maintenanceRuleCount} 筆與此料號相關）
                      </button>
                    )}
                    <div className="pt-2 border-t border-[rgba(122,82,48,.1)] space-y-0.5">
                      {permissions.includes('read_created_at') && (
                        <p className="text-xs text-[#b0967a]">新增時間：{fmtDate(card.created_at)}</p>
                      )}
                      {permissions.includes('read_updated_at') && (
                        <p className="text-xs text-[#b0967a]">最後更新：{fmtDate(card.updated_at)}</p>
                      )}
                      {permissions.includes('read_updated_by') && card.updated_by && (
                        <p className="text-xs text-[#b0967a]">更新人員：{emailPrefix(card.updated_by)}</p>
                      )}
                      {permissions.includes('read_updated_content') && card.updated_fields && card.updated_fields.length > 0 && (
                        <p className="text-xs text-[#b0967a]">更新內容：{card.updated_fields.join('、')}</p>
                      )}
                    </div>
                  </div>
                </div>
                <ThumbnailStrip />
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
    {lightbox && (
      <UpdateImageLightbox
        images={lightbox.images}
        index={lightbox.index}
        onIndexChange={i => setLightbox(prev => prev ? { ...prev, index: i } : prev)}
        onClose={() => setLightbox(null)}
      />
    )}
    </>
  )
}
