'use client'
// Step 54：樞紐表（列＝產品、欄＝自選倉＋總計）與列表兩種檢視；欄、列、分組都可拖曳排序（順序存到個人設定）
import { useState } from 'react'
import { ChevronRight, ChevronDown, Package } from 'lucide-react'
import { prefetchBarcodes } from './BarcodeDrawer'
import type { InvPrefs, InvProduct } from './types'
import { cell, fmt } from './types'

interface Props {
  rows: InvProduct[]
  prefs: InvPrefs
  allowed: string[]
  delta: Record<string, number>
  onSort: (k: string) => void
  onToggleGroup: (g: string) => void
  onMoveCol: (from: string, to: string) => void
  onMoveRow: (from: string, to: string) => void
  onMoveGroup: (from: string, to: string) => void
  onCell: (p: InvProduct, w: string) => void
  onItem: (p: InvProduct) => void
}

function Other({ p, sel, allowed }: { p: InvProduct; sel: string[]; allowed: string[] }) {
  const ws = allowed.filter(w => !sel.includes(w) && cell(p, w)[0] + cell(p, w)[1])
  if (!ws.length) return null
  const n = ws.reduce((a, w) => a + cell(p, w)[0] + cell(p, w)[1], 0)
  return <span title={ws.join('、')} className="ml-1.5 whitespace-nowrap rounded bg-[#f0e8de] px-1.5 text-[10px] text-[#8a7058]">其他 {ws.length} 倉 +{n.toLocaleString()}</span>
}

function Grip() { return <span className="mr-1 cursor-grab select-none text-[10px] text-[#c9b8a4] opacity-0 group-hover:opacity-100">⋮⋮</span> }

export default function InventoryTable(props: Props) {
  return props.prefs.view === 'pivot' ? <Pivot {...props} /> : <List {...props} />
}

function useDrag() {
  const [drag, setDrag] = useState<{ kind: string; id: string } | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const bind = (kind: string, id: string, onDrop: (from: string, to: string) => void) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { e.stopPropagation(); e.dataTransfer.effectAllowed = 'move'; setDrag({ kind, id }) },
    onDragEnd: () => { setDrag(null); setOver(null) },
    onDragOver: (e: React.DragEvent) => { if (drag?.kind === kind && drag.id !== id) { e.preventDefault(); setOver(kind + id) } },
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (drag?.kind === kind && drag.id !== id) onDrop(drag.id, id); setDrag(null); setOver(null) },
  })
  return { bind, over, dragging: drag }
}

