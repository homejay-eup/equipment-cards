'use client'
// ERP（鼎新 Cosmos）品號庫存。和 CRM 庫存分開授權（view_erp_inventory）。
// 資料由公司電腦在使用者登入 ERP 後背景匯出，不能即時刷新；預設只列「無條碼」品項（ERP 對這類最準），CRM 管有條碼的。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronUp, FileSpreadsheet, Info, Search, Upload } from 'lucide-react'
import ErpStocktakeDialog from './ErpStocktakeDialog'
import { readSwr, writeSwr } from '@/lib/swrCache'

interface ErpItem { pid: string; name: string; qty: number; wh: string | null; vendor: string | null; hasSerial: boolean; ownBarcode: boolean; prefix: string | null; warranty: number | null }
interface Run { exportedAt: string; uploadedAt: string; rows: number }
type Scope = 'none' | 'serial' | 'all'
type SortKey = 'pid' | 'name' | 'qty'

const fmt = (iso: string) => { const d = new Date(iso); return `${d.getMonth() + 1}/${d.getDate()} ${d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })}` }
const ageText = (iso: string) => {
  const h = (Date.now() - new Date(iso).getTime()) / 3600000
  return h < 1 ? '1 小時內' : h < 24 ? `${Math.floor(h)} 小時前` : `${Math.floor(h / 24)} 天前`
}

