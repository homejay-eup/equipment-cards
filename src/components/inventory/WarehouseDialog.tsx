'use client'
// Step 54：選擇要看的倉庫（依區域分組；技師區預設收起、可搜尋姓名）。只列出角色看得到的倉。
import { useMemo, useState } from 'react'
import type { InvWarehouse } from './types'

const REGION_ORDER = ['公司', '北區技師', '竹區技師', '中區技師', '南區技師', '送修', '其他']

export default function WarehouseDialog({ all, selected, onApply, onClose }: {
  all: InvWarehouse[]; selected: string[]; onApply: (wh: string[]) => void; onClose: () => void
}) {
  const [pick, setPick] = useState<string[]>(selected)
  const [q, setQ] = useState('')
  const groups = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const w of all) {
      const r = w.region || '其他'
      if (!m.has(r)) m.set(r, [])
      m.get(r)!.push(w.name)
    }
    const top = ['總倉', '固資倉(整新)', '固資倉(舊品)', '供應鏈管理組', '待修倉']
    const rank = (n: string) => { const i = top.indexOf(n); return i < 0 ? 99 : i }
    m.forEach(list => list.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant')))
    return Array.from(m.entries()).sort((a, b) => {
      const ia = REGION_ORDER.indexOf(a[0]), ib = REGION_ORDER.indexOf(b[0])
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [all])
  const names = new Set(all.map(w => w.name))
  const presets = [
    ['只看總倉', ['總倉']],
    ['總倉＋固資倉', ['總倉', '固資倉(整新)', '固資倉(舊品)']],
    ['總倉＋各區辦公室', ['總倉', '北區辦公室', '竹區辦公室', '中區辦公室', '南區辦公室']],
  ] as const
  const toggle = (w: string) => setPick(p => (p.includes(w) ? p.filter(x => x !== w) : [...p, w]))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c1e12]/40 p-4" onClick={onClose}>
      <div className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-xl bg-[#fff9f4] shadow-xl" onClick={e => e.stopPropagation()}>
        <h3 className="px-4 pb-1 pt-3.5 text-[15px] font-semibold text-[#2c1e12]">選擇要看的倉庫</h3>
        <p className="px-4 pb-2 text-xs text-[#a08060]">只列出你的角色能看的倉庫。選好會自動記住，換電腦也一樣。</p>
        <div className="flex flex-wrap gap-1.5 px-4 pb-2">
          {presets.map(([label, ws]) => (
            <button key={label} onClick={() => setPick(ws.filter(w => names.has(w)))}
              className="rounded-md border border-[#e8ddd0] bg-white px-2 py-1 text-[11px] text-[#6b4f38] hover:text-[#7a5230]">{label}</button>
          ))}
          {pick.length > 0 && <button onClick={() => setPick([])} className="rounded-md px-2 py-1 text-[11px] text-[#a08060] underline">全部取消</button>}
        </div>
        <div className="flex-1 overflow-auto px-4 pb-2">
          {groups.map(([region, ws]) => {
            const tech = region.includes('技師')
            const shown = q && tech ? ws.filter(w => w.includes(q)) : ws
            const n = ws.filter(w => pick.includes(w)).length
            return (
              <details key={region} open={!tech || (!!q && shown.length > 0)} className="mb-2 rounded-lg border border-[#e8ddd0] bg-white">
                <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium text-[#2c1e12]">
                  <span>{region}</span><span className="text-xs font-normal text-[#a08060]">{n ? `${n} 已選` : `${ws.length} 個倉`}</span>
                </summary>
                <div className="grid grid-cols-1 gap-x-3 gap-y-1 px-3 pb-2.5 sm:grid-cols-3">
                  {tech && (
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋技師姓名…"
                      className="col-span-full mb-1 rounded-md border border-[#e8ddd0] px-2 py-1 text-sm outline-none focus:border-[#c49a72]" />
                  )}
                  {shown.map(w => (
                    <label key={w} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#4a3422]">
                      <input type="checkbox" className="accent-[#7a5230]" checked={pick.includes(w)} onChange={() => toggle(w)} />{w}
                    </label>
                  ))}
                </div>
              </details>
            )
          })}
        </div>
        <div className="flex items-center gap-2 border-t border-[#e8ddd0] px-4 py-2.5">
          <span className={`text-xs ${pick.length > 8 ? 'text-[#b5451b]' : 'text-[#a08060]'}`}>已選 {pick.length} 個（樞紐表建議 8 欄以內）</span>
          <button onClick={onClose} className="ml-auto rounded-md border border-[rgba(122,82,48,.35)] bg-white px-3 py-1.5 text-sm text-[#7a5230]">取消</button>
          <button disabled={!pick.length} onClick={() => onApply(pick)}
            className="rounded-md bg-[#7a5230] px-3 py-1.5 text-sm text-white hover:bg-[#9c6b42] disabled:opacity-50">套用</button>
        </div>
      </div>
    </div>
  )
}
