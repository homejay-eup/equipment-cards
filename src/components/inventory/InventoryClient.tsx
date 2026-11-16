'use client'
// Step 54：CRM 庫存頁（資料由公司電腦同步 CRM「庫存總表查詢」；每天 9:00、13:00 自動同步，也可按刷新）
// 畫面各自獨立：別人刷新或排程跑完，你的畫面不動；只有你自己按刷新或重新進頁面才拿新數字。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { RefreshCw, Search, Table2, List as ListIcon, Warehouse } from 'lucide-react'
import type { InvBatch, InvCan, InvItem, InvPrefs, InvProduct, InvWarehouse } from './types'
import { cell, defaultPrefs, TYPE_ORDER } from './types'
import InventoryTable from './InventoryTable'
import BarcodeDrawer, { type DrawerTarget } from './BarcodeDrawer'
import WarehouseDialog from './WarehouseDialog'

interface Data { products: InvProduct[]; warehouses: InvWarehouse[]; batches: Record<string, InvBatch>; can: InvCan }
interface RefreshReq { id: number; status: string; step: string | null; progress: Record<string, string> | null; error: string | null; created_at: string }

const STEPS = ['開始', '刷新', 'CRM', '完成']
const hm = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false }) : '—')
const md = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()}` }

export default function InventoryClient({ isActive = true }: { isActive?: boolean }) {
  const [data, setData] = useState<Data | null>(null)
  const [err, setErr] = useState('')
  const [prefs, setPrefs] = useState<InvPrefs | null>(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<InvItem[] | null>(null)
  const [drawer, setDrawer] = useState<DrawerTarget | null>(null)
  const [whDlg, setWhDlg] = useState(false)
  const [req, setReq] = useState<RefreshReq | null>(null)
  const [delta, setDelta] = useState<Record<string, number>>({})
  const [toast, setToast] = useState('')
  const loaded = useRef(false)
  const saveT = useRef<ReturnType<typeof setTimeout>>()
  const before = useRef<Map<string, number> | null>(null)

  const say = (t: string) => { setToast(t); setTimeout(() => setToast(''), 1800) }

  const load = useCallback(async (keepPrefs = false): Promise<InvProduct[] | null> => {
    try {
      const r = await fetch('/api/inventory', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取庫存失敗')
      setData({ products: d.products, warehouses: d.warehouses, batches: d.batches, can: d.can })
      if (!keepPrefs) {
        const base = defaultPrefs(d.warehouses)
        const p: InvPrefs = d.prefs ? { ...base, ...d.prefs } : base
        const names = new Set((d.warehouses as InvWarehouse[]).map(w => w.name))
        p.wh = p.wh.filter(w => names.has(w))
        if (!p.wh.length) p.wh = base.wh
        setPrefs(p)
      }
      setErr('')
      return d.products as InvProduct[]
    } catch (e) { setErr((e as Error).message); return null }
  }, [])
  useEffect(() => { if (isActive && !loaded.current) { loaded.current = true; load() } }, [isActive, load])

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
    if (!data?.can.barcodes || qq.length < 4 || rows.length) { setHits(null); return }
    const t = setTimeout(async () => {
      const r = await fetch(`/api/inventory/barcodes?q=${encodeURIComponent(qq)}`)
      const d = await r.json().catch(() => ({ hits: [] }))
      setHits(d.hits ?? [])
    }, 350)
    return () => clearTimeout(t)
  }, [q, rows.length, data?.can.barcodes])

  const hitRows = useMemo(() => {
    if (!hits || !data) return null
    const keys = new Set(hits.map(h => h.product_id ?? `name:${h.category || '其他'}|${h.name}`))
    return data.products.filter(p => keys.has(p.key))
  }, [hits, data])

  // ---- 刷新 ----
  const totals = () => new Map((data?.products ?? []).map(p => [p.key, (prefs?.wh ?? []).reduce((s, w) => s + cell(p, w)[0], 0)]))
  const startRefresh = async () => {
    before.current = totals()
    const r = await fetch('/api/inventory/refresh', { method: 'POST' })
    const d = await r.json()
    if (!r.ok) { say(d.error || '送出失敗'); return }
    setReq(d.request)
    if (d.joined) say('別人剛按了刷新，一起等這一輪')
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
  const statRows = hitRows ?? rows
  const ok = statRows.reduce((s, p) => s + sel.reduce((a, w) => a + cell(p, w)[0], 0), 0)
  const bad = statRows.reduce((s, p) => s + sel.reduce((a, w) => a + cell(p, w)[1], 0), 0)
  const cnt = statRows.filter(p => sel.some(w => cell(p, w)[0] + cell(p, w)[1])).length
  const times = Object.values(data.batches).map(b => b.exportedAt).filter(Boolean) as string[]
  const oldest = times.sort()[0] ?? null
  const running = !!req && req.status !== 'done' && req.status !== 'failed' && !stale
  const stepIdx = !req ? -1 : req.status === 'queued' ? 0 : req.status === 'running' ? (doneCount ? 2 : 1) : 3
  const shown = hitRows ?? rows

  const seg = (on: boolean) => `px-3 py-1.5 text-[13px] ${on ? 'bg-[#e8ddd0] font-semibold text-[#2c1e12]' : 'bg-white text-[#6b4f38] hover:text-[#7a5230]'}`
  const moveIn = (list: string[], from: string, to: string) => { const a = list.filter(x => x !== from); a.splice(a.indexOf(to), 0, from); return a }

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="mr-auto">
          <h2 className="text-lg font-semibold text-[#2c1e12]">CRM 庫存</h2>
          <p className="text-xs text-[#a08060]">數量來自 CRM「庫存總表查詢」；每天 9:00、13:00 自動同步，也可隨時刷新。</p>
        </div>
        <div className="hidden gap-2 sm:flex">
          {[[ok.toLocaleString(), '所選倉可使用', ''], [bad.toLocaleString(), '不可使用', 'text-[#b5451b]'], [cnt.toLocaleString(), '有庫存品項', '']].map(([v, l, c]) => (
            <div key={l} className="min-w-[96px] rounded-lg border border-[#e8ddd0] bg-white px-3 py-2">
              <b className={`block text-xl tabular-nums ${c}`}>{v}</b><span className="whitespace-nowrap text-[11px] text-[#a08060]">{l}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-[#e8ddd0] bg-white px-3 py-2.5 text-[13px] text-[#6b4f38]">
        <span className={`h-2 w-2 rounded-full ${running ? 'animate-pulse bg-[#c98a2b]' : 'bg-[#3d7a3a]'}`} />
        {running
          ? <span>全部庫存更新中（{doneCount}/7 批），預計約 1 分鐘・先顯示 {hm(oldest)} 的數字</span>
          : <span>資料時間 <b className="text-[#2c1e12]">{oldest ? `${md(oldest)} ${hm(oldest)}` : '尚無資料'}</b></span>}
        {req && (
          <div className="flex items-center gap-1">
            {STEPS.map((s, i) => (
              <span key={s} className={`rounded-full px-2 py-0.5 text-[11px] ${i < stepIdx ? 'bg-[#e6f0e0] text-[#3d7a3a]' : i === stepIdx ? 'bg-[#fdf3e3] text-[#8a5a1c]' : 'bg-[#f0e8de] text-[#a08060]'}`}>{s}</span>
            ))}
            <span className="ml-1 h-1.5 w-28 overflow-hidden rounded bg-[#f0e8de]"><i className="block h-full bg-[#7a5230] transition-all" style={{ width: `${(doneCount / 7) * 100}%` }} /></span>
          </div>
        )}
        {stale && <span className="text-xs text-[#b5451b]">公司電腦沒有回應（可能休眠、關機或同步程式沒開），以下仍是 {hm(oldest)} 的資料；電腦恢復後會自動補做</span>}
        {req?.error && !running && <span className="text-xs text-[#b5451b]">部分失敗：{req.error.slice(0, 60)}</span>}
        {data.can.refresh && (
          <button onClick={startRefresh} disabled={running}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[#7a5230] px-3 py-1.5 text-white shadow-[0_0_10px_rgba(122,82,48,.3)] hover:bg-[#9c6b42] disabled:opacity-80">
            <RefreshCw className={`h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
            {running ? `${STEPS[Math.max(0, stepIdx)]}…` : req?.status === 'done' ? '完成' : '刷新庫存'}
          </button>
        )}
      </div>

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
        <div className="flex overflow-hidden rounded-md border border-[#e8ddd0]">
          <button className={seg(prefs.sort.k === 'custom')} title={prefs.order.length ? '用你拖曳排好的順序' : '還沒拖曳過，先用品號順序'}
            onClick={() => update(p => ({ ...p, sort: { k: 'custom', d: 1 } }))}>≡ 我的排序</button>
          <button className={seg(false)} title="清除拖曳過的順序、收合狀態"
            onClick={() => { update(p => ({ ...p, order: [], gorder: [...TYPE_ORDER], sort: { k: 'pid', d: 1 }, col: {} })); say('已恢復預設排列') }}>↺ 恢復預設</button>
        </div>
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[#e8ddd0] bg-white px-2.5 py-1 text-[13px] text-[#6b4f38]">
          <input type="checkbox" className="peer sr-only" checked={prefs.onlyStock} onChange={e => { const v = e.target.checked; update(p => ({ ...p, onlyStock: v })) }} />
          <span className="relative h-4 w-7 rounded-full bg-[#d8ccbd] transition peer-checked:bg-[#7a5230] after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
          只看有庫存
        </label>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-1.5 text-[13px] text-[#6b4f38]">
        <Warehouse className="h-4 w-4 text-[#a08060]" />倉庫（欄位順序可拖曳）：
        {sel.map(w => (
          <span key={w} draggable
            onDragStart={e => e.dataTransfer.setData('text/wh', w)} onDragOver={e => e.preventDefault()}
            onDrop={e => { const f = e.dataTransfer.getData('text/wh'); if (f && f !== w) { update(p => ({ ...p, wh: moveIn(p.wh, f, w) })); say('欄位順序已記住') } }}
            className="cursor-grab rounded-full border border-[#e8ddd0] bg-[#f6efe4] px-2.5 py-0.5 text-xs">{w}</span>
        ))}
        <button onClick={() => setWhDlg(true)} className="ml-1 text-xs text-[#7a5230] underline">編輯倉庫</button>
      </div>

      {hits && (
        <div className="mb-3 rounded-lg border border-[#e8ddd0] border-l-[3px] border-l-[#7a5230] bg-white px-3 py-2.5 text-[13px]">
          {hits.length ? (
            <>
              <b>找到 {hits.length}{hits.length >= 30 ? '+' : ''} 筆條碼</b>，點一筆打開它所在倉的條碼明細：
              <table className="mt-1.5 w-full text-xs">
                <tbody>{hits.map(h => {
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
      {!hits && q.trim() && rows.length > 0 && rows.length <= 5 && (
        <div className="mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-[#e8ddd0] border-l-[3px] border-l-[#7a5230] bg-white px-3 py-2 text-[13px]">
          <b>搜尋到 {rows.length} 個品項</b>，點品名可看它在<b>所有倉</b>的位置、數量和全部條碼：
          {rows.map(p => <button key={p.key} onClick={() => setDrawer({ mode: 'item', product: p })} className="rounded-md border border-[#e8ddd0] bg-white px-2 py-0.5 text-xs hover:text-[#7a5230]">{p.name}</button>)}
        </div>
      )}

      <InventoryTable
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
      />

      <BarcodeDrawer target={drawer} allowedWarehouses={allowed} canBarcodes={data.can.barcodes} onClose={() => setDrawer(null)} />
      {whDlg && <WarehouseDialog all={data.warehouses} selected={sel} onClose={() => setWhDlg(false)}
        onApply={wh => { update(p => ({ ...p, wh })); setWhDlg(false) }} />}
      {toast && <div className="fixed bottom-6 left-1/2 z-[60] -translate-x-1/2 rounded-lg bg-[#2c1e12] px-4 py-2 text-sm text-white shadow-lg">{toast}</div>}
    </div>
  )
}
