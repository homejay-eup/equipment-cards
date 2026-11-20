'use client'
// Step 55：移交出去／待接收／持有過久 三個分頁共用的畫面
//   out：A 倉移交出去、對方還沒接收（欄／列＝送出倉）；in：B 倉待接收（欄／列＝接收倉）；idle：技師手上超過 30 天沒異動（欄／列＝技師倉）
//   樞紐表：品項 × 倉庫；列表：一個倉庫（技師）一列，展開看他持有哪些品項。
// 搜尋、倉庫範圍（編輯倉庫）、樞紐表／列表、分組由上層共用。
import { useEffect, useMemo, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronRight, Copy, Download, X } from 'lucide-react'
import type { InvProduct, InvWarehouse, TransferItem } from './types'
import { TYPE_ORDER } from './types'

export type TabKind = 'out' | 'in' | 'idle'
const UNKNOWN = '接收倉未同步'
const UNKNOWN_HINT = '備份日之後才移交的設備，接收倉資料庫還沒有，請至 CRM 查詢'
const THRESH: Record<TabKind, number> = { out: 7, in: 7, idle: 90 }
const REGION_ORDER = ['公司', '北區技師', '竹區技師', '中區技師', '南區技師', '送修', '其他']

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
  warehouses: InvWarehouse[]
  scope: string[] | null     // 編輯倉庫選的倉；null＝全部倉庫
  q: string
  view: 'pivot' | 'list'
  grp: 'type' | 'none'
  note?: React.ReactNode     // 只有待接收頁有：接收倉資料時間說明
  transposed?: boolean       // 樞紐表列欄交換（倉庫在左、品項在上）
  onTranspose?: () => void
  onCopied: (msg: string) => void
  /** 上層搜尋框的鍵盤事件交給這裡處理（↑↓ 選條碼、Enter 打開明細） */
  keyRef?: React.MutableRefObject<((e: React.KeyboardEvent<HTMLInputElement>) => void) | null>
}

function Switch({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <label className="flex cursor-pointer select-none items-center gap-1.5 rounded-full border border-[#e8ddd0] bg-white px-2.5 py-1 text-[13px] text-[#6b4f38]">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="relative h-4 w-7 rounded-full bg-[#d8ccbd] transition peer-checked:bg-[#7a5230] after:absolute after:left-0.5 after:top-0.5 after:h-3 after:w-3 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-3" />
      {children}
    </label>
  )
}

