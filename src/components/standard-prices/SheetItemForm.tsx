'use client'

import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Copy, Plus, Trash2, X } from 'lucide-react'
import type { SheetCat, SheetCol, SheetItem } from '@/lib/priceSheetTemplate'
import { AddBtn, C, Field, IconBtn, Section, StringList, move, removeAt, setAt } from './SheetEditorFields'

interface Props {
  item: SheetItem
  cats: SheetCat[]
  catIndex: number
  itemIndex: number
  itemCount: number
  onChange: (item: SheetItem) => void
  onMove: (d: number) => void
  onCopy: () => void
  onDelete: () => void
  onMoveToCat: (ci: number) => void
}

// Step 48：單一產品卡片的編輯表單（名稱、型號、標籤、條款、價格表、備註）
export default function SheetItemForm({ item, cats, catIndex, itemIndex, itemCount, onChange, onMove, onCopy, onDelete, onMoveToCat }: Props) {
  const set = (patch: Partial<SheetItem>) => onChange({ ...item, ...patch })

  return (
    <div>
      <h2 className="text-lg font-black mb-1.5" style={{ color: C.ink }}>{item.name.replace(/[«»]/g, '') || '（未命名產品）'}</h2>
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        <select
          value={catIndex}
          onChange={e => onMoveToCat(Number(e.target.value))}
          title="移到其他分類"
          className="h-7 border rounded-md text-xs bg-white px-1.5"
          style={{ borderColor: C.line, color: C.muted }}
        >
          {cats.map((c, i) => <option key={c.id} value={i}>{i === catIndex ? `分類：${c.name}` : `移到「${c.name}」`}</option>)}
        </select>
        <IconBtn title="上移" onClick={() => onMove(-1)} disabled={itemIndex === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="下移" onClick={() => onMove(1)} disabled={itemIndex === itemCount - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="複製成新產品" onClick={onCopy}><Copy className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="刪除此產品" danger onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div><Section title="產品名稱"><Field value={item.name} onChange={v => set({ name: v })} bold /></Section></div>
        <div><Section title="型號"><Field value={item.model} onChange={v => set({ model: v })} placeholder="可留空" /></Section></div>
      </div>

      <Section title="標籤" hint="名稱旁的灰色小標籤，例如「保固一年」">
        <div className="flex flex-wrap items-center gap-1.5">
          {item.chips.map((chip, i) => (
            <div key={i} className="flex items-center gap-0.5 rounded-md pl-0.5" style={{ background: C.surface2 }}>
              <div className="w-32"><Field value={chip} onChange={v => set({ chips: setAt(item.chips, i, v) })} /></div>
              <button type="button" aria-label="刪除標籤" onClick={() => set({ chips: removeAt(item.chips, i) })} className="px-1" style={{ color: C.muted }}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <AddBtn onClick={() => set({ chips: [...item.chips, ''] })}>標籤</AddBtn>
        </div>
      </Section>

      <Section title="條款說明" hint="表格上方的兩欄說明，例如「鏡頭買斷・主機租賃」">
        <div className="space-y-1.5">
          {item.terms.map(([k, v], i) => (
            <div key={i} className="flex items-start gap-1">
              <div className="w-44 shrink-0"><Field value={k} onChange={nk => set({ terms: setAt(item.terms, i, [nk, v]) })} placeholder="項目" /></div>
              <div className="flex-1 min-w-0"><Field value={v} onChange={nv => set({ terms: setAt(item.terms, i, [k, nv]) })} placeholder="內容" multiline /></div>
              <IconBtn title="上移" onClick={() => set({ terms: move(item.terms, i, -1) })} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title="刪除" danger onClick={() => set({ terms: removeAt(item.terms, i) })}><X className="h-3.5 w-3.5" /></IconBtn>
            </div>
          ))}
          <AddBtn onClick={() => set({ terms: [...item.terms, ['', '']] })}>新增條款</AddBtn>
        </div>
      </Section>

      <PriceTable item={item} onChange={onChange} />

      <Section title="備註" hint="表格下方的條列說明">
        <StringList items={item.notes} onChange={v => set({ notes: v })} addLabel="新增備註" multiline />
      </Section>
    </div>
  )
}

function PriceTable({ item, onChange }: { item: SheetItem; onChange: (item: SheetItem) => void }) {
  const { cols, rows } = item
  const setCols = (next: SheetCol[], nextRows = rows) => onChange({ ...item, cols: next, rows: nextRows })
  const setCol = (i: number, patch: Partial<SheetCol>) => {
    const c = { ...cols[i], ...patch }
    if (!c.g) delete c.g
    if (!c.w) delete c.w
    setCols(setAt(cols, i, c))
  }
  const moveCol = (i: number, d: number) => setCols(move(cols, i, d), rows.map(r => move(r, i, d)))
  const removeCol = (i: number) => setCols(removeAt(cols, i), rows.map(r => removeAt(r, i)))
  const addCol = () => setCols([...cols, { l: '新欄位' }], rows.map(r => [...r, '']))
  const setRows = (next: string[][]) => onChange({ ...item, rows: next })

  return (
    <Section title="價格表" hint="相鄰欄位填同一個「群組」名稱，上方會合併成一格（例如 設備買斷 → 定價／業務／區主管）">
      <div className="overflow-x-auto border rounded-lg bg-white" style={{ borderColor: C.line }}>
        <table className="border-collapse">
          <thead>
            <tr style={{ background: C.surface2 }}>
              <th className="px-1.5 pt-1.5 text-left text-[11px] font-normal whitespace-nowrap" style={{ color: C.muted }}>群組</th>
              {cols.map((c, i) => (
                <th key={i} className="px-1 pt-1.5 min-w-[96px]">
                  <Field value={c.g ?? ''} onChange={v => setCol(i, { g: v })} align="center" placeholder="（無）" />
                </th>
              ))}
              <th />
            </tr>
            <tr style={{ background: C.surface2 }}>
              <th className="px-1.5 text-left text-[11px] font-normal whitespace-nowrap" style={{ color: C.muted }}>欄位</th>
              {cols.map((c, i) => (
                <th key={i} className="px-1 py-1">
                  <Field value={c.l} onChange={v => setCol(i, { l: v })} align={i === 0 ? 'left' : 'right'} bold />
                </th>
              ))}
              <th className="px-1">
                <IconBtn title="新增欄位" onClick={addCol}><Plus className="h-3.5 w-3.5" /></IconBtn>
              </th>
            </tr>
            <tr style={{ background: C.surface2, borderBottom: `1px solid ${C.line}` }}>
              <th />
              {cols.map((c, i) => (
                <th key={i} className="px-1 pb-1.5">
                  <div className="flex items-center justify-center gap-0.5">
                    <ColBtn title="左移" onClick={() => moveCol(i, -1)} disabled={i === 0}><ArrowLeft className="h-3 w-3" /></ColBtn>
                    <ColBtn title="右移" onClick={() => moveCol(i, 1)} disabled={i === cols.length - 1}><ArrowRight className="h-3 w-3" /></ColBtn>
                    <button
                      type="button"
                      title="寬欄：靠左、可換行，適合備註類欄位"
                      onClick={() => setCol(i, { w: !c.w })}
                      className="h-5 px-1.5 rounded text-[10.5px] border whitespace-nowrap"
                      style={c.w
                        ? { background: C.ink, color: '#fff', borderColor: C.ink }
                        : { background: '#fff', color: C.muted, borderColor: C.line }}
                    >寬欄</button>
                    <ColBtn title="刪除此欄" danger onClick={() => removeCol(i)}><X className="h-3 w-3" /></ColBtn>
                  </div>
                </th>
              ))}
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} style={{ borderBottom: `1px solid ${C.line}` }}>
                <td className="px-1.5 text-[11px] text-center" style={{ color: '#8a93a3' }}>{ri + 1}</td>
                {row.map((cell, ci) => (
                  <td key={ci} className="px-1 py-1">
                    <Field
                      value={cell}
                      onChange={v => setRows(setAt(rows, ri, setAt(row, ci, v)))}
                      align={cols[ci]?.w || ci === 0 ? 'left' : 'right'}
                      multiline={!!cols[ci]?.w}
                    />
                  </td>
                ))}
                <td className="px-1 whitespace-nowrap">
                  <div className="flex gap-0.5">
                    <ColBtn title="上移" onClick={() => setRows(move(rows, ri, -1))} disabled={ri === 0}><ArrowUp className="h-3 w-3" /></ColBtn>
                    <ColBtn title="下移" onClick={() => setRows(move(rows, ri, 1))} disabled={ri === rows.length - 1}><ArrowDown className="h-3 w-3" /></ColBtn>
                    <ColBtn title="複製此列" onClick={() => setRows([...rows.slice(0, ri + 1), [...row], ...rows.slice(ri + 1)])}><Copy className="h-3 w-3" /></ColBtn>
                    <ColBtn title="刪除此列" danger onClick={() => setRows(removeAt(rows, ri))}><X className="h-3 w-3" /></ColBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="px-1.5 py-1">
          <AddBtn onClick={() => setRows([...rows, cols.map(() => '')])}>新增一列</AddBtn>
        </div>
      </div>
      <p className="text-[11px] mt-1" style={{ color: '#8a93a3' }}>填「X」會以灰字顯示＝不提供此方案；儲存格內可用 &lt;br&gt; 換行</p>
    </Section>
  )
}

function ColBtn({ onClick, title, children, danger, disabled }: {
  onClick: () => void; title: string; children: React.ReactNode; danger?: boolean; disabled?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className="h-5 w-5 inline-flex items-center justify-center rounded hover:bg-white disabled:opacity-25 disabled:cursor-not-allowed"
      style={{ color: danger ? C.chg : C.muted }}
    >
      {children}
    </button>
  )
}
