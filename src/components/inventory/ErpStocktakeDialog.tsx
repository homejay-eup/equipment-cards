'use client'
// ERP 庫存「匯出盤點表」：版型照 CRM 的 StocktakeDialog，但 ERP 只有每個品號一個總數量，沒有倉庫挑選／分倉模式。
// 倉別（儲位 A／B／C）和 CRM 盤點表共用（依品號）；在這裡改會存、之後兩邊都帶入。試算表裡改的倉別不讀回。
import { useEffect, useMemo, useState } from 'react'
import { ExternalLink, Info } from 'lucide-react'

interface Item { pid: string; name: string; qty: number; hasSerial: boolean }
type Scope = 'none' | 'serial' | 'all'

export default function ErpStocktakeDialog({ items, onClose }: { items: Item[]; onClose: () => void }) {
  const [scope, setScope] = useState<Scope>('none')
  const [zero, setZero] = useState(false)
  const [locs, setLocs] = useState<Record<string, string> | null>(null)
  const [names, setNames] = useState<{ file: string; tab: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ url: string; name: string } | null>(null)
  const [err, setErr] = useState('')
  const [trial, setTrial] = useState<Record<string, string>>({})
  const [info, setInfo] = useState(false)
  const [fq, setFq] = useState('')

  useEffect(() => {
    fetch('/api/inventory/erp/stocktake', { cache: 'no-store' }).then(r => r.json()).then(d => {
      if (d.error) { setErr(d.error); return }
      setLocs(d.locations ?? {}); setNames(d.names)
    }).catch(() => setErr('讀取倉別失敗'))
  }, [])

  const rows = useMemo(() => items
    .filter(i => (scope === 'all' || (scope === 'serial') === i.hasSerial) && (zero || i.qty !== 0))
    .sort((a, b) => a.pid.localeCompare(b.pid, 'zh-Hant', { numeric: true })), [items, scope, zero])
  const t = fq.trim().toLowerCase()
  const shown = useMemo(() => t ? rows.filter(r => r.pid.toLowerCase().includes(t) || r.name.toLowerCase().includes(t)) : rows, [rows, t])

  const saveLoc = async (pid: string, v: string) => {
    const loc = v.trim().toUpperCase()
    setLocs(l => ({ ...(l ?? {}), [pid]: loc }))
    await fetch('/api/inventory/stocktake', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: pid, location: loc }) })
  }
  const create = async () => {
    setBusy(true); setErr('')
    try {
      const r = await fetch('/api/inventory/erp/stocktake', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope, zero }) })
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
          <h3 className="text-[15px] font-semibold text-[#2c1e12]">匯出盤點表（ERP 庫存）</h3>
          <button onClick={() => setInfo(v => !v)} aria-label="說明" title="說明" aria-expanded={info}
            className={`rounded-full p-0.5 hover:text-[#7a5230] ${info ? 'text-[#7a5230]' : 'text-[#a08060]'}`}><Info className="h-4 w-4" /></button>
        </div>
        {info && (
          <p className="mx-4 mb-2 rounded-md bg-[#f6efe4] px-3 py-2 text-xs text-[#6b4f38]">
            依目前這批 ERP 庫存建立一份 Google 試算表到共用雲端硬碟的「盤點表」資料夾，格式和顏色都設定好，打開就能填實盤數。
            「倉別」是放在哪個儲位（A／B／C…），和 CRM 盤點表共用、依品號記住：在這裡改會存，試算表裡改的不會讀回。
            匯出時「實盤數」和「盤差」是空白，填了實盤數盤差會自動算並變色。下方黃底格子只是預覽，不會存。
          </p>
        )}
        <div className="flex-1 overflow-auto px-4 pb-2 text-[13px]">
          <div className="mb-1.5 flex flex-wrap items-center gap-4">
            <b>範圍</b>
            <label className={radio(scope === 'none')}><input type="radio" className="accent-[#7a5230]" checked={scope === 'none'} onChange={() => setScope('none')} />無條碼</label>
            <label className={radio(scope === 'serial')}><input type="radio" className="accent-[#7a5230]" checked={scope === 'serial'} onChange={() => setScope('serial')} />有條碼</label>
            <label className={radio(scope === 'all')}><input type="radio" className="accent-[#7a5230]" checked={scope === 'all'} onChange={() => setScope('all')} />全部</label>
          </div>
          <label className="mb-2 flex cursor-pointer items-center gap-1.5"><input type="checkbox" className="accent-[#7a5230]" checked={zero} onChange={e => setZero(e.target.checked)} />也列出庫存 0 的品項</label>
          <div className="mb-2 rounded-md bg-[#f6efe4] px-3 py-1.5 text-xs">
            檔名：<b className="font-mono">{names?.file ?? '…'}</b>　分頁：<b className="font-mono">{names?.tab ?? '…'}</b>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-xs text-[#a08060]">品項與倉別</span>
            <input value={fq} onChange={e => setFq(e.target.value)} placeholder="搜尋品號或品名…"
              className="ml-auto w-48 rounded-md border border-[#e8ddd0] bg-white px-2 py-1 text-xs outline-none focus:border-[#c49a72]" />
          </div>
          <div className="max-h-[40vh] overflow-auto rounded-lg border border-[#e8ddd0]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 z-10 bg-[#7a5230]"><tr className="bg-[#7a5230] text-white">{['品號', '品名', '倉別', 'ERP 庫存', '實盤數', '盤差'].map(h => <th key={h} className="px-2 py-1.5 font-bold">{h}</th>)}</tr></thead>
              <tbody>
                {shown.map((r, i) => {
                  const v = trial[r.pid] ?? ''
                  const d = v === '' || isNaN(+v) ? null : +v - r.qty
                  return (
                    <tr key={r.pid} className={i % 2 ? 'bg-[#faf6f0]' : 'bg-white'}>
                      <td className="px-2 py-1 text-center font-mono">{r.pid}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-center">
                        <input defaultValue={locs?.[r.pid] ?? ''} disabled={!locs} placeholder="—" onBlur={e => { if ((locs?.[r.pid] ?? '') !== e.target.value.trim().toUpperCase()) saveLoc(r.pid, e.target.value) }}
                          className="w-14 rounded border border-dashed border-[#c9b8a4] bg-white px-1 text-center uppercase outline-none focus:border-solid focus:border-[#7a5230]" />
                      </td>
                      <td className="px-2 py-1 text-center tabular-nums">{r.qty}</td>
                      <td className="bg-[#fffbe8] px-2 py-1 text-center">
                        <input value={v} onChange={e => setTrial(s => ({ ...s, [r.pid]: e.target.value }))} className="w-14 rounded border border-[#e8ddd0] bg-[#fffbe8] px-1 text-center outline-none" />
                      </td>
                      <td className={`px-2 py-1 text-center font-bold tabular-nums ${d == null ? '' : d > 0 ? 'bg-[#e6f0e0] text-[#3d7a3a]' : d < 0 ? 'bg-[#f8e4dc] text-[#b5451b]' : ''}`}>{d ?? ''}</td>
                    </tr>
                  )
                })}
                {!shown.length && <tr><td colSpan={6} className="px-2 py-6 text-center text-[#a08060]">沒有符合的品項</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-xs text-[#a08060]">{t ? `符合 ${shown.length.toLocaleString()} / ` : '共 '}{rows.length.toLocaleString()} 個品項・依品號排序・倉別點一下可直接改，離開格子就記住（黃底「實盤數」只是試填，不會存）</p>
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
