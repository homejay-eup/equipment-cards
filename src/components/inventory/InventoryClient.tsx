'use client'
// Step 54：CRM 庫存頁（資料由公司電腦同步 CRM「庫存總表查詢」；每天 9:00、13:00 自動同步，也可按刷新）
// 畫面各自獨立：別人刷新或排程跑完，你的畫面不動；只有你自己按刷新或重新進頁面才拿新數字。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Search, Table2, List as ListIcon, Warehouse } from 'lucide-react'
import type { InvBatch, InvCan, InvItem, InvPrefs, InvProduct, InvWarehouse, TransferItem } from './types'
import { cell, defaultPrefs, TYPE_ORDER } from './types'
import InventoryTable from './InventoryTable'
import TransferTab from './TransferTab'
import BarcodeDrawer, { clearBarcodeCache, type DrawerTarget } from './BarcodeDrawer'
import WarehouseDialog from './WarehouseDialog'
import StocktakeDialog from './StocktakeDialog'

interface Data { products: InvProduct[]; warehouses: InvWarehouse[]; batches: Record<string, InvBatch>; can: InvCan }
interface RefreshReq { id: number; status: string; step: string | null; progress: Record<string, string> | null; error: string | null; created_at: string }

const STEPS = ['開始', '刷新', 'CRM', '完成']
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }

