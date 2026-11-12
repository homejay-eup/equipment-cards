'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ClipboardCopy, Download, ImageDown, Loader2, Plus, Settings2, Trash2, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { ResidualItem, ResidualListResponse } from '@/types/residual'
import {
  buildIndex, buildResultImage, buildTsv, calcRow, fmt, fmt1, formatVersion, imageFileName, overText,
  type CalcResult, type OutputMeta, type OutputRow, type ResidualMode,
} from '@/lib/residualCalc'
import ResidualItemsPanel from './ResidualItemsPanel'
import { readError } from './residualUtils'

interface Props {
  isActive: boolean
  canEdit: boolean
}

interface Row { id: number; name: string; bc: string; start: string }

const DATALIST_ID = 'residual-products'
const inputCls =
  'w-full border border-[#e8ddd0] rounded-md px-2 py-1.5 text-sm text-[#2c1e12] bg-white focus:outline-none focus:ring-1 focus:ring-[#c49a72] focus:border-[#c49a72]'

function Msg({ tone, children }: { tone: 'none' | 'err' | 'zero'; children: React.ReactNode }) {
  const cls =
    tone === 'none' ? 'text-[#a4570b] bg-[#fbf0e2]'
      : tone === 'err' ? 'text-[#b3261e]'
        : 'text-[#6b4f38] bg-[rgba(122,82,48,.08)]'
  return <span className={`text-xs rounded px-1.5 py-0.5 whitespace-nowrap ${cls}`}>{children}</span>
}

