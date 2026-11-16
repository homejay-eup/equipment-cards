'use client'
// Step 54：右側滑出的條碼明細
//   mode 'cell'：某產品 × 某倉的條碼（focus＝主搜尋找到的那顆，上方顯示「你搜尋的條碼」卡片並標亮）
//   mode 'item'：品項總覽——這個產品在所有有權限的倉的數量；點倉展開條碼；「全部條碼」分頁一次列出
import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, X, ChevronDown, ChevronRight, ChevronUp } from 'lucide-react'
import type { InvItem, InvProduct } from './types'
import { cell } from './types'

export type DrawerTarget =
  | { mode: 'cell'; product: InvProduct; warehouse: string; focus?: string }
  | { mode: 'item'; product: InvProduct }

interface Page { rows: InvItem[]; total: number }

// 第一頁明細的記憶：看過的立刻顯示（背景再更新）；滑鼠移到數字上先預載；庫存刷新後清空
type First = { rows: InvItem[]; total: number; pageSize: number; focusRow: InvItem | null }
const firstCache = new Map<string, { at: number; d: First }>()
const inflight = new Map<string, Promise<First>>()
const CACHE_MS = 10 * 60 * 1000
const cacheKey = (key: string, wh: string | null) => `${key}\u0000${wh ?? ''}`
export function clearBarcodeCache() { firstCache.clear() }
/** 預載第一頁（不含搜尋定位）；已有新鮮快取或正在載入就略過 */
export function prefetchBarcodes(key: string, warehouse: string | null) {
  const ck = cacheKey(key, warehouse)
  const hit = firstCache.get(ck)
  if ((hit && Date.now() - hit.at < CACHE_MS) || inflight.has(ck)) return
  fetchPage(key, warehouse, 0).catch(() => {})
}

async function fetchPage(key: string, warehouse: string | null, offset: number, focus?: string): Promise<First> {
  if (offset === 0 && !focus) {
    const ck = cacheKey(key, warehouse)
    const running = inflight.get(ck)
    if (running) return running
    const pr = fetchRaw(key, warehouse, 0).then(d => { firstCache.set(ck, { at: Date.now(), d }); return d }).finally(() => inflight.delete(ck))
    inflight.set(ck, pr)
    return pr
  }
  return fetchRaw(key, warehouse, offset, focus)
}

async function fetchRaw(key: string, warehouse: string | null, offset: number, focus?: string) {
  const p = new URLSearchParams({ key, offset: String(offset) })
  if (warehouse) p.set('warehouse', warehouse)
  if (focus) p.set('focus', focus)
  const r = await fetch(`/api/inventory/barcodes?${p}`)
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '讀取條碼失敗')
  return r.json() as Promise<{ rows: InvItem[]; total: number; pageSize: number; focusRow: InvItem | null }>
}

