'use client'
// 角色編輯 › 庫存：可看的倉庫範圍。「全部倉庫」＝不限制；「只限指定」＝只能看勾選的倉（獨立儲存，不跟權限勾選一起存）。
import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'

interface Wh { name: string; region: string }
const REGION_ORDER = ['公司', '北區技師', '竹區技師', '中區技師', '南區技師', '送修', '其他']

export default function RoleWarehouseScope({ roleId, roleName }: { roleId: string; roleName: string }) {
  const [all, setAll] = useState<Wh[]>([])
  const [saved, setSaved] = useState<string[]>([])
  const [mode, setMode] = useState<'all' | 'some'>('all')
  const [sel, setSel] = useState<string[]>([])
  const [open, setOpen] = useState(false)
  const [tmp, setTmp] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [state, setState] = useState<'loading' | 'ready' | 'saving' | 'error'>('loading')
  const [msg, setMsg] = useState('')

  useEffect(() => {
    let off = false
    setState('loading')
    fetch(`/api/roles/${roleId}/inventory-warehouses`, { cache: 'no-store' }).then(async r => {
      const d = await r.json()
      if (!r.ok) throw new Error(d.error || '讀取失敗')
      if (off) return
      setAll(d.all); setSaved(d.warehouses); setSel(d.warehouses); setMode(d.warehouses.length ? 'some' : 'all'); setState('ready')
    }).catch(e => { if (!off) { setMsg((e as Error).message); setState('error') } })
    return () => { off = true }
  }, [roleId])

  const groups = useMemo(() => {
    const m = new Map<string, string[]>()
    for (const w of all) { const r = w.region || '其他'; if (!m.has(r)) m.set(r, []); m.get(r)!.push(w.name) }
    const have = new Set(all.map(w => w.name))
    const gone = Array.from(new Set([...sel, ...tmp])).filter(w => !have.has(w))
    if (gone.length) m.set('已選（目前無庫存資料）', gone)
    const top = ['總倉', '固資倉(整新)', '固資倉(舊品)', '供應鏈管理組', '待修倉']
    const rank = (n: string) => { const i = top.indexOf(n); return i < 0 ? 99 : i }
    m.forEach(l => l.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant')))
    return Array.from(m.entries()).sort((a, b) => {
      const ia = REGION_ORDER.indexOf(a[0]), ib = REGION_ORDER.indexOf(b[0])
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib)
    })
  }, [all, sel, tmp])

  const busy = state === 'saving'
  const effective = mode === 'all' ? [] : sel
  const dirty = state === 'ready' && JSON.stringify([...effective].sort()) !== JSON.stringify([...saved].sort())
  const noneChosen = mode === 'some' && sel.length === 0
  const save = async () => {
    if (noneChosen) { setMsg('請至少勾選一個倉，或改選「全部倉庫」'); return }
    setState('saving'); setMsg('')
    try {
      const r = await fetch(`/api/roles/${roleId}/inventory-warehouses`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ warehouses: effective }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(d.error || '儲存失敗')
      setSaved(effective); setMsg('已儲存（最多 30 秒內生效）'); setState('ready')
    } catch (e) { setMsg((e as Error).message); setState('ready') }
  }
  const toggle = (w: string) => setTmp(p => (p.includes(w) ? p.filter(x => x !== w) : [...p, w]))

  if (state === 'loading') return <p className="mt-3 text-xs text-[#a08060]">讀取倉庫範圍中…</p>
  if (state === 'error') return <p className="mt-3 text-xs text-[#b5451b]">倉庫範圍讀取失敗：{msg}</p>
  return (
    <div className="mt-3 border-t border-[#e8ddd0] pt-3">
      <p className="mb-1.5 text-xs font-semibold text-[#6b4f38]">可看的倉庫</p>
      <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-[#4a3422]">
        <input type="radio" className="accent-[#7a5230]" checked={mode === 'all'} onChange={() => setMode('all')} />全部倉庫（預設）
      </label>
      <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm text-[#4a3422]">
        <input type="radio" className="accent-[#7a5230]" checked={mode === 'some'} onChange={() => setMode('some')} />只限指定的倉庫
      </label>
      {mode === 'some' && (
        <div className="ml-6 mt-1.5">
          <div className="flex flex-wrap gap-1">
            {sel.slice(0, 8).map(w => (
              <span key={w} className="inline-flex items-center gap-1 rounded-md bg-[#f3e9dc] px-2 py-0.5 text-xs text-[#6b4f38]">
                {w}<button aria-label={`移除${w}`} onClick={() => setSel(p => p.filter(x => x !== w))}><X className="h-3 w-3" /></button>
              </span>
            ))}
            {sel.length > 8 && <span className="rounded-md bg-[#f0e8de] px-2 py-0.5 text-xs text-[#a08060]">另 {sel.length - 8} 個</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button onClick={() => { setTmp(sel); setQ(''); setOpen(true) }} className="rounded-md border border-[#e8ddd0] bg-white px-2.5 py-1 text-xs text-[#6b4f38] hover:text-[#7a5230]">選擇倉庫…</button>
            <span className="text-xs text-[#a08060]">共 {sel.length} 個倉</span>
          </div>
        </div>
      )}
      <div className="mt-2 flex items-center gap-2">
        <button disabled={!dirty || busy} onClick={save}
          className="rounded-md bg-[#7a5230] px-3 py-1 text-xs text-white hover:bg-[#9c6b42] disabled:opacity-40">{busy ? '儲存中…' : '儲存倉庫範圍'}</button>
        {msg && <span className={`text-xs ${msg.startsWith('已') ? 'text-[#3d7a3a]' : 'text-[#b5451b]'}`}>{msg}</span>}
      </div>
      <p className="mt-1 text-[11px] text-[#a08060]">指定後，這個角色的人看庫存頁、倉庫選擇、條碼明細、盤點表都只含勾選的倉。之後 CRM 新出現的倉不會自動加入。</p>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2c1e12]/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-[640px] flex-col rounded-xl bg-[#fff9f4] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="px-4 pb-1 pt-3.5 text-[15px] font-semibold text-[#2c1e12]">選擇「{roleName}」可看的倉庫</h3>
            <p className="px-4 pb-2 text-xs text-[#a08060]">只列出目前 CRM 有資料的倉庫。沒勾的倉，這個角色完全看不到。</p>
            <div className="flex items-center gap-2 px-4 pb-2">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="搜尋倉庫／技師姓名（不分區域）…"
                className="flex-1 rounded-md border border-[#e8ddd0] bg-white px-2 py-1 text-sm outline-none focus:border-[#c49a72]" />
              {tmp.length > 0 && <button onClick={() => setTmp([])} className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[#a08060] underline">全部取消</button>}
            </div>
            <div className="flex-1 overflow-auto px-4 pb-2">
              {groups.map(([region, ws]) => {
                const shown = q ? ws.filter(w => w.includes(q)) : ws
                if (q && !shown.length) return null
                const tech = region.includes('技師') || region === '送修'
                const n = ws.filter(w => tmp.includes(w)).length
                const allOn = shown.length > 0 && shown.every(w => tmp.includes(w))
                return (
                  <details key={`${region}-${q ? 'q' : ''}`} open={!tech || !!q} className="mb-2 rounded-lg border border-[#e8ddd0] bg-white">
                    <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-sm font-medium text-[#2c1e12]">
                      <span>{region}</span>
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-xs font-normal text-[#a08060]">{n ? `${n} 已選` : `${ws.length} 個倉`}</span>
                        <button type="button"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); setTmp(p => allOn ? p.filter(x => !shown.includes(x)) : [...p, ...shown.filter(x => !p.includes(x))]) }}
                          className="rounded-md border border-[#e8ddd0] bg-white px-2 py-0.5 text-[11px] font-normal text-[#6b4f38] hover:text-[#7a5230]">
                          {allOn ? '取消全選' : q ? '全選符合的' : '全選'}
                        </button>
                      </span>
                    </summary>
                    <div className="grid grid-cols-1 gap-x-3 gap-y-1 px-3 pb-2.5 sm:grid-cols-3">
                      {shown.map(w => (
                        <label key={w} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[#4a3422]">
                          <input type="checkbox" className="accent-[#7a5230]" checked={tmp.includes(w)} onChange={() => toggle(w)} />{w}
                        </label>
                      ))}
                    </div>
                  </details>
                )
              })}
            </div>
            <div className="flex items-center gap-2 border-t border-[#e8ddd0] px-4 py-2.5">
              <span className="text-xs text-[#a08060]">已選 {tmp.length} 個</span>
              <button onClick={() => setOpen(false)} className="ml-auto rounded-md border border-[rgba(122,82,48,.35)] bg-white px-3 py-1.5 text-sm text-[#7a5230]">取消</button>
              <button onClick={() => { setSel(tmp); setOpen(false) }} className="rounded-md bg-[#7a5230] px-3 py-1.5 text-sm text-white hover:bg-[#9c6b42]">確定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