// Step 53：設備殘值計算器（原 HTML 工具搬進料卡系統）。
// 品項（品號／品名／金額／年限）存在資料庫，有 edit_residual 的人可在「管理品項」維護；價格版本由資料庫自動記錄。
export default function ResidualClient({ isActive, canEdit }: Props) {
  const [items, setItems] = useState<ResidualItem[]>([])
  const [version, setVersion] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [mode, setMode] = useState<ResidualMode>('device')
  const [calcDate, setCalcDate] = useState('')
  const [contractDate, setContractDate] = useState('')
  const seq = useRef(0)
  const newRow = useCallback((): Row => ({ id: ++seq.current, name: '', bc: '', start: '' }), [])
  const [rows, setRows] = useState<Row[]>(() => [newRow(), newRow(), newRow()])

  const [managing, setManaging] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()

  const flash = useCallback((text: string, bad = false) => {
    setToast({ text, bad })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 3000)
  }, [])
  useEffect(() => () => clearTimeout(toastTimer.current), [])

  // 切回這個分頁就重新抓一次最新品項（管理品項後、或別人改了價格都能即時拿到）
  const load = useCallback(async (silent: boolean) => {
    if (!silent) setLoading(true)
    try {
      const res = await fetch('/api/residual/items', { cache: 'no-store' })
      if (!res.ok) { setLoadError(await readError(res, '讀取品項失敗')); return }
      const json = (await res.json()) as ResidualListResponse
      setItems(json.items ?? [])
      setVersion(json.version ?? null)
      setLoadError(null)
    } catch {
      setLoadError('讀取品項失敗')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { if (isActive) load(items.length > 0) }, [isActive]) // eslint-disable-line react-hooks/exhaustive-deps

  const index = useMemo(() => buildIndex(items), [items])
  const calcs = useMemo<CalcResult[]>(
    () => rows.map((r) => calcRow(index, r.name, calcDate, mode === 'contract' ? contractDate : r.start)),
    [rows, index, calcDate, contractDate, mode],
  )

  const { total, okCount, issueCount } = useMemo(() => {
    let t = 0, ok = 0, issues = 0
    for (const c of calcs) {
      if (c.state === 'ok') { t += c.val ?? 0; ok++ }
      else if (c.state === 'notfound' || c.state === 'noprice' || c.state === 'future') issues++
    }
    return { total: t, okCount: ok, issueCount: issues }
  }, [calcs])

  function updateRow(id: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }
  function removeRow(id: number) {
    setRows((rs) => { const next = rs.filter((r) => r.id !== id); return next.length ? next : [newRow()] })
  }
  function addRows(n: number) {
    setRows((rs) => [...rs, ...Array.from({ length: n }, newRow)])
  }
  function clearAll() {
    setCalcDate(''); setContractDate('')
    setRows([newRow(), newRow(), newRow()])
    setClearOpen(false)
  }

  const meta: OutputMeta = {
    mode, calcDate, contractDate, version: formatVersion(version), totalText: fmt(total),
  }
  const outputRows: OutputRow[] = rows.map((r, i) => ({
    name: r.name, barcode: r.bc, start: mode === 'contract' ? contractDate : r.start, calc: calcs[i],
  }))

  async function copyExcel() {
    const text = buildTsv(outputRows, meta)
    try {
      await navigator.clipboard.writeText(text)
      flash('已複製，可直接貼到 Excel')
    } catch {
      flash('無法自動複製，請改用下載圖片', true)
    }
  }
  async function copyImage() {
    const blob = await buildResultImage(outputRows, meta)
    if (!blob) { flash('沒有可輸出的資料', true); return }
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      flash('圖片已複製，到單據上按 Ctrl+V 貼上')
    } catch {
      flash('這裡無法直接複製圖片，請改用「下載圖片」再插入', true)
    }
  }
  async function downloadImage() {
    const blob = await buildResultImage(outputRows, meta)
    if (!blob) { flash('沒有可輸出的資料', true); return }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = imageFileName(mode)
    document.body.append(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 5000)
    flash('圖片已下載，可在單據上用「插入圖片」')
  }

  const isContract = mode === 'contract'

  return (
    <div className="max-w-7xl mx-auto px-4 pb-24">
      {/* 品項管理（有 edit_residual 才看得到）：整頁取代計算畫面，計算中的資料保留在這個元件的 state */}
      {managing && canEdit && (
        <ResidualItemsPanel
          items={items}
          version={version}
          onChanged={() => load(true)}
          onBack={() => setManaging(false)}
        />
      )}

      <div className={managing && canEdit ? 'hidden' : ''}>
        {/* 標題列 */}
        <div className="flex flex-wrap items-start gap-3 mb-3">
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold text-[#2c1e12]">設備殘值計算器</h2>
            <p className="text-sm text-[#6b4f38]">殘值＝金額 ÷ 年限 × 剩餘月數（超過年限以 0 計）。</p>
            <p className="text-xs text-[#a08060] mt-0.5">
              價格版本：<b className="text-[#7a5230]">{formatVersion(version)}</b>
              ｜如有疑問請洽供應鏈管理組，並確認使用的是最新資料。
            </p>
          </div>
          {canEdit && (
            <button
              onClick={() => setManaging(true)}
              className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#7a5230] hover:border-[#c49a72] transition-colors"
            >
              <Settings2 className="h-4 w-4" />
              管理品項
            </button>
          )}
        </div>

        {/* 設備／合約 切換 */}
        <div className="flex gap-1 border-b border-[#e8ddd0] mb-3" role="tablist">
          {([['device', '設備殘值'], ['contract', '合約殘值']] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className={`px-4 py-2 text-sm font-medium border-b-[3px] -mb-px transition-colors ${
                mode === m ? 'text-[#7a5230] border-[#7a5230]' : 'text-[#a08060] border-transparent hover:text-[#7a5230]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="rounded-xl border border-[#e8ddd0] bg-white p-4 space-y-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-xs text-[#a08060] mb-1" htmlFor="residual-calc-date">計算日（必填）</label>
              <input id="residual-calc-date" type="date" value={calcDate} onChange={(e) => setCalcDate(e.target.value)} className={inputCls} />
            </div>
            {isContract && (
              <div>
                <label className="block text-xs text-[#a08060] mb-1" htmlFor="residual-contract-date">合約起算日（套用全部品項）</label>
                <input id="residual-contract-date" type="date" value={contractDate} onChange={(e) => setContractDate(e.target.value)} className={inputCls} />
              </div>
            )}
          </div>
          <p className="text-xs text-[#6b4f38] bg-[rgba(122,82,48,.07)] rounded-md px-3 py-2">
            {isContract
              ? <><b>合約殘值：</b>起算日填<b>合約（訂單）的第一天</b>。若是從別的客代讓渡進來，要找<b>原客代底下的第一筆</b>。</>
              : <><b>設備殘值：</b>起算日填各設備<b>裝上車的第一天</b>，每一列可不同。</>}
          </p>

          {loadError && (
            <div className="flex items-center gap-1.5 text-sm text-[#b5451b]">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              <span>{loadError}</span>
              <button onClick={() => load(false)} className="underline ml-1">重試</button>
            </div>
          )}
          {loading && items.length === 0 && !loadError && (
            <div className="flex items-center gap-2 text-sm text-[#a08060]"><Loader2 className="h-4 w-4 animate-spin" />載入品項中…</div>
          )}

          {/* 品項表 */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] border-collapse text-sm">
              <thead>
                <tr className="text-xs text-[#a08060] text-left">
                  <th className="py-1.5 px-1.5 border-b border-[#e8ddd0] font-medium" style={{ width: '30%' }}>品名（可打品名或品號搜尋）</th>
                  <th className="py-1.5 px-1.5 border-b border-[#e8ddd0] font-medium">條碼</th>
                  {!isContract && <th className="py-1.5 px-1.5 border-b border-[#e8ddd0] font-medium">起算日</th>}
                  {['使用(月)', '年限', '剩餘', '金額', '每月成本', '殘值'].map((h) => (
                    <th key={h} className="py-1.5 px-1.5 border-b border-[#e8ddd0] font-medium text-right whitespace-nowrap">{h}</th>
                  ))}
                  <th className="border-b border-[#e8ddd0]" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const c = calcs[i]
                  const cellCls = 'py-1.5 px-1.5 border-b border-[#f0e8dc] text-right font-mono tabular-nums whitespace-nowrap text-[#2c1e12]'
                  const msgCell = (node: React.ReactNode) => (
                    <>
                      <td className={cellCls} colSpan={5} />
                      <td className={`${cellCls} font-medium`}>{node}</td>
                    </>
                  )
                  let cells: React.ReactNode
                  switch (c.state) {
                    case 'empty':
                      cells = <><td className={cellCls} colSpan={6} /></>; break
                    case 'notfound': cells = msgCell(<Msg tone="err">查無此品名</Msg>); break
                    case 'noprice': cells = msgCell(<Msg tone="none">報價無資料</Msg>); break
                    case 'needcalc': cells = msgCell(<Msg tone="err">請填計算日</Msg>); break
                    case 'needstart': cells = msgCell(<Msg tone="err">{isContract ? '請填合約起算日' : '請填起算日'}</Msg>); break
                    case 'future': cells = msgCell(<Msg tone="err">起算日晚於計算日</Msg>); break
                    default:
                      cells = (
                        <>
                          <td className={cellCls}>{c.used}</td>
                          <td className={cellCls}>{c.yrs}</td>
                          <td className={cellCls}>{c.left}</td>
                          <td className={cellCls}>{fmt(c.price ?? 0)}</td>
                          <td className={cellCls}>{fmt1(c.per ?? 0)}</td>
                          <td className={`${cellCls} font-medium`}>
                            {c.left === 0 ? <Msg tone="zero">{'0（' + overText(c) + '）'}</Msg> : fmt(c.val ?? 0)}
                          </td>
                        </>
                      )
                  }
                  return (
                    <tr key={r.id}>
                      <td className="py-1.5 px-1.5 border-b border-[#f0e8dc] align-top">
                        <input
                          list={DATALIST_ID}
                          value={r.name}
                          onChange={(e) => updateRow(r.id, { name: e.target.value })}
                          placeholder="輸入品名或品號"
                          aria-label="品名"
                          className={`${inputCls} min-w-[230px]`}
                        />
                        <span className="block font-mono text-[11px] text-[#a08060] mt-0.5 min-h-[1em]">
                          {c.item ? '品號 ' + c.item.code : ''}
                        </span>
                      </td>
                      <td className="py-1.5 px-1.5 border-b border-[#f0e8dc] align-top">
                        <input value={r.bc} onChange={(e) => updateRow(r.id, { bc: e.target.value })} aria-label="條碼" className={`${inputCls} w-[170px] font-mono`} />
                      </td>
                      {!isContract && (
                        <td className="py-1.5 px-1.5 border-b border-[#f0e8dc] align-top">
                          <input type="date" value={r.start} onChange={(e) => updateRow(r.id, { start: e.target.value })} aria-label="起算日" className={`${inputCls} font-mono`} />
                        </td>
                      )}
                      {cells}
                      <td className="py-1.5 px-1.5 border-b border-[#f0e8dc] align-top">
                        <button onClick={() => removeRow(r.id)} aria-label="刪除此列" className="p-1.5 rounded text-[#a08060] hover:text-[#b5451b] transition-colors">
                          <X className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <datalist id={DATALIST_ID}>
            {items.map((it) => (
              <option key={it.id} value={it.name} label={it.code + (it.price == null ? '｜報價無資料' : '')} />
            ))}
          </datalist>

          <div className="flex flex-wrap gap-2">
            <button onClick={() => addRows(1)} className="flex items-center gap-1 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] transition-colors">
              <Plus className="h-4 w-4" />新增一列
            </button>
            <button onClick={() => addRows(5)} className="flex items-center gap-1 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] transition-colors">
              <Plus className="h-4 w-4" />新增 5 列
            </button>
          </div>
        </div>

        <details className="mt-3 text-sm text-[#a08060]">
          <summary className="cursor-pointer">計算規則說明</summary>
          <ul className="list-disc pl-5 mt-1.5 space-y-0.5">
            <li>使用月數同 Excel <code>DATEDIF(起算日, 計算日, &quot;M&quot;)</code>，只算滿月。</li>
            <li>剩餘月數＝年限－使用月數，小於 0 時以 0 計，殘值為 0。</li>
            <li>每列殘值四捨五入到元，合計為各列加總。</li>
            <li>標示「報價無資料」的品項尚未訂定費用與年限，不列入合計，請洽供應鏈管理組。</li>
          </ul>
        </details>
      </div>

      {/* 合計列：固定在視窗底部 */}
      {!(managing && canEdit) && (
        <div className="sticky bottom-0 mt-4 bg-white border border-[#e8ddd0] rounded-xl px-4 py-3 shadow-[0_-4px_16px_rgba(122,82,48,.08)] flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
          <div className="text-sm text-[#6b4f38]">
            殘值合計
            <strong className="ml-2 font-mono text-2xl text-[#2c1e12] tabular-nums">{fmt(total)}</strong> 元
            {okCount > 0 && (
              <span className="ml-2 text-xs text-[#a08060]">（{okCount} 項計入{issueCount ? `，${issueCount} 項未計入` : ''}）</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {toast && (
              <span role="status" className={`text-sm ${toast.bad ? 'text-[#b5451b]' : 'text-[#1f6b45]'}`}>{toast.text}</span>
            )}
            <button onClick={copyExcel} className="flex items-center gap-1.5 h-9 px-3 rounded-md bg-[#7a5230] text-white text-sm font-medium hover:bg-[#9c6b42] transition-colors">
              <ClipboardCopy className="h-4 w-4" />複製結果（貼到 Excel）
            </button>
            <button onClick={copyImage} className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] transition-colors">
              <ImageDown className="h-4 w-4" />複製圖片（貼到單據）
            </button>
            <button onClick={downloadImage} className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#6b4f38] hover:border-[#c49a72] transition-colors">
              <Download className="h-4 w-4" />下載圖片
            </button>
            <button onClick={() => setClearOpen(true)} className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[#e8ddd0] bg-white text-sm text-[#a08060] hover:text-[#b5451b] hover:border-[rgba(181,69,27,.3)] transition-colors">
              <Trash2 className="h-4 w-4" />全部清除
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={clearOpen}
        title="全部清除？"
        message="計算日與所有列的內容都會清空，無法還原。"
        confirmLabel="清除"
        danger
        onConfirm={clearAll}
        onCancel={() => setClearOpen(false)}
      />
    </div>
  )
}