/** 匯出 CSV（Excel 直接開；加 BOM 才不會亂碼） */
async function exportCsv(product: InvProduct, warehouse: string | null, withWh: boolean) {
  const all: InvItem[] = []
  for (let off = 0; off < 50000; off += 200) {
    const d = await fetchPage(product.key, warehouse, off)
    all.push(...d.rows)
    if (all.length >= d.total || !d.rows.length) break
  }
  const head = ['條碼', ...(withWh ? ['倉庫'] : []), '車代', '更新時間', '操作', '更新人', '狀態', '備註']
  const esc = (v: string | null) => `"${(v ?? '').replace(/"/g, '""')}"`
  const lines = all.map(r => [r.barcode, ...(withWh ? [r.warehouse] : []), r.car, r.crm_updated, r.op, r.who, r.unusable ? '不可使用' : '可使用', r.note].map(esc).join(','))
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${product.pid ?? product.name}-${warehouse ?? '全部倉'}-條碼.csv`
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

function Status({ bad }: { bad: boolean }) {
  return bad
    ? <span className="inline-block whitespace-nowrap rounded bg-[#f8e4dc] px-1.5 text-[11px] text-[#b5451b]">不可使用</span>
    : <span className="inline-block whitespace-nowrap rounded bg-[#e6f0e0] px-1.5 text-[11px] text-[#3d7a3a]">可用</span>
}

function BarcodeTable({ rows, showWh, focus }: { rows: InvItem[]; showWh: boolean; focus?: string }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#e8ddd0] bg-white">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="bg-[#faf6f0] text-left text-[11px] text-[#6b4f38]">
            {['條碼', ...(showWh ? ['倉庫'] : []), '車代', '更新', '操作', '更新人', '狀態', '備註'].map(h => (
              <th key={h} className="whitespace-nowrap px-2.5 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const hl = !!focus && r.barcode === focus
            return (
              <tr key={r.warehouse + r.barcode} data-hl={hl || undefined}
                className={`border-t border-[#f0e8de] ${hl ? 'bg-[#f7e3c8] font-semibold shadow-[inset_4px_0_0_#7a5230] animate-pulse' : ''}`}>
                <td className="whitespace-nowrap px-2.5 py-1.5 font-mono">{r.barcode}</td>
                {showWh && <td className="whitespace-nowrap px-2.5 py-1.5">{r.warehouse}</td>}
                <td className="whitespace-nowrap px-2.5 py-1.5">{r.car}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5">{(r.crm_updated ?? '').slice(0, 10)}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5">{r.op}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5">{r.who}</td>
                <td className="whitespace-nowrap px-2.5 py-1.5"><Status bad={r.unusable} /></td>
                <td className="min-w-[140px] whitespace-normal break-words px-2.5 py-1.5">{r.note}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** 一個倉（或全部倉）的條碼清單，往下載入更多 */
function BarcodeList({ product, warehouse, showWh, focus, onFocusRow }: {
  product: InvProduct; warehouse: string | null; showWh: boolean; focus?: string; onFocusRow?: (r: InvItem | null) => void
}) {
  const [page, setPage] = useState<Page>({ rows: [], total: 0 })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(true)
  const load = useCallback(async (offset: number) => {
    const cached = offset === 0 && !focus ? firstCache.get(cacheKey(product.key, warehouse)) : undefined
    if (cached) { setPage({ rows: cached.d.rows, total: cached.d.total }); onFocusRow?.(null) }   // 先秀舊的，背景再更新
    setBusy(!cached)
    try {
      const d = await fetchPage(product.key, warehouse, offset, offset === 0 ? focus : undefined)
      setPage(p => ({ rows: offset === 0 ? d.rows : [...p.rows, ...d.rows], total: d.total }))
      if (offset === 0) onFocusRow?.(d.focusRow)
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }, [product.key, warehouse, focus, onFocusRow])
  useEffect(() => { load(0) }, [load])
  if (err) return <p className="py-4 text-sm text-[#b5451b]">{err}</p>
  return (
    <div>
      {page.rows.length > 0 && <BarcodeTable rows={page.rows} showWh={showWh} focus={focus} />}
      <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#a08060]">
        {busy ? '讀取中…' : `顯示 ${page.rows.length.toLocaleString()} / ${page.total.toLocaleString()} 筆`}
        {!busy && page.rows.length < page.total && (
          <button className="rounded border border-[#e8ddd0] bg-white px-2 py-0.5 text-[#7a5230]" onClick={() => load(page.rows.length)}>載入更多</button>
        )}
      </div>
    </div>
  )
}

export default function BarcodeDrawer({ target, allowedWarehouses, canBarcodes, onClose }: {
  target: DrawerTarget | null; allowedWarehouses: string[]; canBarcodes: boolean; onClose: () => void
}) {
  const [tab, setTab] = useState<'wh' | 'all'>('wh')
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [focusRow, setFocusRow] = useState<InvItem | null>(null)
  const [exporting, setExporting] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const [seenAll, setSeenAll] = useState(false)
  const [sort, setSort] = useState<{ k: 'name' | 'ok' | 'bad' | 'total'; dir: 1 | -1 }>({ k: 'total', dir: -1 })   // 依倉庫表的排序（預設：合計多的在前）
  const [wq, setWq] = useState('')
  useEffect(() => { setTab('wh'); setSeenAll(false); setOpen({}); setFocusRow(null); setWq('') }, [target])
  // 開品項總覽時，背景先把「全部條碼」第一頁載好，切過去就是現成的
  useEffect(() => { if (target?.mode === 'item' && canBarcodes) prefetchBarcodes(target.product.key, null) }, [target, canBarcodes])
  useEffect(() => {
    if (!focusRow) return
    const t = setTimeout(() => bodyRef.current?.querySelector('tr[data-hl]')?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)
    return () => clearTimeout(t)
  }, [focusRow])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  if (!target) return null
  const p = target.product

  const doExport = async (wh: string | null, withWh: boolean) => {
    setExporting(true)
    try { await exportCsv(p, wh, withWh) } finally { setExporting(false) }
  }
  const ExportBtn = ({ wh, withWh }: { wh: string | null; withWh: boolean }) => (
    <button disabled={exporting} onClick={() => doExport(wh, withWh)}
      className="inline-flex items-center gap-1 rounded-md border border-[#e8ddd0] bg-white px-2 py-1 text-[11px] text-[#6b4f38] hover:text-[#7a5230] disabled:opacity-50">
      <Download className="h-3 w-3" />{exporting ? '匯出中…' : withWh ? '匯出 Excel（含倉庫）' : '匯出 Excel'}
    </button>
  )

  let sub: React.ReactNode = null
  let body: React.ReactNode = null
  if (target.mode === 'cell') {
    const [ok, bad] = cell(p, target.warehouse)
    sub = <>{target.warehouse}・可使用 {ok.toLocaleString()}{bad ? <>・不可使用 <span className="text-[#b5451b]">{bad}</span></> : null}</>
    body = (
      <>
        {focusRow && (
          <div className="mb-3 rounded-lg border-[1.5px] border-[#7a5230] bg-[#fff8ee] px-3 py-2.5">
            <div className="mb-1 flex items-center text-[11px] font-bold text-[#7a5230]">
              你搜尋的條碼
              <button className="ml-auto text-[11px] font-normal underline"
                onClick={() => bodyRef.current?.querySelector('tr[data-hl]')?.scrollIntoView({ block: 'center', behavior: 'smooth' })}>
                在下方清單中定位 ↓
              </button>
            </div>
            <div className="font-mono text-[17px] font-bold">{focusRow.barcode}</div>
            <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
              {([['倉庫', focusRow.warehouse], ['車代', focusRow.car || '—'], ['更新', (focusRow.crm_updated ?? '').slice(0, 10)], ['操作', focusRow.op],
                ['更新人', focusRow.who], ['備註', focusRow.note]] as const).filter(([, v]) => v).map(([k, v]) => (
                <div key={k}><span className="mr-1 text-[#a08060]">{k}</span>{v}</div>
              ))}
              <div><span className="mr-1 text-[#a08060]">狀態</span><Status bad={focusRow.unusable} /></div>
            </div>
          </div>
        )}
        {canBarcodes ? (
          <>
            <div className="mb-2 flex justify-end"><ExportBtn wh={target.warehouse} withWh={false} /></div>
            <BarcodeList product={p} warehouse={target.warehouse} showWh={false} focus={target.focus} onFocusRow={setFocusRow} />
          </>
        ) : <p className="py-6 text-center text-sm text-[#a08060]">你的角色沒有看條碼明細的權限</p>}
      </>
    )
  } else {
    const val = (w: string) => sort.k === 'ok' ? cell(p, w)[0] : sort.k === 'bad' ? cell(p, w)[1] : cell(p, w)[0] + cell(p, w)[1]
    const all = allowedWarehouses.filter(w => cell(p, w)[0] + cell(p, w)[1])
    const ws = all.filter(w => !wq.trim() || w.includes(wq.trim()))
      .sort((a, b) => sort.k === 'name' ? sort.dir * a.localeCompare(b, 'zh-Hant') : sort.dir * (val(a) - val(b)) || a.localeCompare(b, 'zh-Hant'))
    const ok = all.reduce((s, w) => s + cell(p, w)[0], 0)
    const bad = all.reduce((s, w) => s + cell(p, w)[1], 0)
    const th = (k: typeof sort.k, label: string, right: boolean) => (
      <th className={`px-2.5 py-2 font-medium ${right ? 'text-right' : 'text-left'}`} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
        <button type="button" onClick={() => setSort(s => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === 'name' ? 1 : -1 })}
          className={`inline-flex items-center gap-0.5 hover:text-[#7a5230] ${sort.k === k ? 'font-semibold text-[#2c1e12]' : ''}`}>
          {label}{sort.k === k ? (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
        </button>
      </th>
    )
    sub = <>全部 {all.length} 個倉・可使用 <b>{ok.toLocaleString()}</b>{bad ? <>・不可使用 <span className="text-[#b5451b]">{bad.toLocaleString()}</span></> : null}</>
    body = (
      <>
        <div className="mb-3 inline-flex overflow-hidden rounded-lg border border-[#e8ddd0] text-xs">
          {([['wh', `依倉庫（${all.length}）`], ['all', `全部條碼（${(ok + bad).toLocaleString()}）`]] as const).map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); if (k === 'all') setSeenAll(true) }}
              onMouseEnter={() => { if (k === 'all' && canBarcodes) prefetchBarcodes(p.key, null) }} disabled={k === 'all' && !canBarcodes}
              className={`px-3 py-1.5 ${tab === k ? 'bg-[#e8ddd0] font-semibold text-[#2c1e12]' : 'bg-white text-[#6b4f38]'} disabled:opacity-40`}>{l}</button>
          ))}
        </div>
        {/* 兩個分頁都保持掛載（用隱藏切換），切換時不用重新載入 */}
        <div className={tab === 'wh' ? '' : 'hidden'}>
          <input value={wq} onChange={e => setWq(e.target.value)} placeholder="搜尋倉庫…"
            className="mb-2 w-full rounded-md border border-[#e8ddd0] bg-white px-2 py-1 text-xs outline-none focus:border-[#c49a72] sm:w-56" />
          <div className="overflow-hidden rounded-lg border border-[#e8ddd0] bg-white">
            <table className="w-full text-[13px]">
              <thead><tr className="bg-[#faf6f0] text-[11px] text-[#6b4f38]">
                {th('name', '倉庫', false)}{th('ok', '可使用', true)}{th('bad', '不可使用', true)}{th('total', '合計', true)}<th className="w-16" />
              </tr></thead>
              <tbody>
                {ws.map(w => {
                  const [o, b] = cell(p, w)
                  return (
                    <FragmentRow key={w}>
                      <tr className="cursor-pointer border-t border-[#f0e8de] hover:bg-[#faf6f0]" onClick={() => canBarcodes && setOpen(s => ({ ...s, [w]: !s[w] }))}>
                        <td className="px-2.5 py-2">{w}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{o.toLocaleString()}</td>
                        <td className={`px-2.5 py-2 text-right tabular-nums ${b ? 'text-[#b5451b]' : 'text-[#c9b8a4]'}`}>{b}</td>
                        <td className="px-2.5 py-2 text-right font-bold tabular-nums">{(o + b).toLocaleString()}</td>
                        <td className="px-2.5 py-2 text-right text-xs text-[#a08060]">
                          {canBarcodes && <span className="inline-flex items-center">條碼{open[w] ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}</span>}
                        </td>
                      </tr>
                      {open[w] && (
                        <tr><td colSpan={5} className="bg-[#fffdfa] p-2">
                          <BarcodeList product={p} warehouse={w} showWh={false} />
                        </td></tr>
                      )}
                    </FragmentRow>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
        {(tab === 'all' || seenAll) && (
          <div className={tab === 'all' ? '' : 'hidden'}>
            <div className="mb-2 flex justify-end"><ExportBtn wh={null} withWh /></div>
            <BarcodeList product={p} warehouse={null} showWh />
          </div>
        )}
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-[#2c1e12]/30" onClick={onClose} />
      <aside className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[820px] flex-col bg-[#fff9f4] shadow-[-8px_0_30px_rgba(0,0,0,.15)]">
        <div className="flex items-start gap-3 border-b border-[#e8ddd0] px-4 py-3.5">
          <div className="min-w-0">
            <div className="font-mono text-[11px] text-[#a08060]">{p.pid ?? '未對應料卡'}</div>
            <h3 className="text-[15px] font-semibold text-[#2c1e12]">{p.name}</h3>
            <div className="text-xs text-[#a08060]">{sub}</div>
          </div>
          <button onClick={onClose} className="ml-auto rounded p-1 text-[#a08060] hover:text-[#7a5230]" aria-label="關閉"><X className="h-5 w-5" /></button>
        </div>
        <div ref={bodyRef} className="flex-1 overflow-auto px-4 py-3">{body}</div>
      </aside>
    </>
  )
}

function FragmentRow({ children }: { children: React.ReactNode }) { return <>{children}</> }