export default function TransferTab({ kind, items, loading, error, products, warehouses, scope, q, view, grp, note, transposed, onTranspose, onCopied, keyRef }: Props) {
  const thr = THRESH[kind]
  const [overdueOnly, setOverdueOnly] = useState(kind !== 'idle')   // 移交出去／待接收：預設只看等超過 7 天
  const [withSim, setWithSim] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [detail, setDetail] = useState<{ row: Row; col: string | null; focus?: string } | null>(null)   // focus＝從「找到 N 筆條碼」點進來的那顆（標色、閃一下、排第一）

  const pmap = useMemo(() => new Map(products.map(p => [p.key, p])), [products])
  const regionOf = useMemo(() => new Map(warehouses.map(w => [w.name, w.region || '其他'])), [warehouses])
  const rank = (c: string) => { if (c === UNKNOWN) return 1000; const i = REGION_ORDER.indexOf(regionOf.get(c) ?? ''); return i < 0 ? 98 : i }
  const colOf = (it: TransferItem) => (kind === 'in' ? it.to ?? UNKNOWN : it.from)

  const { rows, cols, matched, hidden } = useMemo(() => {
    const qq = q.trim().toLowerCase()
    const everything = scope === null || !!qq
    const inScope = new Set(scope ?? [])
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
    // 全部倉庫（或搜尋中）：依區域（公司、北區、竹區、中區、南區…）再依倉名；自選倉庫：照編輯倉庫的順序，沒東西的也列出來
    const cols = everything
      ? Array.from(colCount.keys()).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'zh-Hant'))
      : scope!
    const rows = Array.from(byKey.values()).sort((a, b) => (a.pid ?? '~' + a.name).localeCompare(b.pid ?? '~' + b.name))
    return { rows, cols, matched, hidden }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, pmap, scope, q, overdueOnly, withSim, kind, regionOf])

  const over = (list: TransferItem[]) => list.filter(i => daysOf(i.at) > thr).length
  const cnt = (r: Row, c: string) => r.cells.get(c)?.length ?? 0
  const totalOf = (list: Row[], c?: string) => list.reduce((a, r) => a + (c ? cnt(r, c) : r.all.length), 0)
  const overOf = (list: Row[], c?: string) => list.reduce((a, r) => a + over(c ? r.cells.get(c) ?? [] : r.all), 0)
  const itemsOfCol = (c: string) => rows.flatMap(r => r.cells.get(c) ?? [])

  const groups = useMemo(() => {
    if (grp !== 'type' || view !== 'pivot') return [{ t: '', rows }]
    const types = [...TYPE_ORDER, ...Array.from(new Set(rows.map(r => r.type))).filter(t => !TYPE_ORDER.includes(t))]
    return types.map(t => ({ t, rows: rows.filter(r => r.type === t) })).filter(g => g.rows.length)
  }, [rows, grp, view])

  const detailItems = useMemo(() => {
    if (!detail) return []
    const base = detail.col ? detail.row.cells.get(detail.col) ?? [] : detail.row.all
    return [...base].sort((a, b) => (detail.focus ? Number(b.barcode === detail.focus) - Number(a.barcode === detail.focus) : 0) || daysOf(b.at) - daysOf(a.at))
  }, [detail])

  // 搜尋條碼（4 碼以上）：和庫存分頁一樣列出「找到 N 筆條碼」，點一筆打開它所在倉的明細並標出那顆
  const qq = q.trim().toLowerCase()
  const allHits = useMemo(() => (qq.length >= 4 ? rows.flatMap(r => r.all.filter(i => i.barcode.toLowerCase().includes(qq)).map(i => ({ r, i }))) : []), [rows, qq])
  const hits = allHits.slice(0, 30)
  // 從樞紐表／列表的數字或品名點開：若這格含有搜尋到的條碼，同樣標出那顆（和點「找到 N 筆條碼」一致）
  // ↑↓ 選、Enter 打開：和庫存分頁一致；預設選「完全符合」的那筆，沒有就第一筆
  const defaultPick = Math.max(0, hits.findIndex(h => h.i.barcode.toLowerCase() === qq))
  const [pick, setPick] = useState<{ q: string; i: number }>({ q: '', i: 0 })
  const pickIdx = Math.min(pick.q === qq ? pick.i : defaultPick, Math.max(0, hits.length - 1))
  const openHit = (h: { r: Row; i: TransferItem }) => setDetail({ row: h.r, col: colOf(h.i), focus: h.i.barcode })
  const openDetail = (row: Row, col: string | null) => {
    const h = allHits.find(x => x.r === row && (col === null || colOf(x.i) === col))
    setDetail({ row, col, focus: h?.i.barcode })
  }

  const badge = (n: number) => (n ? <span title={kind === 'idle' ? `超過 ${thr} 天` : `等超過 ${thr} 天`} className="ml-1 rounded bg-[#f8e4dc] px-1 text-[10px] text-[#b5451b]">{n}</span> : null)
  const th = 'whitespace-nowrap px-2.5 py-2 text-[12px] font-medium text-[#6b4f38]'
  const colHead = (c: string) => (c === UNKNOWN ? <span title={UNKNOWN_HINT} className="cursor-help underline decoration-dotted">{c}</span> : c)

  // ---- 匯出 Excel：明細＋總覽兩張工作表，依目前的搜尋、倉庫範圍與開關 ----
  const exportXlsx = async () => {
    const XLSX = await import('xlsx')
    const all = rows.flatMap(r => r.all)
    const head = kind === 'idle'
      ? ['品類', '品名', '條碼', '持有技師', '最後異動', '最後動作', '放了(天)']
      : ['品類', '品名', '條碼', '送出倉', '接收倉', '移交人', '移交日期', '等待天數']
    const detailRows = rows.flatMap(r => r.all.map(i => kind === 'idle'
      ? [r.type, r.name, i.barcode, i.from, day(i.at), opLabel(i.op), daysOf(i.at)]
      : [r.type, r.name, i.barcode, i.from, i.to ?? UNKNOWN, i.who ?? '', day(i.at), daysOf(i.at)]))
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

  useEffect(() => {
    if (!keyRef) return
    keyRef.current = e => {
      if (detail) return
      if (!hits.length) { if (e.key === 'Enter' && qq && rows.length === 1) { e.preventDefault(); openDetail(rows[0], null) }; return }   // 搜品名只剩一個品項：Enter 直接開它的明細
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); setPick({ q: qq, i: (pickIdx + (e.key === 'ArrowDown' ? 1 : hits.length - 1)) % hits.length }) }
      else if (e.key === 'Enter') { e.preventDefault(); openHit(hits[pickIdx]) }
    }
    return () => { keyRef.current = null }
  })

  const copyText = (text: string, msg: string) => { navigator.clipboard?.writeText(text).then(() => onCopied(msg), () => onCopied('複製失敗')) }
  const copyBarcodes = (list: TransferItem[]) => copyText(list.map(i => i.barcode).join('\n'), `已複製 ${list.length} 個條碼`)
  // 持有過久：這位技師的寄回清單（貼到 LINE 用）
  const returnList = (c: string, list: TransferItem[]) =>
    `【${c}】共 ${list.length} 件\n` + list.map(i => `${i.name}  ${i.barcode}  (放了 ${daysOf(i.at)} 天)`).join('\n')

  if (error) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-10 text-center text-sm text-[#b5451b]">{error}</div>
  if (loading || !items) return <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">讀取中…</div>

  const toggleBar = (
    <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[13px] text-[#6b4f38]">
      {kind !== 'idle'
        ? <Switch checked={overdueOnly} onChange={setOverdueOnly}>只看等超過 {thr} 天</Switch>
        : <Switch checked={withSim} onChange={setWithSim}>含 Sim 卡</Switch>}
      {note && <span className="rounded-md bg-[#fdf3e3] px-2 py-1 text-[13px] font-semibold text-[#8a5a1c]">{note}</span>}
      <button onClick={exportXlsx} disabled={!matched} className="ml-auto inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] bg-white px-2.5 py-1 text-[#7a5230] hover:bg-[#faf6f0] disabled:opacity-50"><Download className="h-3.5 w-3.5" />匯出</button>
    </div>
  )

  const empty = (
    <div className="rounded-xl border border-[#e8ddd0] bg-white py-12 text-center text-sm text-[#a08060]">
      {matched === 0 && hidden > 0 ? `選的倉庫範圍內沒有項目；範圍外還有 ${hidden} 筆，可到「編輯倉庫」調整` : '沒有符合的項目'}
    </div>
  )

  // 列表：同一區域的技師排在一起（不管倉庫範圍是自選還是預設，區域內保留範圍裡原本的順序）
  const listGroups = (() => {
    const g = new Map<string, { c: string; list: TransferItem[] }[]>()
    for (const c of [...cols].sort((a, b) => rank(a) - rank(b))) {
      const list = itemsOfCol(c)
      if (!list.length) continue
      const region = c === UNKNOWN ? '' : regionOf.get(c) || '其他'
      g.set(region, [...(g.get(region) ?? []), { c, list }])
    }
    return Array.from(g, ([region, cs]) => ({ region, cs }))
  })()
  return (
    <div>
      {toggleBar}
      {hits.length > 0 && (
        <div className="mb-3 rounded-lg border border-[#e8ddd0] border-l-[3px] border-l-[#7a5230] bg-white px-3 py-2.5 text-[13px]">
          <b>找到 {allHits.length}{allHits.length > 30 ? '（只列前 30）' : ''} 筆條碼</b>，點一筆打開它所在倉的明細：<span className="ml-1 hidden rounded border border-[#e8ddd0] bg-[#faf6f0] px-1.5 text-[11px] font-normal text-[#a08060] md:inline">按 Enter 開啟</span>
          <table className="mt-1.5 w-full text-xs">
            <tbody>{hits.map(({ r, i }, n) => {
              const d = daysOf(i.at)
              return (
                <tr key={i.barcode} onClick={() => openHit({ r, i })} aria-selected={n === pickIdx} className={`cursor-pointer border-t border-[#f0e8de] hover:bg-[#f6efe4] ${n === pickIdx ? 'bg-[#f6efe4]' : ''}`}>
                  <td className="py-1 pr-2 font-mono">{i.barcode}</td><td className="py-1 pr-2">{r.name}</td>
                  <td className="py-1 pr-2">{kind === 'idle' ? i.from : `${i.from} → ${i.to ?? UNKNOWN}`}</td>
                  <td className="py-1 pr-2 tabular-nums">{day(i.at)}</td>
                  <td className={`py-1 text-right tabular-nums ${d > thr ? 'font-semibold text-[#b5451b]' : ''}`}>{d} 天</td>
                </tr>
              )
            })}</tbody>
          </table>
        </div>
      )}
      {!rows.length ? empty : view === 'pivot' && transposed ? (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-[2] bg-[#faf6f0]">
              <tr>
                <th className={`${th} sticky left-0 z-[3] bg-[#faf6f0] text-left shadow-[1px_0_0_#e8ddd0]`}>
                  <button type="button" title="列欄交換：品項改排在左邊" aria-label="列欄交換" onClick={onTranspose}
                    className="mr-1 inline-flex rounded border border-[#e8ddd0] bg-white p-0.5 align-[-2px] text-[#7a5230] hover:bg-[#f3e9dc]"><ArrowLeftRight className="h-3 w-3" /></button>
                  {kind === 'idle' ? '技師' : kind === 'in' ? '接收倉' : '送出倉'}
                </th>
                {rows.map(r => (
                  <th key={r.key} className={`${th} min-w-[96px] max-w-[150px] whitespace-normal text-right align-bottom`}>
                    <div className="font-mono text-[11px] font-normal text-[#a08060]">{r.pid ?? '—'}</div>
                    <button type="button" onClick={() => openDetail(r, null)} className="text-right font-medium hover:text-[#7a5230] hover:underline">{r.name}</button>
                  </th>
                ))}
                <th className={`${th} bg-[#efe5d6] text-right`}>總計</th>
              </tr>
            </thead>
            <tbody>
              {cols.map(c => {
                const list = itemsOfCol(c)
                return (
                  <tr key={c} className="group border-t border-[#f0e8de] hover:bg-[#fdf8f2]">
                    <td className="sticky left-0 z-[1] whitespace-nowrap bg-white px-2.5 py-1.5 text-[13px] shadow-[1px_0_0_#e8ddd0] group-hover:bg-[#fdf8f2]">{colHead(c)}</td>
                    {rows.map(r => {
                      const n = cnt(r, c)
                      return (
                        <td key={r.key} className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">
                          {n ? <><button onClick={() => openDetail(r, c)} className="text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{n}</button>{badge(over(r.cells.get(c)!))}</> : null}
                        </td>
                      )
                    })}
                    <td className="whitespace-nowrap bg-[#faf6f0] px-2.5 py-1.5 text-right font-semibold tabular-nums">{list.length}{badge(over(list))}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="sticky bottom-0 z-[2]">
              <tr className="bg-[#f6efe4] font-semibold">
                <td className="sticky left-0 bg-[#f6efe4] px-2.5 py-2 text-[13px]">總計</td>
                {rows.map(r => <td key={r.key} className="px-2.5 py-2 text-right tabular-nums text-[13px]">{r.all.length}{badge(over(r.all))}</td>)}
                <td className="bg-[#efe5d6] px-2.5 py-2 text-right tabular-nums text-[13px]">{totalOf(rows)}{badge(overOf(rows))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : view === 'pivot' ? (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-[rgba(122,82,48,.15)] bg-white shadow-sm">
          <table className="min-w-full border-separate border-spacing-0">
            <thead className="sticky top-0 z-[2] bg-[#faf6f0]">
              <tr>
                <th className={`${th} sticky left-0 z-[3] w-[128px] min-w-[128px] max-w-[128px] bg-[#faf6f0] text-left`}>
                  <button type="button" title="列欄交換：倉庫改排在左邊" aria-label="列欄交換" onClick={onTranspose}
                    className="mr-1 inline-flex rounded border border-[#e8ddd0] bg-white p-0.5 align-[-2px] text-[#7a5230] hover:bg-[#f3e9dc]"><ArrowLeftRight className="h-3 w-3" /></button>
                  品號
                </th>
                <th className={`${th} sticky left-[128px] z-[3] bg-[#faf6f0] text-left shadow-[1px_0_0_#e8ddd0]`}>品名</th>
                {cols.map(c => <th key={c} className={`${th} text-right`}>{colHead(c)}</th>)}
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
                      <button onClick={() => openDetail(r, null)} className="text-left text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{r.name}</button>
                    </td>
                    {cols.map(c => {
                      const n = cnt(r, c)
                      return (
                        <td key={c} className="whitespace-nowrap px-2.5 py-1.5 text-right tabular-nums">
                          {n ? <><button onClick={() => openDetail(r, c)} className="text-[13px] text-[#2c1e12] hover:text-[#7a5230] hover:underline">{n}</button>{badge(over(r.cells.get(c)!))}</> : null}
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
        // 列表：一個倉庫（技師）一列，依區域、倉名排列；展開看他持有的品項（車機、配件分組）
        <div className="space-y-2">
          {listGroups.map(({ region, cs }) => {
            const rKey = `region:${region}`
            const folded = !!region && !!collapsed[rKey]
            const rTotal = cs.reduce((a, x) => a + x.list.length, 0)
            const rOver = cs.reduce((a, x) => a + over(x.list), 0)
            return (
              <div key={region || UNKNOWN}>
                {region && (
                  <div className="flex cursor-pointer select-none items-center gap-2 rounded-lg bg-[#efe4d6] px-2.5 py-1.5" onClick={() => setCollapsed(s => ({ ...s, [rKey]: !s[rKey] }))}>
                    {folded ? <ChevronRight className="h-3.5 w-3.5 text-[#7a5230]" /> : <ChevronDown className="h-3.5 w-3.5 text-[#7a5230]" />}
                    <b className="text-[13px] font-medium text-[#5c3d22]">{region}</b>
                    <span className="text-xs text-[#8a7058]">{cs.length} 位</span>
                    <span className="ml-auto text-xs text-[#6b4f38]">合計 <b className="text-[15px] font-medium tabular-nums text-[#2c1e12]">{rTotal}</b>{badge(rOver)}</span>
                  </div>
                )}
                {!folded && (
                  <div className={`space-y-1.5 ${region ? 'ml-3.5 mt-1.5' : ''}`}>
          {cs.map(({ c, list }) => {
            const prods = rows.filter(r => cnt(r, c))
            const typeCount = (t: string) => prods.filter(r => r.type === t).reduce((a, r) => a + cnt(r, c), 0)
            const types = [...TYPE_ORDER, ...Array.from(new Set(prods.map(r => r.type))).filter(t => !TYPE_ORDER.includes(t))].filter(t => typeCount(t))
            return (
              <div key={c}>
                <div className="rounded-lg border border-[#e8ddd0] bg-white">
                  <div className="flex cursor-pointer items-center gap-2.5 px-3 py-2" onClick={() => setOpen(s => ({ ...s, [c]: !s[c] }))}>
                    {open[c] ? <ChevronDown className="h-4 w-4 text-[#a08060]" /> : <ChevronRight className="h-4 w-4 text-[#a08060]" />}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-[#2c1e12]">{colHead(c)}</div>
                      <div className="text-xs text-[#8a7058]">{types.map(t => `${t} ${typeCount(t)}`).join('・')}</div>
                    </div>
                    <div className="text-right"><b className="text-lg tabular-nums">{list.length}</b>{badge(over(list))}</div>
                    {c !== UNKNOWN && (kind === 'idle'
                      ? <button onClick={e => { e.stopPropagation(); copyText(returnList(c, list), `已複製 ${c} 的寄回清單`) }} className="inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] px-2 py-1 text-xs text-[#7a5230] hover:bg-[#faf6f0]"><Copy className="h-3.5 w-3.5" />複製寄回清單</button>
                      : <button onClick={e => { e.stopPropagation(); copyBarcodes(list) }} className="inline-flex items-center gap-1 rounded-md border border-[rgba(122,82,48,.35)] px-2 py-1 text-xs text-[#7a5230] hover:bg-[#faf6f0]"><Copy className="h-3.5 w-3.5" />複製條碼</button>)}
                  </div>
                  {open[c] && (
                    <div className="mx-3 mb-2.5 text-[13px]">
                      {types.map(t => (
                        <div key={t}>
                          <div className="pt-1.5 text-[11px] text-[#a08060]">{t}（{typeCount(t)}）</div>
                          {prods.filter(r => r.type === t).map(r => (
                            <div key={r.key} className="flex items-center justify-between border-t border-[#f0e8de] py-1">
                              <span><span className="mr-2 font-mono text-[11px] text-[#a08060]">{r.pid ?? '—'}</span>{r.name}</span>
                              <span><button onClick={() => openDetail(r, c)} className="tabular-nums hover:text-[#7a5230] hover:underline">{cnt(r, c)}</button>{badge(over(r.cells.get(c)!))}</span>
                            </div>
                          ))}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
                  </div>
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
                  <th className="py-1.5 pl-2 font-medium">條碼</th>
                  {!detail.col && <th className="py-1.5 font-medium">{kind === 'in' ? '接收倉' : '倉'}</th>}
                  <th className="py-1.5 font-medium">{kind === 'out' ? '接收倉' : kind === 'in' ? '送出倉' : '最後動作'}</th>
                  {kind !== 'idle' && <th className="py-1.5 font-medium">移交人</th>}
                  <th className="py-1.5 font-medium">{kind === 'idle' ? '最後異動' : '移交日'}</th>
                  <th className="py-1.5 text-right font-medium">{kind === 'idle' ? '放了' : '等了'}</th>
                </tr></thead>
                <tbody>{detailItems.map(i => {
                  const d = daysOf(i.at)
                  return (
                    <tr key={i.barcode} className={`border-t border-[#f0e8de] ${detail.focus === i.barcode ? 'barcode-hit barcode-row-flash' : ''}`}>
                      <td className="py-1 pl-2 pr-2 font-mono">{i.barcode}</td>
                      {!detail.col && <td className="py-1 pr-2">{kind === 'in' ? i.to ?? UNKNOWN : i.from}</td>}
                      <td className="py-1 pr-2">{kind === 'out' ? i.to ?? UNKNOWN : kind === 'in' ? i.from : opLabel(i.op)}</td>
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
