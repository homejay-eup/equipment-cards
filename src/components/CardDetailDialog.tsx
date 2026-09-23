'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { EquipmentCard } from '@/types/equipment'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ChevronLeft, ChevronRight, ImageOff, Maximize2, Minimize2, Pencil, FileText, ExternalLink, Wrench } from 'lucide-react'
import { logUsageEvent } from '@/lib/analyticsClient'
import RichContentView from '@/components/tracker/RichContentView'
import UpdateImageLightbox from '@/components/UpdateImageLightbox'

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
}

const SWIPE_THRESHOLD = 50

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
export default function CardDetailDialog({ card, open, onClose, activeStatus, isAdmin, onEdit, permissions = [], bookmarkNotes, onBookmarkNotesChange, onViewMaintenanceInfo }: Props) {
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
    touchStartX.current = e.touches[0].clientX
    touchStartY.current = e.touches[0].clientY
  }

  function handleTouchEnd(e: React.TouchEvent) {
    if (touchStartX.current === null || allPhotos.length <= 1) return
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
  const mobileStageWidth = useRef(320)
  const mobileActiveRef = useRef<HTMLDivElement>(null)
  const mobileBehindRef = useRef<HTMLDivElement>(null)
  const mobileHintLeftRef = useRef<HTMLDivElement>(null)
  const mobileHintRightRef = useRef<HTMLDivElement>(null)
  const mobileToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [mobilePreviewIndex, setMobilePreviewIndex] = useState<number | null>(null)
  const [mobileToast, setMobileToast] = useState<string | null>(null)

  useEffect(() => () => {
    if (mobileToastTimer.current) clearTimeout(mobileToastTimer.current)
  }, [])

  function showMobileToast(msg: string) {
    setMobileToast(msg)
    if (mobileToastTimer.current) clearTimeout(mobileToastTimer.current)
    mobileToastTimer.current = setTimeout(() => setMobileToast(null), 900)
  }

  function setMobileWillChange(v: string) {
    if (mobileActiveRef.current) mobileActiveRef.current.style.willChange = v
    if (mobileBehindRef.current) mobileBehindRef.current.style.willChange = v === 'auto' ? 'auto' : 'transform, opacity, filter'
  }

  function handleMobileTouchStart(e: React.TouchEvent) {
    if (allPhotos.length <= 1) return
    mobileDragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: performance.now() }
    mobileDragDx.current = 0
    mobileDragDy.current = 0
    mobileDragDir.current = null
    mobileStageWidth.current = mobileActiveRef.current?.clientWidth ?? 320
    if (mobileActiveRef.current) mobileActiveRef.current.style.transition = 'none'
    if (mobileBehindRef.current) mobileBehindRef.current.style.transition = 'none'
    setMobileWillChange('transform, opacity, filter')
  }

  /* 直接同步更新 style，不透過 requestAnimationFrame 批次處理：
     實測發現 rAF 批次會讓跟手拖曳多一點延遲感，比不上一開始「觸控事件
     來一次就直接寫 style」的即時感，改回同步寫法。 */
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
    if (behind) behind.style.opacity = atBoundary ? '0' : '1'
    const hintFrac = Math.min(1, Math.abs(dx) / 120)
    if (hintL) hintL.style.opacity = dir === 'prev' ? String(hintFrac) : '0'
    if (hintR) hintR.style.opacity = dir === 'next' ? String(hintFrac) : '0'
  }

  /* 保險：手勢被系統中途取消（touchcancel）時也要收尾，避免卡片凍結在拖曳中途的位置 */
  function handleMobileTouchCancel() {
    if (!mobileDragStart.current) return
    mobileDragStart.current = null
    if (mobileHintLeftRef.current) mobileHintLeftRef.current.style.opacity = '0'
    if (mobileHintRightRef.current) mobileHintRightRef.current.style.opacity = '0'
    springBackMobilePhoto()
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
    setTimeout(() => {
      setMobilePreviewIndex(null)
      setMobileWillChange('auto')
    }, 320)
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
    setTimeout(() => {
      setMobilePreviewIndex(null)
      setMobileWillChange('auto')
    }, 320)
    showMobileToast(dir === 'next' ? '已經是最後一張' : '已經是第一張')
  }

  function flyOffMobilePhoto(dir: 'prev' | 'next', targetIdx: number, dy: number) {
    const active = mobileActiveRef.current
    const behind = mobileBehindRef.current
    const flyX = (dir === 'next' ? -1 : 1) * (mobileStageWidth.current * 1.3)
    const rot = dir === 'next' ? -18 : 18
    let committed = false
    const commit = () => {
      if (committed) return
      committed = true
      // 先換 photoIndex，但先不動 active/behind 的樣式：這時候「新照片」還是靠
      // behind 這層在畫面上（已經是全尺寸全不透明），active 裡還沒被 React 換成新照片。
      // 等兩個 rAF、確定新照片已經畫出來了，才把 active 收回中間定位、behind 收掉，
      // 不然舊照片會在這個空檔被 active 蓋回去，變成一閃。
      setPhotoIndex(targetIdx)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (active) {
            active.style.transition = 'none'
            active.style.transform = 'translate(0px,0px) rotate(0deg)'
            active.style.opacity = '1'
            active.style.willChange = 'auto'
          }
          setMobilePreviewIndex(null)
          if (behind) {
            behind.style.transition = 'none'
            behind.style.transform = 'scale(.94) translateY(10px)'
            behind.style.filter = 'brightness(.85)'
            behind.style.opacity = '0'
            behind.style.willChange = 'auto'
          }
        })
      })
    }
    if (active) {
      active.style.transition = 'transform .22s ease-in, opacity .22s ease-in'
      active.style.transform = `translate(${flyX}px, ${dy * 0.35}px) rotate(${rot}deg)`
      active.style.opacity = '0'
      active.addEventListener('transitionend', commit, { once: true })
    }
    if (behind) {
      behind.style.transition = 'transform .22s ease-out, filter .22s ease-out'
      behind.style.transform = 'scale(1) translateY(0px)'
      behind.style.filter = 'brightness(1)'
    }
    // 保險：萬一 transitionend 沒觸發（例如系統關閉動畫效果），還是要換張
    setTimeout(commit, 280)
  }

  function handleMobileTouchEnd() {
    if (!mobileDragStart.current || allPhotos.length <= 1) { mobileDragStart.current = null; return }
    const dx = mobileDragDx.current
    const dy = mobileDragDy.current
    const elapsed = Math.max(1, performance.now() - mobileDragStart.current.t)
    const velocity = Math.abs(dx) / elapsed
    const thresholdPx = Math.min(mobileStageWidth.current * 0.22, 120)
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
  function PhotoContent({ sizes }: { sizes: string }) {
    if (allPhotos.length === 0) {
      return (
        <div className="absolute inset-0 flex items-center justify-center text-[#c49a72]">
          <ImageOff className="h-12 w-12" />
        </div>
      )
    }
    return (
      <>
        <Image
          key={allPhotos[photoIndex].url}
          src={allPhotos[photoIndex].url}
          alt={card.name}
          fill
          sizes={sizes}
          className="object-contain"
          priority
        />
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
          className="absolute inset-0"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={handleMobileTouchStart}
          onTouchMove={handleMobileTouchMove}
          onTouchEnd={handleMobileTouchEnd}
          onTouchCancel={handleMobileTouchCancel}
        >
          <PhotoContent sizes="100vw" />
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
        className="relative flex-1"
        style={{ minHeight: '200px', touchAction: 'pan-y' }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        <PhotoContent sizes="(max-width: 768px) 100vw, 500px" />
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
      <DialogContent className={`w-full p-0 transition-all duration-200 ${
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
