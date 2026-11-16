'use client'
// Step 54：匯出盤點表（Google 試算表，存到共用雲端硬碟「設備料卡規格書」/盤點表）
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'
import type { InvProduct } from './types'
import { cell } from './types'

const locKey = (p: InvProduct) => p.pid ?? `名稱:${p.name}`

export default function StocktakeDialog({ products, selected, onClose }: { products: InvProduct[]; selected: string[]; onClose: () => void }) {
  const [mode, setMode] = useState<'merge' | 'each'>('merge')
  const [qty, setQty] = useState<'all' | 'ok'>('all')
  const [zero, setZero] = useState(false)
  const [locs, setLocs] = useState<Record<string, string> | null>(null)
  const [names, setNames] = useState<{ file: string; tab: string; ymd: string } | null>(null)
  const [synced, setSynced] = useState(0)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const [err, setErr] = useState('')
  const [trial, setTrial] = useState<Record<string, string>>({})
  const [info, setInfo] = useState(false)

  useEffect(() => {
    fetch('/api/inventory/stocktake', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (d.error) { setErr(d.error); return }
      setLocs(d.locations ?? {}); setNames(d.names); setSynced(d.synced ?? 0)
    }).catch(() => setErr('讀取倉別失敗'))
  }, [])

  const each = mode === 'each' && selected.length > 1
  const previewWh = each ? [selected[0]] : selected
  const rows = useMemo(() => products
    .map(p => ({ p, n: previewWh.reduce((s, w) => s + cell(p, w)[0] + (qty === 'all' ? cell(p, w)[1] : 0), 0) }))
    .filter(r => zero || r.n > 0)
    .sort((a, b) => (a.p.pid ? 0 : 1) - (b.p.pid ? 0 : 1) || (a.p.pid || a.p.name).localeCompare(b.p.pid || b.p.name, 'zh-Hant')),
  [products, previewWh.join('|'), qty, zero]) // eslint-disable-line react-hooks/exhaustive-deps

  const saveLoc = async (p: InvProduct, v: string) => {
    const loc = v.trim().toUpperCase()
    setLocs(l => ({ ...(l ?? {}), [locKey(p)]: loc }))
    await fetch('/api/inventory/stocktake', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: locKey(p), location: loc }) })
  }
  const create = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/inventory/stocktake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ warehouses: selected, mode, qty, zero }) })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '建立失敗')
      setResult(d)
      window.open(d.url, '_blank', 'noopener')
    } catch (e) { setErr((e as Error).message) }
    setBusy(false)
  }

  const radio = (on: boolean) => `flex cursor-pointer items-center gap-1.5 ${on ? 'text-[#2c1e12]' : 'text-[#6b4f38]'}`
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c1e12]/40 p-4" onClick={onClose}>
      <div className="flex max-h-[90vh] w-full max-w-[740px] flex-col rounded-xl bg-[#fff9f4] shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-1.5 px-4 pb-1.5 pt-3.5">
          <h3 className="text-[15px] font-semibold text-[#2c1e12]">匯出盤點表</h3>
          <button onClick={() => setInfo(v => !v)} aria-label="說明" title="說明" aria-expanded={info}
            className={`rounded-full p-0.5 hover:text-[#7a5230] ${info ? 'text-[#7a5230]' : 'text-[#a08060]'}`}><Info className="h-4 w-4" /></button>
          {synced > 0 && <span className="ml-1 text-xs font-semibold text-[#7a5230]">已從上一份盤點表讀回 {synced} 筆倉別變更</span>}
        </div>
        {info && (
          <p className="mx-4 mb-2 rounded-md bg-[#f6efe4] px-3 py-2 text-xs text-[#6b4f38]">
            建立一份 Google 試算表到共用雲端硬碟的「盤點表」資料夾，格式和顏色都設定好，打開就能填實盤數。
            「倉別」是放在哪個儲位（A／B／C…），跟著品號記住：在這裡或在試算表裡改過，下次匯出都會帶入。
            匯出時「實盤數」和「盤差」是空白，填了實盤數盤差會自動算並變色。下方黃底格子只是預覽，不會存。
          </p>
        )}
        <div className="flex-1 overflow-auto px-4 pb-2 text-[13px]">
          {selected.length > 1 && (
            <div className="mb-1.5">
              <div className="flex flex-wrap items-center gap-4">
                <b>你選了 {selected.length} 個倉</b>
                <label className={radio(mode === 'merge')}><input type="radio" className="accent-[#7a5230]" checked={mode === 'merge'} onChange={() => setMode('merge')} />數量加總，做成一張表</label>
                <label className={radio(mode === 'each')}><input type="radio" className="accent-[#7a5230]" checked={mode === 'each'} onChange={() => setMode('each')} />每個倉分開，各一個分頁</label>
              </div>
            </div>
          )}
          <div className="mb-1.5 flex flex-wrap items-center gap-4">
            <b>數量</b>
            <label className={radio(qty === 'all')}><input type="radio" className="accent-[#7a5230]" checked={qty === 'all'} onChange={() => setQty('all')} />可使用＋不可使用（實際在架上的）</label>
            <label className={radio(qty === 'ok')}><input type="radio" className="accent-[#7a5230]" checked={qty === 'ok'} onChange={() => setQty('ok')} />只算可使用</label>
          </div>
          <label className="mb-2 flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-[#7a5230]" checked={zero} onChange={e => setZero(e.target.checked)} />也列出數量 0 的品項</label>
          <div className="mb-2 rounded-md bg-[#f6efe4] px-3 py-1.5 text-xs">
            檔名：<b className="font-mono">{names?.file ?? '…'}</b>　分頁：<b className="font-mono">{names ? (each ? selected.map(w => names.ymd + w).join('、') : names.tab) : '…'}</b>
          </div>
          <p className="mb-1 text-xs text-[#a08060]">預覽{each ? `（第一個分頁：${selected[0]}）` : ''}</p>
          <div className="overflow-hidden rounded-lg border border-[#e8ddd0]">
            <table className="w-full text-[12px]">
              <thead><tr className="bg-[#7a5230] text-white">{['品號', '品名', '倉別', '總計', '實盤數', '盤差'].map(h => <th key={h} className="px-2 py-1.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {rows.slice(0, 8).map(({ p, n }, i) => {
                  const t = trial[p.key] ?? ''
                  const d = t === '' || isNaN(+t) ? null : +t - n
                  return (
                    <tr key={p.key} className={i % 2 ? 'bg-[#faf6f0]' : 'bg-white'}>
                      <td className="px-2 py-1 text-center font-mono">{p.pid ?? ''}</td>
                      <td className="px-2 py-1">{p.name}</td>
                      <td className="px-2 py-1 text-center">
                        <input defaultValue={locs?.[locKey(p)] ?? ''} disabled={!locs} placeholder="—" onBlur={e => { if ((locs?.[locKey(p)] ?? '') !== e.target.value.trim().toUpperCase()) saveLoc(p, e.target.value) }}
                          className="w-14 rounded border border-dashed border-[#c9b8a4] bg-white px-1 text-center uppercase outline-none focus:border-solid focus:border-[#7a5230]" />
                      </td>
                      <td className="px-2 py-1 text-center tabular-nums">{n}</td>
                      <td className="bg-[#fffbe8] px-2 py-1 text-center">
                        <input value={t} onChange={e => setTrial(s => ({ ...s, [p.key]: e.target.value }))} className="w-14 rounded border border-[#e8ddd0] bg-[#fffbe8] px-1 text-center outline-none" />
                      </td>
                      <td className={`px-2 py-1 text-center font-bold tabular-nums ${d == null ? '' : d > 0 ? 'bg-[#e6f0e0] text-[#3d7a3a]' : d < 0 ? 'bg-[#f8e4dc] text-[#b5451b]' : ''}`}>{d ?? ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-[#a08060]">共 {rows.length.toLocaleString()} 個品項・依品號排序・標題列固定、每欄都有篩選・倉別點一下可直接改，離開格子就記住</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#e8ddd0] px-4 py-2.5">
          {result
            ? <a href={result.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm text-[#7a5230] underline">已建立：{result.name}<ExternalLink className="h-3.5 w-3.5" /></a>
            : err ? <span className="text-xs text-[#b5451b]">{err}</span> : null}
          <button onClick={onClose} className="ml-auto rounded-md border border-[rgba(122,82,48,.35)] bg-white px-3 py-1.5 text-sm text-[#7a5230]">{result ? '關閉' : '取消'}</button>
          {!result && (
            <button onClick={create} disabled={busy || !rows.length}
              className="rounded-md bg-[#7a5230] px-3 py-1.5 text-sm text-white hover:bg-[#9c6b42] disabled:opacity-50">{busy ? '建立中…（約 10 秒）' : '建立 Google 試算表'}</button>
          )}
        </div>
      </div>
    </div>
  )
}