function Pivot({ rows, prefs, allowed, delta, onSort, onToggleGroup, onMoveCol, onMoveRow, onMoveGroup, onCell, onItem }: Props) {
  const sel = prefs.wh
  const { bind, over } = useDrag()
  const arrow = (k: string) => (prefs.sort.k === k ? <span className="ml-0.5 text-[10px]">{prefs.sort.d > 0 ? '▲' : '▼'}</span> : null)
  const sum = (list: InvProduct[], w: string) => list.reduce((a, p) => a + cell(p, w)[0], 0)
  const th = 'whitespace-nowrap px-2.5 py-2 text-[12px] font-medium text-[#6b4f38] cursor-pointer select-none'

  const line = (p: InvProduct) => {
    const tot = sel.reduce((a, w) => a + cell(p, w)[0], 0)
    const tb = sel.reduce((a, w) => a + cell(p, w)[1], 0)
    const d = delta[p.key]
    return (
      <tr key={p.key} {...bind('row', p.key, onMoveRow)}
        className={`group border-t border-[#f0e8de] hover:bg-[#fdf8f2] ${over === 'row' + p.key ? 'shadow-[inset_0_2px_0_#7a5230]' : ''} ${d ? 'bg-[#fff3d6]' : ''}`}>
        <td className="sticky left-0 z-[1] w-[96px] min-w-[96px] max-w-[96px] truncate bg-white px-2.5 py-1.5 font-mono text-[12px] text-[#6b4f38] group-hover:bg-[#fdf8f2]">
          <Grip />{p.pid ?? '—'}
        </td>
        <td className="sticky left-[96px] z-[1] min-w-[180px] bg-white px-2.5 lg:whitespace-nowrap py-1.5 group-hover:bg-[#fdf8f2] shadow-[1px_0_0_#e8ddd0]">
          <button onClick={() => onItem(p)} title="看這個品項在所有倉的位置、數量與條碼" className="text-left text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{p.name}</button>
          {!p.onCard && <span className="ml-1 rounded bg-[#f0e8de] px-1 text-[10px] text-[#a08060]">未對應料卡</span>}
          <Other p={p} sel={sel} allowed={allowed} />
        </td>
        {sel.map(w => {
          const [o, b] = cell(p, w)
          return (
            <td key={w} className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">
              {o || b ? <button onMouseEnter={() => prefetchBarcodes(p.key, w)} onClick={() => onCell(p, w)} className="text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{fmt(o) || '0'}</button> : null}
              {b ? <span title="不可使用" className="ml-1 rounded bg-[#f8e4dc] px-1 text-[10px] text-[#b5451b]">{b}</span> : null}
            </td>
          )
        })}
        <td className="whitespace-nowrap bg-[#faf6f0] px-2.5 py-1.5 text-right font-semibold tabular-nums">
          {fmt(tot) || '0'}
          {d ? <span className={`ml-1 text-[10px] ${d < 0 ? 'text-[#b5451b]' : 'text-[#3d7a3a]'}`}>{d > 0 ? '+' : ''}{d}</span> : null}
          {tb ? <span className="ml-1 rounded bg-[#f8e4dc] px-1 text-[10px] text-[#b5451b]">{tb}</span> : null}
        </td>
      </tr>
    )
  }

  let body: React.ReactNode
  if (prefs.grp === 'type') {
    const types = [...prefs.gorder, ...Array.from(new Set(rows.map(r => r.type))).filter(t => !prefs.gorder.includes(t))]
    body = types.map(t => {
      const g = rows.filter(r => r.type === t)
      if (!g.length) return null
      const c = !!prefs.col[t]
      return [
        <tr key={'g' + t} {...bind('grp', t, onMoveGroup)} onClick={() => onToggleGroup(t)}
          className={`group cursor-pointer border-t border-[#e8ddd0] bg-[#f6efe4] font-semibold ${over === 'grp' + t ? 'shadow-[inset_0_2px_0_#7a5230]' : ''}`}>
          <td colSpan={2} className="sticky left-0 z-[1] bg-[#f6efe4] px-2.5 py-1.5 text-[13px]">
            <Grip /><span className="mr-1 inline-block w-4 rounded border border-[#c9b8a4] text-center text-[11px] leading-4">{c ? '+' : '−'}</span>{t}（{g.length} 項）
          </td>
          {sel.map(w => <td key={w} className="px-2.5 py-1.5 text-right tabular-nums text-[13px]">{fmt(sum(g, w))}</td>)}
          <td className="bg-[#efe5d6] px-2.5 py-1.5 text-right tabular-nums text-[13px]">{fmt(sel.reduce((a, w) => a + sum(g, w), 0))}</td>
        </tr>,
        ...(c ? [] : g.map(line)),
      ]
    })
  } else body = rows.map(line)

  if (!rows.length) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">找不到符合的產品</div>
  return (
    <div className="max-h-[70vh] overflow-auto rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
      <table className="min-w-full border-separate border-spacing-0">
        <thead className="sticky top-0 z-[2] bg-[#faf6f0]">
          <tr>
            <th className={`${th} sticky left-0 z-[3] w-[96px] min-w-[96px] max-w-[96px] bg-[#faf6f0] text-left`} onClick={() => onSort('pid')}>品號{arrow('pid')}</th>
            <th className={`${th} sticky left-[96px] z-[3] bg-[#faf6f0] text-left shadow-[1px_0_0_#e8ddd0]`} onClick={() => onSort('name')}>品名{arrow('name')}</th>
            {sel.map(w => (
              <th key={w} {...bind('col', w, onMoveCol)} onClick={() => onSort(w)} title="拖曳可調整欄位順序"
                className={`${th} group text-right ${over === 'col' + w ? 'shadow-[inset_2px_0_0_#7a5230]' : ''}`}><Grip />{w}{arrow(w)}</th>
            ))}
            <th className={`${th} bg-[#efe5d6] text-right`} onClick={() => onSort('tot')}>總計{arrow('tot')}</th>
          </tr>
        </thead>
        <tbody>{body}</tbody>
        <tfoot className="sticky bottom-0 z-[2]">
          <tr className="bg-[#f6efe4] font-semibold">
            <td colSpan={2} className="sticky left-0 bg-[#f6efe4] px-2.5 py-2 text-[13px]">總計</td>
            {sel.map(w => <td key={w} className="px-2.5 py-2 text-right tabular-nums text-[13px]">{fmt(sum(rows, w))}</td>)}
            <td className="bg-[#efe5d6] px-2.5 py-2 text-right tabular-nums text-[13px]">{fmt(sel.reduce((a, w) => a + sum(rows, w), 0))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function List({ rows, prefs, allowed, onMoveRow, onCell, onItem }: Props) {
  const sel = prefs.wh
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const { bind, over } = useDrag()
  if (!rows.length) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">找不到符合的產品</div>
  return (
    <div className="space-y-1.5">
      {rows.map(p => {
        const ws = sel.filter(w => cell(p, w)[0] + cell(p, w)[1])
        const o = sel.reduce((a, w) => a + cell(p, w)[0], 0)
        const b = sel.reduce((a, w) => a + cell(p, w)[1], 0)
        return (
          <div key={p.key} {...bind('row', p.key, onMoveRow)}
            className={`group rounded-lg border border-[#e8ddd0] bg-white ${over === 'row' + p.key ? 'shadow-[inset_0_2px_0_#7a5230]' : ''}`}>
            <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2" onClick={() => setOpen(s => ({ ...s, [p.key]: !s[p.key] }))}>
              {open[p.key] ? <ChevronDown className="h-4 w-4 text-[#a08060]" /> : <ChevronRight className="h-4 w-4 text-[#a08060]" />}
              <Package className="h-8 w-8 shrink-0 rounded bg-[#faf6f0] p-1.5 text-[#c9b8a4]" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] text-[#a08060]">{p.pid ?? '未對應料卡'}</div>
                <div className="text-sm">
                  <button onClick={e => { e.stopPropagation(); onItem(p) }} className="text-left hover:text-[#7a5230] hover:underline">{p.name}</button>
                  <Other p={p} sel={sel} allowed={allowed} />
                </div>
                <span className="mr-1 rounded bg-[#f0e8de] px-1.5 text-[10px] text-[#8a7058]">{p.type}</span>
                <span className="rounded bg-[#f0e8de] px-1.5 text-[10px] text-[#8a7058]">{ws.length} 個倉有貨</span>
              </div>
              <div className="text-right">
                <b className="text-lg tabular-nums">{o.toLocaleString()}</b>
                {b ? <span className="ml-1 rounded bg-[#f8e4dc] px-1 text-[10px] text-[#b5451b]">不可用 {b}</span> : null}
                <div className="text-[10px] text-[#a08060]">可使用</div>
              </div>
            </div>
            {open[p.key] && (
              <table className="mx-3 mb-2.5 w-[calc(100%-1.5rem)] text-[13px]">
                <thead><tr className="text-[11px] text-[#6b4f38]"><th className="py-1 text-left font-medium">倉庫</th><th className="py-1 text-right font-medium">可使用</th><th className="py-1 text-right font-medium">不可使用</th></tr></thead>
                <tbody>{ws.map(w => (
                  <tr key={w} className="border-t border-[#f0e8de]">
                    <td className="py-1">{w}</td>
                    <td className="py-1 text-right"><button onMouseEnter={() => prefetchBarcodes(p.key, w)} onClick={() => onCell(p, w)} className="tabular-nums hover:text-[#7a5230] hover:underline">{cell(p, w)[0].toLocaleString()}</button></td>
                    <td className={`py-1 text-right tabular-nums ${cell(p, w)[1] ? 'text-[#b5451b]' : 'text-[#c9b8a4]'}`}>{cell(p, w)[1]}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        )
      })}
    </div>
  )
}