export default function ErpInventory({ switcher }: { switcher?: React.ReactNode }) {
  const [items, setItems] = useState<ErpItem[] | null>(null)
  const [run, setRun] = useState<Run | null>(null)
  const [err, setErr] = useState('')
  const [q, setQ] = useState('')
  const [scope, setScope] = useState<Scope>('none')
  const [onlyStock, setOnlyStock] = useState(true)
  const [sort, setSort] = useState<{ k: SortKey; dir: 1 | -1 }>({ k: 'pid', dir: 1 })

  const [canUpload, setCanUpload] = useState(false)
  const [canStocktake, setCanStocktake] = useState(false)
  const [stDlg, setStDlg] = useState(false)
  const [upMsg, setUpMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [drag, setDrag] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [help, setHelp] = useState(false)
  const helpRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!help) return
    const off = (e: MouseEvent) => { if (!helpRef.current?.contains(e.target as Node)) setHelp(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setHelp(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [help])

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/inventory/erp', { cache: 'no-store' })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取 ERP 庫存失敗')
      writeSwr('erp-main', d)
      setItems(d.items); setRun(d.run); setCanUpload(!!d.can?.upload); setCanStocktake(!!d.can?.stocktake); setErr('')
    } catch (e) { setErr((e as Error).message) }
  }, [])
  useEffect(() => {
    const c = readSwr<{ items: ErpItem[]; run: Run | null; can?: { upload?: boolean; stocktake?: boolean } }>('erp-main')   // 先秀上次的資料
    if (c?.items) { setItems(c.items); setRun(c.run); setCanUpload(!!c.can?.upload); setCanStocktake(!!c.can?.stocktake) }
    load()
  }, [load])

  const upload = async (f: File | undefined) => {
    if (!f || uploading) return
    setUploading(true); setUpMsg(null)
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('lastModified', String(f.lastModified))
      const r = await fetch('/api/inventory/erp/upload', { method: 'POST', body: fd })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || '上傳失敗')
      await load()
      setUpMsg({ ok: true, text: `已更新：${d.rows.toLocaleString()} 個品號（無條碼 ${d.noBarcode.toLocaleString()}、自有條碼 ${d.ownBarcode.toLocaleString()}）` })
    } catch (e) { setUpMsg({ ok: false, text: (e as Error).message }) }
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const rows = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const list = (items ?? []).filter(i =>
      (scope === 'all' || (scope === 'serial') === i.hasSerial) &&
      (!onlyStock || i.qty !== 0) &&
      (!qq || i.pid.toLowerCase().includes(qq) || i.name.toLowerCase().includes(qq)))
    return list.sort((a, b) => {
      const c = sort.k === 'qty' ? a.qty - b.qty : String(a[sort.k] ?? '').localeCompare(String(b[sort.k] ?? ''), 'zh-Hant', { numeric: true })
      return sort.dir * c || a.pid.localeCompare(b.pid)
    })
  }, [items, q, scope, onlyStock, sort])
  const total = useMemo(() => rows.reduce((s, r) => s + r.qty, 0), [rows])

  const uploadBox = canUpload ? (
          <div className="ml-auto flex items-center gap-2"
            onDragOver={e => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files?.[0]) }}>
            <input ref={fileRef} type="file" accept=".xlsx" className="hidden" onChange={e => upload(e.target.files?.[0])} />
            <button type="button" disabled={uploading} onClick={() => fileRef.current?.click()}
              className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[13px] disabled:opacity-60 ${drag ? 'border-[#7a5230] bg-[#f3e9dc] text-[#7a5230]' : 'border-[rgba(122,82,48,.35)] bg-white text-[#7a5230] hover:bg-[#faf6f0]'}`}>
              <Upload className="h-3.5 w-3.5" />{uploading ? '上傳中…' : drag ? '放開就上傳' : '上傳匯出檔更新'}
            </button>
          </div>
        
  ) : null
  const msgs = (
    <>
      {upMsg && <p className={`mb-3 text-xs ${upMsg.ok ? 'text-[#3d7a3a]' : 'text-[#b5451b]'}`}>{upMsg.text}</p>}
    </>
  )
  if (err) return <div className="mx-auto max-w-5xl px-4 py-12 text-center text-sm text-[#b5451b]">{err}</div>
  if (!items) return <div className="mx-auto max-w-5xl px-4 py-12 text-center text-sm text-[#a08060]">讀取 ERP 庫存中…</div>
  if (!run) return (
    <div className="mx-auto max-w-5xl px-4 py-12 text-center text-sm text-[#a08060]">
      <p className="mb-3">還沒有 ERP 庫存資料（公司電腦登入 ERP 後會自動匯出）</p>
      <div className="flex justify-center">{uploadBox}</div>
      <div className="mt-3">{msgs}</div>
    </div>
  )

  const th = (k: SortKey, label: string, cls = '') => (
    <th className={`px-2.5 py-2 font-medium ${cls}`} aria-sort={sort.k === k ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => setSort(s => s.k === k ? { k, dir: (s.dir * -1) as 1 | -1 } : { k, dir: k === 'qty' ? -1 : 1 })}
        className={`inline-flex items-center gap-0.5 hover:text-[#7a5230] ${sort.k === k ? 'font-semibold text-[#2c1e12]' : ''}`}>
        {label}{sort.k === k ? (sort.dir === 1 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />) : null}
      </button>
    </th>
  )
  const seg = (on: boolean) => `px-3 py-1.5 text-[13px] ${on ? 'bg-[#e8ddd0] font-semibold text-[#2c1e12]' : 'bg-white text-[#6b4f38] hover:text-[#7a5230]'}`
  const old = Date.now() - new Date(run.exportedAt).getTime() > 36 * 3600000

  return (
    <div className="mx-auto max-w-[1400px] px-4 pb-16 pt-4">
      <div className="mb-3 flex flex-wrap items-start gap-3">
        <div className="relative mr-auto" ref={helpRef}>
          <h2 className="flex items-center gap-1.5 text-lg font-semibold text-[#2c1e12]">
            ERP 庫存
            <button type="button" aria-label="資料來源與更新說明" aria-expanded={help} onClick={() => setHelp(v => !v)}
              className="rounded-full p-0.5 text-[#a08060] hover:bg-[#f0e8de] hover:text-[#7a5230]"><Info className="h-4 w-4" /></button>
          </h2>
          {help && (
            <div role="dialog" className="absolute left-0 top-full z-30 mt-1 w-[min(420px,90vw)] rounded-lg border border-[#e8ddd0] bg-white p-3 text-xs leading-relaxed text-[#6b4f38] shadow-lg">
              <p>數量來自鼎新 ERP「品號資料建立作業」；公司電腦在登入 ERP 後自動匯出，不能即時刷新。有條碼的品項請看 CRM 庫存（較準）。</p>
              {canUpload && <p className="mt-2">手動更新：在 ERP「品號資料建立作業」查詢、把資料捲到最後一筆後匯出 Excel，再把檔案按「上傳匯出檔更新」選取（或直接拖進來）。</p>}
            </div>
          )}
        </div>
        {switcher}
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-[#e8ddd0] bg-white px-3 py-2.5 text-[13px] text-[#6b4f38]">
        <span className={`h-2 w-2 rounded-full ${old ? 'bg-[#c98a2b]' : 'bg-[#3d7a3a]'}`} />
        <span>資料時間 <b className="text-[#2c1e12]">{fmt(run.exportedAt)}</b>（{ageText(run.exportedAt)}）・共 {run.rows.toLocaleString()} 個品號</span>
        {old && <span className="text-xs text-[#b5451b]">資料偏舊：ERP 要登入後才會更新</span>}
        <div className="ml-auto flex items-center gap-2">
          {canStocktake && (
            <button type="button" onClick={() => setStDlg(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(122,82,48,.35)] bg-white px-3 py-1.5 text-[13px] text-[#7a5230] hover:bg-[#faf6f0]">
              <FileSpreadsheet className="h-3.5 w-3.5" />匯出盤點表
            </button>
          )}
          {uploadBox}
        </div>
      </div>
      {stDlg && <ErpStocktakeDialog items={items} onClose={() => setStDlg(false)} />}
      {upMsg && <p className={`mb-3 -mt-1 text-xs ${upMsg.ok ? 'text-[#3d7a3a]' : 'text-[#b5451b]'}`}>{upMsg.text}</p>}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-[#a08060]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋品號或品名…"
            className="w-full rounded-lg border border-[#e8ddd0] bg-white py-2 pl-8 pr-3 text-sm outline-none focus:border-[#c49a72]" />
        </div>
        <div className="inline-flex overflow-hidden rounded-lg border border-[#e8ddd0]">
          <button className={seg(scope === 'none')} onClick={() => setScope('none')}>無條碼</button>
          <button className={seg(scope === 'serial')} onClick={() => setScope('serial')}>有條碼</button>
          <button className={seg(scope === 'all')} onClick={() => setScope('all')}>全部</button>
        </div>
        <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#6b4f38]">
          <input type="checkbox" className="accent-[#7a5230]" checked={onlyStock} onChange={e => setOnlyStock(e.target.checked)} />只看有庫存
        </label>
      </div>
      {scope !== 'none' && <p className="mb-2 text-xs text-[#a08060]">有條碼品項的數量以 CRM 庫存為準，這裡的 ERP 數量僅供對照。</p>}
      <div className="overflow-hidden rounded-lg border border-[#e8ddd0] bg-white">
        <div className="max-h-[68vh] overflow-auto">
          <table className="w-full text-[13px]">
            <thead className="sticky top-0 z-10 bg-[#faf6f0]">
              <tr className="text-left text-[11px] text-[#6b4f38]">
                {th('pid', '品號')}{th('name', '品名')}{th('qty', '庫存', 'text-right')}
                <th className="px-2.5 py-2 font-medium">條碼管控</th><th className="px-2.5 py-2 font-medium">廠商</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.pid} className="border-t border-[#f0e8de] hover:bg-[#faf6f0]">
                  <td className="whitespace-nowrap px-2.5 py-1.5 font-mono text-[12px]">{r.pid}</td>
                  <td className="px-2.5 py-1.5">{r.name}</td>
                  <td className={`whitespace-nowrap px-2.5 py-1.5 text-right font-semibold tabular-nums ${r.qty < 0 ? 'text-[#b5451b]' : ''}`}>{r.qty.toLocaleString()}</td>
                  <td className="whitespace-nowrap px-2.5 py-1.5 text-xs text-[#6b4f38]">
                    {!r.hasSerial ? '無' : r.ownBarcode ? <>自有條碼{r.prefix ? <span className="ml-1 font-mono text-[#a08060]">{r.prefix}</span> : null}</> : '廠商序號'}
                  </td>
                  <td className="px-2.5 py-1.5 text-xs text-[#6b4f38]">{r.vendor ?? ''}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={5} className="px-2.5 py-8 text-center text-[#a08060]">沒有符合的品項</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-1.5 text-xs text-[#a08060]">共 {rows.length.toLocaleString()} 個品項・庫存合計 {total.toLocaleString()}</p>
    </div>
  )
}