export default function InventoryClient({ switcher }: { switcher?: React.ReactNode }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [prefs, setPrefs] = useState<InvPrefs | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<InvItem[] | null>(null)
  const [hitsFor, setHitsFor] = useState('')   // hits 是用哪個搜尋字查的（用來判斷「還在找條碼」）
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [whDlg, setWhDlg] = useState(false)
  const [stkDlg, setStkDlg] = useState(false)
  const [req, setReq] = useState<RefreshReq | null>(null)
  const [delta, setDelta] = useState<Record<string, number>>({})
  const [toast, setToast] = useState('')
  const loaded = useRef(false)
  const saveT = useRef<ReturnType<typeof setTimeout>>()
  const before = useRef<Map<string, number> | null>(null)

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 1800) }

  // ---- 移交出去／待接收／持有過久（Step 55）：分頁、資料（切到分頁前先在背景載好，才能在分頁標籤上顯示件數）----
  type Tab = 'stock' | 'out' | 'in' | 'idle'
  const [tab, setTab] = useState<Tab>('stock')
  const [transit, setTransit] = useState<{ items: TransferItem[]; destAsOf: string | null } | null>(null)
  const [idle, setIdle] = useState<{ items: TransferItem[] } | null>(null)
  const [xErr, setXErr] = useState({ transit: '', idle: '' })
  const xAsked = useRef({ transit: false, idle: false })
  const loadX = useCallback(async (kind: 'transit' | 'idle') => {
    try {
      const r = await fetch(`/api/inventory/transfers?kind=${kind}`, { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取失敗')
      if (kind === 'transit') setTransit({ items: d.items, destAsOf: d.destAsOf })
      else setIdle({ items: d.items })
      setXErr(e => ({ ...e, [kind]: '' }))
    } catch (e) { setXErr(x => ({ ...x, [kind]: (e as Error).message })) }
  }, [])

  const load = useCallback(async (keepPrefs = false): Promise<InvProduct[] | null> => {
    try {
      const r = await fetch('/api/inventory', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取庫存失敗')
      clearBarcodeCache()   // 庫存資料更新了，舊的明細記憶作廢
      setData({ products: d.products, warehouses: d.warehouses, batches: d.batches, can: d.can })
      if (!keepPrefs) {
        const base = defaultPrefs(d.warehouses)
        const p: InvPrefs = d.prefs ? { ...base, ...d.prefs } : base
        // 已選的倉即使這次資料裡暫時沒有（上傳中、或庫存剛好為 0）也保留，不能自動剔除，否則重新上傳後選擇會跑掉
        if (!Array.isArray(p.wh) || !p.wh.length) p.wh = base.wh
        setPrefs(p)
      }
      setErr('')
      return d.products as InvProduct[]
    } catch (e) { setErr((e as Error).message); return null }
  }, [])
  // 進網站就先在背景載入（PhotoWall 會提早掛載），切到庫存分頁時資料已經在了
  useEffect(() => { if (!loaded.current) { loaded.current = true; load() } }, [load])

  useEffect(() => {
    if (!data) return
    if (data.can.transfers && !xAsked.current.transit) { xAsked.current.transit = true; loadX('transit') }
    if (data.can.idle && !xAsked.current.idle) { xAsked.current.idle = true; loadX('idle') }
  }, [data, loadX])

  // 個人設定：改了 0.8 秒後存到伺服器（每人一份，跨裝置）
  const update = (fn: (p: InvPrefs) => InvPrefs) => setPrefs(p => {
    if (!p) return p
    const n = fn(p)
    clearTimeout(saveT.current)
    saveT.current = setTimeout(() => { fetch('/api/inventory/prefs', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(n) }) }, 800)
    return n
  })

  const allowed = useMemo(() => (data?.warehouses ?? []).map(w => w.name), [data])

  const rows = useMemo(() => {
    if (!data || !prefs) return []
    const qq = q.trim().toLowerCase()
    const scope = qq ? allowed : prefs.wh
    const rank = (k: string) => { const i = prefs.order.indexOf(k); return i < 0 ? 1e6 : i }
    const val = (p: InvProduct) => {
      const k = prefs.sort.k
      if (k === 'pid') return p.pid ?? '~' + p.name
      if (k === 'name') return p.name
      if (k === 'tot') return prefs.wh.reduce((s, w) => s + cell(p, w)[0], 0)
      return cell(p, k)[0]
    }
    return data.products
      .filter(p => {
        if (prefs.onlyStock && !scope.some(w => cell(p, w)[0] + cell(p, w)[1])) return false
        if (!qq) return true
        return (p.pid ?? '').toLowerCase().includes(qq) || p.name.toLowerCase().includes(qq) || p.crmNames.some(n => n.toLowerCase().includes(qq))
      })
      .sort((a, b) => {
        if (prefs.sort.k === 'custom') return rank(a.key) - rank(b.key) || (a.pid ?? a.name).localeCompare(b.pid ?? b.name)
        const x = val(a), y = val(b)
        return (x > y ? 1 : x < y ? -1 : 0) * prefs.sort.d
      })
  }, [data, prefs, q, allowed])

  // 主搜尋：料號、品名都沒找到 → 改找條碼（可只打部分號碼）
  useEffect(() => {
    const qq = q.trim()
    if (tab !== 'stock' || !data?.can.barcodes || qq.length < 4 || rows.length) { setHits(null); setHitsFor(''); return }
    let cancelled = false   // 搜尋字又變了／被清空：舊的回應不能再寫進來
    const t = setTimeout(async () => {
      const r = await fetch(`/api/inventory/barcodes?q=${encodeURIComponent(qq)}`).catch(() => null)
      const d = r ? await r.json().catch(() => ({ hits: [] })) : { hits: [] }
      if (cancelled) return
      setHits(d.hits ?? [])
      setHitsFor(qq)
    }, 350)
    return () => { cancelled = true; clearTimeout(t) }
  }, [q, rows.length, data?.can.barcodes, tab])

  const liveHits = hitsFor === q.trim() ? hits : null   // 只採用「這個搜尋字」查到的結果
  const hitRows = useMemo(() => {
    if (!liveHits || !data) return null
    const keys = new Set(liveHits.map(h => h.product_id ?? `name:${h.category || '其他'}|${h.name}`))
    return data.products.filter(p => keys.has(p.key))
  }, [liveHits, data])

  // ---- 刷新 ----
  const totals = () => new Map((data?.products ?? []).map(p => [p.key, (prefs?.wh ?? []).reduce((s, w) => s + cell(p, w)[0], 0)]))
  const [sending, setSending] = useState(false)   // 按下去到伺服器回應之間：立刻有反應，避免以為沒按到而狂按
  const startRefresh = async () => {
    if (sending) return
    setSending(true)
    before.current = totals()
    try {
      const r = await fetch('/api/inventory/refresh', { method: 'POST' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { say(d.error || '送出失敗'); return }
      setReq(d.request)
      if (d.joined) say('別人剛按了刷新，一起等這一輪')
    } catch { say('送出失敗，請再按一次') } finally { setSending(false) }
  }
  const doneCount = req?.progress ? Object.values(req.progress).filter(v => v === 'ok' || v === 'failed').length : 0
  // 排隊超過 45 秒公司電腦都沒接手 → 多半是電腦休眠／關機或同步程式沒開；停止等待、告訴使用者（請求留著，電腦醒來會自己跑）
  const [stale, setStale] = useState(false)
  useEffect(() => {
    if (req?.status !== 'queued') { setStale(false); return }
    const left = 45000 - (Date.now() - new Date(req.created_at).getTime())
    const t = setTimeout(() => setStale(true), Math.max(0, left))
    return () => clearTimeout(t)
  }, [req?.status, req?.created_at])
  useEffect(() => {
    if (!req || req.status === 'done' || req.status === 'failed' || stale) return
    const t = setInterval(async () => {
      const r = await fetch(`/api/inventory/refresh?id=${req.id}`, { cache: 'no-store' })
      const d = await r.json().catch(() => null)
      if (d?.request) setReq(d.request)
    }, 1500)
    return () => clearInterval(t)
  }, [req, stale])
  // 每有一批完成就重抓數字（只換數字，捲動位置、側欄、搜尋都不動）
  const lastDone = useRef(0)
  useEffect(() => {
    if (!req) { lastDone.current = 0; return }
    if (doneCount > lastDone.current) { lastDone.current = doneCount; load(true) }
  }, [doneCount, req, load])
  // 這一輪結束：重抓一次，和按下前比對，有變動的閃一下並標 +/−
  useEffect(() => {
    if (!req || (req.status !== 'done' && req.status !== 'failed') || !before.current) return
    const prev = before.current; before.current = null
    if (xAsked.current.transit) loadX('transit')   // 移交／持有過久也跟著重抓（CRM 部分是剛同步的新資料）
    if (xAsked.current.idle) loadX('idle')
    const wh = prefs?.wh ?? []
    load(true).then(products => {
      const d: Record<string, number> = {}
      for (const p of products ?? []) {
        const v = wh.reduce((s, w) => s + cell(p, w)[0], 0), b = prev.get(p.key) ?? 0
        if (v !== b) d[p.key] = v - b
      }
      setDelta(d)
      say(req.status === 'done' ? `更新完成・${Object.keys(d).length} 項有變動` : '更新失敗，以下是上一次的資料')
      setTimeout(() => setDelta({}), 4000)
      setTimeout(() => setReq(null), 2500)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req?.status])

  if (err) return <div className="mx-auto max-w-5xl px-4 py-12 text-center text-sm text-[#b5451b]">{err}</div>
  if (!data || !prefs) return <div className="mx-auto max-w-5xl px-4 py-12 text-center text-sm text-[#a08060]">讀取庫存中…</div>

  const sel = prefs.wh
  // 目前分頁的倉庫範圍：庫存＝自選倉；其餘三個分頁各自獨立。沒設過＝預設（持有過久：全部技師、不含測試倉；其餘：全部倉庫）
  const xKey = tab === 'stock' ? null : tab
  const xSet = xKey ? prefs.xs?.[xKey] : undefined
  const techDefault = data.warehouses.filter(w => (w.region || '').includes('技師') && !w.name.includes('測試')).map(w => w.name)
  const idleDefault = tab === 'idle' && xSet === undefined
  const scopeList: string[] | null = tab === 'stock' ? sel : xSet === undefined ? (tab === 'idle' ? techDefault : null) : xSet?.length ? xSet : null
  const chips = idleDefault ? [] : (scopeList ?? [])   // 畫面上顯示的小標籤（預設的全部技師太多，合併成一個標籤）
  const setScope = (wh: string[] | null | undefined) => update(p => {
    if (!xKey) return p
    const xs = { ...p.xs }
    if (wh === undefined) delete xs[xKey]; else xs[xKey] = wh
    return { ...p, xs }
  })
  const times = Object.values(data.batches).map(b => b.exportedAt).filter(Boolean) as string[]
  const oldest = times.sort()[0] ?? null
  const running = sending || (!!req && req.status !== 'done' && req.status !== 'failed' && !stale)
  const stepIdx = !req ? (sending ? 0 : -1) : req.status === 'queued' ? 0 : req.status === 'running' ? (doneCount ? 2 : 1) : 3
  const shown = hitRows ?? rows
  // 料號品名沒結果、正要去查條碼（還沒回來）：先顯示「搜尋中」，不要先閃一下「找不到」
  const qTrim = q.trim()
  const searchingBarcode = !!data.can.barcodes && qTrim.length >= 4 && rows.length === 0 && hitsFor !== qTrim

  const seg = (on: boolean) => `px-3 py-1.5 text-[13px] ${on ? 'bg-[#e8ddd0] font-semibold text-[#2c1e12]' : 'bg-white text-[#6b4f38] hover:text-[#7a5230]'}`
  const moveIn = (list: string[], from: string, to: string) => { const a = list.filter(x => x !== from); a.splice(a.indexOf(to), 0, from); return a }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold text-[#2c1e12]">CRM 庫存</h2>
          <p className="text-xs text-[#a08060]">數量來自 CRM「庫存總表查詢」；每天 9:00、13:00 自動同步，也可隨時刷新。</p>
        </div>
        {switcher}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-[#e8ddd0] bg-white px-3 py-2.5 text-[13px] text-[#6b4f38]">
        <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-[#c98a2b]' : 'bg-[#3d7a3a]'}`} />
        {running
          ? <span>{sending && !req ? '已按下，正在通知公司電腦…' : `全部庫存更新中（${doneCount}/7 批），預計約 1 分鐘`}・先顯示 {hm(oldest)} 的數字</span>
          : <span>資料時間 <b className="text-[#2c1e12]">{oldest ? `${md(oldest)} ${hm(oldest)}` : '尚無資料'}</b></span>}
        {(req || sending) && (
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] ${i < stepIdx ? 'bg-[#e6f0e0] text-[#3d7a3a]' : i === stepIdx ? 'bg-[#fdf3e3] text-[#8a5a1c]' : 'bg-[#f0e8de] text-[#a08060]'}`}>{s}</span>
            ))}
            <span className="ml-1 h-1.5 w-28 overflow-hidden rounded bg-[#f0e8de]"><i className="block h-full bg-[#7a5230] transition-all" style={{ width: `${(doneCount / 7) * 100}%` }} /></span>
          </div>
        )}
        {stale && <span className="text-xs text-[#b5451b]">公司電腦沒有回應（可能休眠、關機或同步程式沒開），以下仍是 {hm(oldest)} 的資料；電腦恢復後會自動補做</span>}
        {req?.error && !running && <span className="text-xs text-[#b5451b]">部分失敗：{req.error.slice(0, 60)}</span>}
        {data.can.stocktake && tab === 'stock' && (
          <button onClick={() => setStkDlg(true)}
            className="ml-auto rounded-md border border-[rgba(122,82,48,.35)] bg-white px-3 py-1.5 text-[#7a5230] hover:bg-[#faf6f0]">匯出盤點表</button>
        )}
        {data.can.refresh && (
          <button onClick={startRefresh} disabled={running}
            className={`${data.can.stocktake && tab === 'stock' ? '' : 'ml-auto '}inline-flex items-center gap-1.5 rounded-md bg-[#7a5230] px-3 py-1.5 text-white shadow-[0_0_10px_rgba(122,82,48,.3)] hover:bg-[#9c6b42] disabled:opacity-80`}>
            <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? `${STEPS[Math.max(0, stepIdx)]}…` : req?.status === 'done' ? '完成' : '刷新庫存'}
          </button>
        )}
      </div>

      {(data.can.transfers || data.can.idle) && (
        <div className="mb-3 inline-flex max-w-full overflow-hidden rounded-lg border border-[#e8ddd0]" role="tablist">
          {([['stock', '庫存'], ['out', '移交出去'], ['in', '待接收'], ['idle', '持有過久']] as [Tab, string][])
            .filter(([k]) => k === 'stock' || (k === 'idle' ? data.can.idle : data.can.transfers)).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`px-5 py-1.5 text-[14px] ${tab === k ? 'bg-[#7a5230] font-semibold text-white' : 'bg-white text-[#6b4f38] hover:bg-[#faf6f0] hover:text-[#7a5230]'}`}>
                {label}
              </button>
            ))}
        </div>
      )}

      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <label className="flex h-9 min-w-[220px] flex-1 items-center gap-1.5 rounded-md border border-[#e8ddd0] bg-white px-2.5 focus-within:border-[#c49a72]">
          <Search className="h-4 w-4 text-[#a08060]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋料號、品名，或貼上條碼" className="w-full bg-transparent text-sm outline-none placeholder:text-[#a08060]" />
        </label>
        <div className="flex overflow-hidden rounded-md border border-[#e8ddd0]">
          <button className={seg(prefs.view === 'pivot')} onClick={() => update(p => ({ ...p, view: 'pivot' }))}><Table2 className="mr-1 inline h-3.5 w-3.5" />樞紐表</button>
          <button className={seg(prefs.view === 'list')} onClick={() => update(p => ({ ...p, view: 'list' }))}><ListIcon className="mr-1 inline h-3.5 w-3.5" />列表</button>
        </div>
        {prefs.view === 'pivot' && (
          <div className="flex overflow-hidden rounded-md border border-[#e8ddd0]">
            <button className={seg(prefs.grp === 'type')} onClick={() => update(p => ({ ...p, grp: 'type' }))}>依類型分組</button>
            <button className={seg(prefs.grp === 'none')} onClick={() => update(p => ({ ...p, grp: 'none' }))}>不分組</button>
          </div>
        )}
        {tab === 'stock' && <div className="flex overflow-hidden rounded-md border border-[#e8ddd0]">
          <button className={seg(false)} title="清除拖曳過的順序、收合狀態，回到品號排序"
            onClick={() => { update(p => ({ ...p, order: [], gorder: [...TYPE_ORDER], sort: { k: 'pid', d: 1 }, col: {} })); say('已恢復預設排列') }}>↺ 恢復預設</button>
        </div>}
        {tab === 'stock' && <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[#e8ddd0] bg-white px-2.5 py-1 text-[13px] text-[#6b4f38]">
          <input type="checkbox" className="peer sr-only" checked={prefs.onlyStock} onChange={e => { const v = e.target.checked; update(p => ({ ...p, onlyStock: v })) }} />
          <span className="relative h-4 w-7 rounded-full bg-[#d8ccbd] transition peer-checked:bg-[#7a5230] after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
          只看有庫存
        </label>}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-[#6b4f38]">
        <Warehouse className="h-4 w-4 text-[#a08060]" />
        倉庫（欄位順序可拖曳）：
        {tab !== 'stock' && chips.length === 0 && <span className="rounded-full border border-[#e8ddd0] bg-[#f6efe4] px-2.5 py-0.5 text-xs">{idleDefault ? '全部技師（不含測試倉）' : '全部倉庫'}</span>}
        {chips.map(w => (
          <span key={w} draggable
            onDragStart={e => e.dataTransfer.setData('text/wh', w)} onDragOver={e => e.preventDefault()}
            onDrop={e => { const f = e.dataTransfer.getData('text/wh'); if (f && f !== w) { if (tab === 'stock') update(p => ({ ...p, wh: moveIn(p.wh, f, w) })); else setScope(moveIn(chips, f, w)); say('欄位順序已記住') } }}
            className="cursor-grab rounded-full border border-[#e8ddd0] bg-[#f6efe4] px-2.5 py-0.5 text-xs">{w}</span>
        ))}
        <button onClick={() => setWhDlg(true)} className="ml-1 text-xs text-[#7a5230] underline">編輯倉庫</button>
        {tab !== 'stock' && xSet !== undefined && <button onClick={() => setScope(undefined)} className="text-xs text-[#a08060] underline">{tab === 'idle' ? '改回全部技師' : '改回全部倉庫'}</button>}
      </div>

      {tab === 'stock' && liveHits && (
        <div className="mb-3 rounded-lg border border-[#e8ddd0] border-l-[3px] border-l-[#7a5230] bg-white px-3 py-2.5 text-[13px]">
          {liveHits.length ? (
            <>
              <b>找到 {liveHits.length}{liveHits.length >= 30 ? '+' : ''} 筆條碼</b>，點一筆打開它所在倉的條碼明細：
              <table className="mt-1.5 w-full text-xs">
                <tbody>{liveHits.map(h => {
                  const key = h.product_id ?? `name:${h.category || '其他'}|${h.name}`
                  const p = data.products.find(x => x.key === key)
                  return (
                    <tr key={h.warehouse + h.barcode} onClick={() => p && setDrawer({ mode: 'cell', product: p, warehouse: h.warehouse, focus: h.barcode })}
                      className="cursor-pointer border-t border-[#f0e8de] hover:bg-[#f6efe4]">
                      <td className="py-1 pr-2 font-mono">{h.barcode}</td><td className="py-1 pr-2">{p?.name ?? h.name}</td>
                      <td className="py-1 pr-2">{h.warehouse}</td><td className="py-1 pr-2">{h.car}</td>
                      <td className="py-1">{h.unusable ? <span className="rounded bg-[#f8e4dc] px-1.5 text-[#b5451b]">不可使用</span> : <span className="rounded bg-[#e6f0e0] px-1.5 text-[#3d7a3a]">可用</span>}</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </>
          ) : <span className="text-[#a08060]">料號、品名、條碼都找不到「{q.trim()}」</span>}
        </div>
      )}
      {tab === 'stock' && !liveHits && q.trim() && rows.length > 0 && rows.length <= 5 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e8ddd0] border-l-[3px] border-l-[#7a5230] bg-white px-3 py-2 text-[13px]">
          <b>搜尋到 {rows.length} 個品項</b>，點品名可看它在<b>所有倉</b>的位置、數量和全部條碼：
          {rows.map(p => <button key={p.key} onClick={() => setDrawer({ mode: 'item', product: p })} className="rounded-md border border-[#e8ddd0] bg-white px-2 py-0.5 text-xs hover:text-[#7a5230]">{p.name}</button>)}
        </div>
      )}

      {tab !== 'stock' ? (
        <TransferTab
          kind={tab} products={data.products} warehouses={data.warehouses} scope={scopeList} q={q} view={prefs.view} grp={prefs.grp} onCopied={say}
          items={(tab === 'idle' ? idle : transit)?.items ?? null} loading={!(tab === 'idle' ? idle : transit) && !xErr[tab === 'idle' ? 'idle' : 'transit']}
          error={xErr[tab === 'idle' ? 'idle' : 'transit']}
          note={tab === 'in' ? <>接收倉來自資料庫前一日備份{transit?.destAsOf ? `（${md(transit.destAsOf)}）` : ''}，無法刷新；之後才移交的列在「接收倉未同步」，請至 CRM 查詢</> : undefined}
        />
      ) : searchingBarcode ? (
        <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]"><RefreshCw className="mr-1.5 inline h-4 w-4 animate-spin align-[-3px]" />搜尋中…</div>
      ) : <InventoryTable
        rows={shown} prefs={prefs} allowed={allowed} delta={delta}
        onSort={k => update(p => ({ ...p, sort: p.sort.k === k ? { k, d: (p.sort.d * -1) as 1 | -1 } : { k, d: k === 'pid' || k === 'name' ? 1 : -1 } }))}
        onToggleGroup={g => update(p => ({ ...p, col: { ...p.col, [g]: !p.col[g] } }))}
        onMoveCol={(f, t) => { update(p => ({ ...p, wh: moveIn(p.wh, f, t) })); say('欄位順序已記住') }}
        onMoveRow={(f, t) => {
          update(p => {
            const cur = shown.map(x => x.key)
            const base = [...p.order.filter(k => cur.includes(k)), ...cur.filter(k => !p.order.includes(k)), ...p.order.filter(k => !cur.includes(k))]
            return { ...p, order: moveIn(base, f, t), sort: { k: 'custom', d: 1 } }
          })
          say('順序已記住（我的排序）')
        }}
        onMoveGroup={(f, t) => { update(p => ({ ...p, gorder: moveIn(p.gorder, f, t) })); say('分組順序已記住') }}
        onCell={(p, w) => setDrawer({ mode: 'cell', product: p, warehouse: w })}
        onItem={p => setDrawer({ mode: 'item', product: p })}
      />}

      <BarcodeDrawer target={drawer} allowedWarehouses={allowed} canBarcodes={data.can.barcodes} onClose={() => setDrawer(null)} />
      {whDlg && <WarehouseDialog all={data.warehouses} selected={tab === 'stock' ? sel : (scopeList ?? [])} onClose={() => setWhDlg(false)} emptyMeansAll={tab !== 'stock'}
        onApply={wh => { if (tab === 'stock') update(p => ({ ...p, wh })); else setScope(wh.length ? wh : null); setWhDlg(false) }} />}
      {stkDlg && <StocktakeDialog products={data.products} selected={sel} onClose={() => setStkDlg(false)} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#2c1e12] px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  )
}
