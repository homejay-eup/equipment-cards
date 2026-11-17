'use client'
// Step 55：移交出去／待接收／持有過久 三個分頁共用的畫面（樞紐表／列表、點數字看條碼、匯出 Excel）
//   out：A 倉移交出去、對方還沒接收（欄＝送出倉）；in：B 倉待接收（欄＝接收倉）；idle：技師手上超過 30 天沒異動（欄＝技師倉）
// 搜尋、倉庫範圍、樞紐表／列表、分組由上層共用（切分頁不用重設）。
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy, Download, X } from 'lucide-react'
import type { InvProduct, TransferItem } from './types'
import { TYPE_ORDER } from './types'

export type TabKind = 'out' | 'in' | 'idle'
const UNKNOWN = '（接收倉未知）'
const THRESH: Record<TabKind, number> = { out: 7, in: 7, idle: 90 }

const parseAt = (s: string | null) => (s ? new Date(s.replace(/\//g, '-').replace(' ', 'T') + '+08:00').getTime() : NaN)
export const daysOf = (s: string | null) => { const t = parseAt(s); return Number.isNaN(t) ? 0 : Math.max(0, Math.floor((Date.now() - t) / 86400000)) }
const day = (s: string | null) => (s ? s.replace(/\//g, '-').slice(0, 10) : '')
const opLabel = (o: string | null) => (o ?? '').replace('CRM_', 'CRM ').replace('APP_', 'APP ')
const keyOf = (it: TransferItem) => it.product_id ?? `name:${it.category || '其他'}|${it.name}`

interface Row { key: string; pid: string | null; name: string; type: string; cells: Map<string, TransferItem[]>; all: TransferItem[] }
interface Props {
  kind: TabKind
  items: TransferItem[] | null
  loading: boolean
  error: string
  products: InvProduct[]
  scope: string[]            // 我選的倉庫（欄位順序）
  scopeAll: boolean          // true＝不限倉庫範圍（有搜尋字時也一樣）
  q: string
  view: 'pivot' | 'list'
  grp: 'type' | 'none'
  note: React.ReactNode      // 資料時間說明
  onCopied: (msg: string) => void
}

export default function TransferTab({ kind, items, loading, error, products, scope, scopeAll, q, view, grp, note, onCopied }: Props) {
  const thr = THRESH[kind]
  const [overdueOnly, setOverdueOnly] = useState(false)
  const [withSim, setWithSim] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<{ row: Row; col: string | null } | null>(null)

  const pmap = useMemo(() => new Map(products.map(p => [p.key, p])), [products])
  const colOf = (it: TransferItem) => (kind === 'in' ? it.to ?? UNKNOWN : it.from)

  const { rows, cols, matched, hidden } = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const everything = scopeAll || !!qq
    const inScope = new Set(scope)
    const byKey = new Map<string, Row>()
    const colCount = new Map<string, number>()
    let matched = 0, hidden = 0
    for (const it of items ?? []) {
      const col = colOf(it)
      if (kind === 'idle' && !withSim && it.category === 'Sim卡') continue
      const key = keyOf(it)
      const p = pmap.get(key)
      const name = p?.name ?? it.name, pid = p?.pid ?? it.product_id
      if (qq && !(it.barcode.toLowerCase().includes(qq) || name.toLowerCase().includes(qq) || (pid ?? '').toLowerCase().includes(qq) || it.name.toLowerCase().includes(qq))) continue
      if (kind !== 'idle' && overdueOnly && daysOf(it.at) <= thr) continue
      if (!everything && !inScope.has(col)) { hidden++; continue }
      matched++
      let r = byKey.get(key)
      if (!r) { r = { key, pid, name, type: p?.type ?? it.category ?? '其他', cells: new Map(), all: [] }; byKey.set(key, r) }
      const list = r.cells.get(col) ?? []
      list.push(it); r.cells.set(col, list); r.all.push(it)
      colCount.set(col, (colCount.get(col) ?? 0) + 1)
    }
    const cols = everything
      ? Array.from(colCount.keys()).sort((a, b) => (colCount.get(b)! - colCount.get(a)!) || a.localeCompare(b))
      : scope
    const rows = Array.from(byKey.values()).sort((a, b) => (a.pid ?? '~' + a.name).localeCompare(b.pid ?? '~' + b.name))
    return { rows, cols, matched, hidden }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pmap, scope, scopeAll, q, overdueOnly, withSim, kind])

  const over = (list: TransferItem[]) => list.filter(i => daysOf(i.at) > thr).length
  const cnt = (r: Row, c: string) => r.cells.get(c)?.length ?? 0
  const totalOf = (list: Row[], c?: string) => list.reduce((a, r) => a + (c ? cnt(r, c) : r.all.length), 0)
  const overOf = (list: Row[], c?: string) => list.reduce((a, r) => a + over(c ? r.cells.get(c) ?? [] : r.all), 0)

  const groups = useMemo(() => {
    if (grp !== 'type' || view !== 'pivot') return [{ t: '', rows }]
    const types = [...TYPE_ORDER, ...Array.from(new Set(rows.map(r => r.type))).filter(t => !TYPE_ORDER.includes(t))]
    return types.map(t => ({ t, rows: rows.filter(r => r.type === t) })).filter(g => g.rows.length)
  }, [rows, grp, view])

  const detailItems = useMemo(() => {
    if (!detail) return []
    const base = detail.col ? detail.row.cells.get(detail.col) ?? [] : detail.row.all
    return [...base].sort((a, b) => daysOf(b.at) - daysOf(a.at))
  }, [detail])

  const badge = (n: number) => (n ? <span title={kind === 'idle' ? `超過 ${thr} 天` : `等超過 ${thr} 天`} className="ml-1 rounded bg-[#f8e4dc] px-1 text-[10px] text-[#b5451b]">{n}</span> : null)
  const th = 'whitespace-nowrap px-2.5 py-2 text-[12px] font-medium text-[#6b4f38]'

  // ---- 匯出 Excel：明細＋總覽兩張工作表，依目前的搜尋、倉庫範圍與開關 ----
  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const all = rows.flatMap(r => r.all)
    const head = kind === 'idle'
      ? ['品類', '品名', '條碼', '持有技師', '最後異動', '最後動作', '放了(天)']
      : ['品類', '品名', '條碼', '送出倉', '接收倉', '移交人', '移交日期', '等待天數']
    const detailRows = rows.flatMap(r => r.all.map(i => kind === 'idle'
      ? [r.type, r.name, i.barcode, i.from, day(i.at), opLabel(i.op), daysOf(i.at)]
      : [r.type, r.name, i.barcode, i.from, i.to ?? '（未知）', i.who ?? '', day(i.at), daysOf(i.at)]))
    const sumHead = ['品類', '品名', ...cols, '總計', `其中超過${thr}天`]
    const sumRows = rows.map(r => [r.type, r.name, ...cols.map(c => cnt(r, c) || ''), r.all.length, over(r.all)])
    sumRows.push(['', '總計', ...cols.map(c => totalOf(rows, c) || ''), all.length, over(all)])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([head, ...detailRows]), '明細')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([sumHead, ...sumRows]), '總覽')
    const d = new Date(Date.now() + 8 * 3600_000).toISOString().slice(0, 10).replace(/-/g, '')
    const title = kind === 'out' ? '移交中_移交出去' : kind === 'in' ? '移交中_待接收' : '持有過久_技師'
    XLSX.writeFile(wb, `${title}_${d}.xlsx`)
  }

  const copyBarcodes = (list: TransferItem[]) => {
    navigator.clipboard?.writeText(list.map(i => i.barcode).join('\n')).then(() => onCopied(`已複製 ${list.length} 個條碼`), () => onCopied('複製失敗'))
  }
  // 持有過久：依技師分組的寄回清單（貼到 LINE 用）
  const copyReturnList = () => {
    const by = new Map<string, TransferItem[]>()
    for (const r of rows) for (const i of r.all) by.set(i.from, [...(by.get(i.from) ?? []), i])
    const text = Array.from(by.entries()).map(([w, list]) =>
      `【${w}】共 ${list.length} 件\n` + list.map(i => `${i.name}  ${i.barcode}  (放了 ${daysOf(i.at)} 天)`).join('\n')).join('\n\n')
    navigator.clipboard?.writeText(text).then(() => onCopied('已複製寄回清單'), () => onCopied('複製失敗'))
  }

  if (error) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-10 text-center text-sm text-[#b5451b]">{error}</div>
  if (loading || !items) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">讀取中…</div>

  const toggleBar = (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[13px] text-[#6b4f38]">
      {kind !== 'idle' && (
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[#e8ddd0] bg-white px-2.5 py-1">
          <input type="checkbox" checked={overdueOnly} onChange={e => setOverdueOnly(e.target.checked)} />只看等超過 {thr} 天
        </label>
      )}
      {kind === 'idle' && (
        <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[#e8ddd0] bg-white px-2.5 py-1">
          <input type="checkbox" checked={withSim} onChange={e => setWithSim(e.target.checked)} />含 Sim 卡
        </label>
      )}
      <span className="text-xs text-[#a08060]">{note}</span>
      <span className="ml-auto flex items-center gap-2">
        {kind === 'idle' && <button onClick={copyReturnList} disabled={!matched} className="inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] bg-white px-2.5 py-1 text-[#7a5230] hover:bg-[#faf6f0] disabled:opacity-50"><Copy className="h-3.5 w-3.5" />複製寄回清單</button>}
        <button onClick={exportXlsx} disabled={!matched} className="inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] bg-white px-2.5 py-1 text-[#7a5230] hover:bg-[#faf6f0] disabled:opacity-50"><Download className="h-3.5 w-3.5" />匯出</button>
      </span>
    </div>
  )

  const empty = (
    <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">
      {matched === 0 && hidden > 0 ? `目前選的倉庫範圍內沒有項目；範圍外還有 ${hidden} 筆，可切到「全部倉庫」查看` : '沒有符合的項目'}
    </div>
  )

  return (
    <div>
      {toggleBar}
      {!rows.length ? empty : view === 'pivot' ? (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-[2] bg-[#faf6f0]">
              <tr>
                <th className={`${th} sticky left-0 z-[3] w-[128px] min-w-[128px] max-w-[128px] bg-[#faf6f0] text-left`}>品號</th>
                <th className={`${th} sticky left-[128px] z-[3] bg-[#faf6f0] text-left shadow-[1px_0_0_#e8ddd0]`}>品名</th>
                {cols.map(c => <th key={c} className={`${th} text-right`}>{c}</th>)}
                <th className={`${th} bg-[#efe5d6] text-right`}>總計</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(g => [
                g.t ? (
                  <tr key={'g' + g.t} onClick={() => setCollapsed(s => ({ ...s, [g.t]: !s[g.t] }))} className="cursor-pointer border-t border-[#e8ddd0] bg-[#f6efe4] font-semibold">
                    <td colSpan={2} className="sticky left-0 z-[1] bg-[#f6efe4] px-2.5 py-1.5 text-[13px]">
                      <span className="mr-1 inline-block w-4 rounded border border-[#c9b8a4] text-center text-[11px] leading-4">{collapsed[g.t] ? '+' : '−'}</span>{g.t}（{g.rows.length} 項）
                    </td>
                    {cols.map(c => <td key={c} className="px-2.5 py-1.5 text-right tabular-nums text-[13px]">{totalOf(g.rows, c) || ''}</td>)}
                    <td className="bg-[#efe5d6] px-2.5 py-1.5 text-right tabular-nums text-[13px]">{totalOf(g.rows)}{badge(overOf(g.rows))}</td>
                  </tr>
                ) : null,
                ...(g.t && collapsed[g.t] ? [] : g.rows.map(r => (
                  <tr key={r.key} className="group border-t border-[#f0e8de] hover:bg-[#fdf8f2]">
                    <td className="sticky left-0 z-[1] w-[128px] min-w-[128px] max-w-[128px] truncate bg-white px-2.5 py-1.5 font-mono text-[12px] text-[#6b4f38] group-hover:bg-[#fdf8f2]">{r.pid ?? '—'}</td>
                    <td className="sticky left-[128px] z-[1] min-w-[180px] whitespace-nowrap bg-white px-2.5 py-1.5 shadow-[1px_0_0_#e8ddd0] group-hover:bg-[#fdf8f2]">
                      <button onClick={() => setDetail({ row: r, col: null })} className="text-left text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{r.name}</button>
                    </td>
                    {cols.map(c => {
                      const n = cnt(r, c)
                      return (
                        <td key={c} className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">
                          {n ? <><button onClick={() => setDetail({ row: r, col: c })} className="text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{n}</button>{badge(over(r.cells.get(c)!))}</> : null}
                        </td>
                      )
                    })}
                    <td className="whitespace-nowrap bg-[#faf6f0] px-2.5 py-1.5 text-right font-semibold tabular-nums">{r.all.length}{badge(over(r.all))}</td>
                  </tr>
                ))),
              ])}
            </tbody>
            <tfoot className="sticky bottom-0 z-[2]">
              <tr className="bg-[#f6efe4] font-semibold">
                <td colSpan={2} className="sticky left-0 bg-[#f6efe4] px-2.5 py-2 text-[13px]">總計</td>
                {cols.map(c => <td key={c} className="px-2.5 py-2 text-right tabular-nums text-[13px]">{totalOf(rows, c) || ''}</td>)}
                <td className="bg-[#efe5d6] px-2.5 py-2 text-right tabular-nums text-[13px]">{totalOf(rows)}{badge(overOf(rows))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map(r => {
            const ws = cols.filter(c => cnt(r, c))
            return (
              <div key={r.key} className="rounded-lg border border-[#e8ddd0] bg-white">
                <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2" onClick={() => setOpen(s => ({ ...s, [r.key]: !s[r.key] }))}>
                  {open[r.key] ? <ChevronDown className="h-4 w-4 text-[#a08060]" /> : <ChevronRight className="h-4 w-4 text-[#a08060]" />}
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[11px] text-[#a08060]">{r.pid ?? '未對應料卡'}</div>
                    <div className="text-sm">{r.name}</div>
                    <span className="mr-1 rounded bg-[#f0e8de] px-1.5 text-[10px] text-[#8a7058]">{r.type}</span>
                    <span className="rounded bg-[#f0e8de] px-1.5 text-[10px] text-[#8a7058]">{ws.length} 個倉</span>
                  </div>
                  <div className="text-right"><b className="text-lg tabular-nums">{r.all.length}</b>{badge(over(r.all))}</div>
                </div>
                {open[r.key] && (
                  <table className="mx-3 mb-2.5 w-[calc(100%-1.5rem)] text-[13px]">
                    <tbody>{ws.map(c => (
                      <tr key={c} className="border-t border-[#f0e8de]">
                        <td className="py-1">{c}</td>
                        <td className="py-1 text-right"><button onClick={() => setDetail({ row: r, col: c })} className="tabular-nums hover:text-[#7a5230] hover:underline">{cnt(r, c)}</button>{badge(over(r.cells.get(c)!))}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                )}
              </div>
            )
          })}
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/25" onClick={() => setDetail(null)}>
          <div className="flex h-full w-full max-w-[620px] flex-col bg-white shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-start gap-2 border-b border-[#e8ddd0] px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] text-[#a08060]">{detail.row.pid ?? '未對應料卡'}</div>
                <div className="text-[15px] font-semibold text-[#2c1e12]">{detail.row.name}</div>
                <div className="text-xs text-[#6b4f38]">{detail.col ? `${kind === 'in' ? '接收倉' : kind === 'out' ? '送出倉' : '技師'}：${detail.col}・` : '全部倉・'}{detailItems.length} 件・{over(detailItems)} 件{kind === 'idle' ? `超過 ${thr} 天` : `等超過 ${thr} 天`}</div>
              </div>
              <button onClick={() => copyBarcodes(detailItems)} className="inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] px-2 py-1 text-xs text-[#7a5230] hover:bg-[#faf6f0]"><Copy className="h-3.5 w-3.5" />複製條碼</button>
              <button onClick={() => setDetail(null)} className="rounded p-1 text-[#a08060] hover:bg-[#f0e8de]"><X className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 overflow-auto px-4 py-2">
              <table className="w-full text-[13px]">
                <thead><tr className="text-left text-[11px] text-[#6b4f38]">
                  <th className="py-1.5 font-medium">條碼</th>
                  {!detail.col && <th className="py-1.5 font-medium">{kind === 'in' ? '接收倉' : '倉'}</th>}
                  <th className="py-1.5 font-medium">{kind === 'out' ? '接收倉' : kind === 'in' ? '送出倉' : '最後動作'}</th>
                  {kind !== 'idle' && <th className="py-1.5 font-medium">移交人</th>}
                  <th className="py-1.5 font-medium">{kind === 'idle' ? '最後異動' : '移交日'}</th>
                  <th className="py-1.5 text-right font-medium">{kind === 'idle' ? '放了' : '等了'}</th>
                </tr></thead>
                <tbody>{detailItems.map(i => {
                  const d = daysOf(i.at)
                  return (
                    <tr key={i.barcode} className="border-t border-[#f0e8de]">
                      <td className="py-1 pr-2 font-mono">{i.barcode}</td>
                      {!detail.col && <td className="py-1 pr-2">{kind === 'in' ? i.to ?? UNKNOWN : i.from}</td>}
                      <td className="py-1 pr-2">{kind === 'out' ? i.to ?? '—' : kind === 'in' ? i.from : opLabel(i.op)}</td>
                      {kind !== 'idle' && <td className="py-1 pr-2">{i.who}</td>}
                      <td className="py-1 pr-2 tabular-nums">{day(i.at)}</td>
                      <td className={`py-1 text-right tabular-nums ${d > thr ? 'font-semibold text-[#b5451b]' : ''}`}>{d} 天</td>
                    </tr>
                  )
                })}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
