'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Trash2, X } from 'lucide-react'
import ConfirmDialog from '@/components/ConfirmDialog'
import type { StandardPriceSheetMeta } from '@/types/standardPrice'
import {
  newCatId, renderSheetHtml,
  type SheetCat, type SheetData, type SheetItem, type SheetMeta, type SheetRule,
} from '@/lib/priceSheetTemplate'
import { readApiError } from './standardPriceUtils'
import { AddBtn, C, Field, IconBtn, MarkContext, Section, StringList, move, removeAt, setAt } from './SheetEditorFields'
import SheetItemForm from './SheetItemForm'

interface Props {
  initial: SheetData
  baseMeta: StandardPriceSheetMeta // 以哪個版本為基礎（帶入預設標題/生效月份）
  canOverwrite: boolean // Step 48b：現行版本才能「儲存修改」；歷史版本只能另存新版本
  onClose: () => void
  onSaved: (sheet: StandardPriceSheetMeta) => void
}

type Sel =
  | { kind: 'meta' }
  | { kind: 'rules' }
  | { kind: 'cat'; ci: number }
  | { kind: 'item'; ci: number; ii: number }

const emptyItem = (): SheetItem => ({
  name: '新產品', model: '', chips: [], terms: [],
  cols: [{ l: '設備買斷' }, { l: '平台費（年繳）' }, { l: '0元租賃（合約三年）' }, { l: '備註', w: true }],
  rows: [['', '', '', '']],
  notes: [],
})

const forceLight = (html: string) => html.replace(/<html(?=[\s>])/i, '<html data-theme="light"')
const itemChanged = (it: SheetItem) => JSON.stringify(it).includes('«')

// Step 48：標準售價價目表編輯器（全頁）。左：目錄；中：編輯表單；右：即時預覽。
// 存檔＝用 renderSheetHtml() 產生完整 HTML：
// - 儲存修改（Step 48b）：PATCH 覆蓋現行版本內容，不新增版本，舊內容留在修改紀錄
// - 另存為新版本：POST 新增一個版本（調價、換新價目表時用）
export default function SheetEditor({ initial, baseMeta, canOverwrite, onClose, onSaved }: Props) {
  const [data, setData] = useState<SheetData>(initial)
  const [sel, setSel] = useState<Sel>(() => (initial.cats[0]?.items[0] ? { kind: 'item', ci: 0, ii: 0 } : { kind: 'meta' }))
  const [previewMode, setPreviewMode] = useState<'page' | 'item'>('item')
  const [dirty, setDirty] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState<{ message: string; run: () => void } | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [overwriting, setOverwriting] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeToggle = useRef<(() => void) | null>(null)
  const markCtx = useMemo(() => ({ setActive: (fn: (() => void) | null) => { activeToggle.current = fn } }), [])

  function update(fn: (d: SheetData) => SheetData) {
    setData(d => fn(d))
    setDirty(true)
  }
  const setMeta = (patch: Partial<SheetMeta>) => update(d => ({ ...d, meta: { ...d.meta, ...patch } }))
  const setCats = (fn: (cats: SheetCat[]) => SheetCat[]) => update(d => ({ ...d, cats: fn(d.cats) }))
  const setCat = (ci: number, patch: Partial<SheetCat>) => setCats(cats => setAt(cats, ci, { ...cats[ci], ...patch }))
  const setItem = (ci: number, ii: number, item: SheetItem) =>
    setCats(cats => setAt(cats, ci, { ...cats[ci], items: setAt(cats[ci].items, ii, item) }))

  // 離開頁面前提醒未儲存
  useEffect(() => {
    if (!dirty) return
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', h)
    return () => window.removeEventListener('beforeunload', h)
  }, [dirty])

  // 編輯器開著時鎖住背景頁面捲動
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  // ── 預覽（輸入停下 250ms 才重新產生，避免每打一個字就整個 iframe 重載） ──
  const [previewData, setPreviewData] = useState(data)
  useEffect(() => {
    const t = setTimeout(() => setPreviewData(data), 250)
    return () => clearTimeout(t)
  }, [data])
  const previewHtml = useMemo(() => {
    if (previewMode === 'item' && sel.kind === 'item') {
      const cat = previewData.cats[sel.ci]
      const item = cat?.items[sel.ii]
      if (item) return forceLight(renderSheetHtml({ ...previewData, cats: [{ ...cat, items: [item] }], rules: [] }, { compact: true }))
    }
    const catId = sel.kind === 'cat' || sel.kind === 'item' ? previewData.cats[sel.ci]?.id : undefined
    const focus = catId ? (sel.kind === 'item' ? `${catId}:${sel.ii}` : catId) : sel.kind === 'rules' ? 'rules' : undefined
    return forceLight(renderSheetHtml(previewData, { focus }))
  }, [previewData, previewMode, sel])

  // ── 目錄操作 ──
  function addCat() {
    const ci = data.cats.length
    setCats(cats => [...cats, { id: newCatId(cats), name: '新分類', desc: '', items: [] }])
    setSel({ kind: 'cat', ci })
  }
  function addItem(ci: number) {
    const ii = data.cats[ci].items.length
    setCat(ci, { items: [...data.cats[ci].items, emptyItem()] })
    setSel({ kind: 'item', ci, ii })
  }
  function moveCat(ci: number, d: number) {
    const j = ci + d
    if (j < 0 || j >= data.cats.length) return
    setCats(cats => move(cats, ci, d))
    setSel({ kind: 'cat', ci: j })
  }
  function deleteCat(ci: number) {
    const cat = data.cats[ci]
    setConfirmDelete({
      message: `「${cat.name}」${cat.items.length ? `底下的 ${cat.items.length} 個產品會一起刪除。` : ''}存檔前都可以按「取消」放棄修改。`,
      run: () => { setCats(cats => removeAt(cats, ci)); setSel({ kind: 'meta' }) },
    })
  }
  function moveItem(ci: number, ii: number, d: number) {
    const j = ii + d
    if (j < 0 || j >= data.cats[ci].items.length) return
    setCat(ci, { items: move(data.cats[ci].items, ii, d) })
    setSel({ kind: 'item', ci, ii: j })
  }
  function copyItem(ci: number, ii: number) {
    const src = data.cats[ci].items[ii]
    const copy: SheetItem = JSON.parse(JSON.stringify(src))
    copy.name = `${src.name.replace(/[«»]/g, '')}（複製）`
    const items = data.cats[ci].items
    setCat(ci, { items: [...items.slice(0, ii + 1), copy, ...items.slice(ii + 1)] })
    setSel({ kind: 'item', ci, ii: ii + 1 })
  }
  function deleteItem(ci: number, ii: number) {
    const it = data.cats[ci].items[ii]
    setConfirmDelete({
      message: `「${it.name.replace(/[«»]/g, '')}」會從價目表移除。存檔前都可以按「取消」放棄修改。`,
      run: () => {
        setCat(ci, { items: removeAt(data.cats[ci].items, ii) })
        setSel(data.cats[ci].items.length > 1 ? { kind: 'item', ci, ii: Math.max(0, ii - 1) } : { kind: 'cat', ci })
      },
    })
  }
  function moveItemToCat(ci: number, ii: number, target: number) {
    if (target === ci) return
    const it = data.cats[ci].items[ii]
    setCats(cats => cats.map((c, k) =>
      k === ci ? { ...c, items: removeAt(c.items, ii) } : k === target ? { ...c, items: [...c.items, it] } : c))
    setSel({ kind: 'item', ci: target, ii: data.cats[target].items.length })
  }

  async function saveOverwrite() {
    setOverwriting(true)
    setSaveError(null)
    try {
      const res = await fetch(`/api/standard-prices/sheets/${baseMeta.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: renderSheetHtml(data), base: baseMeta.updated_at ?? baseMeta.created_at }),
      })
      if (!res.ok) { setSaveError(await readApiError(res, '儲存失敗')); return }
      const json = await res.json()
      setDirty(false)
      onSaved(json.sheet)
    } catch {
      setSaveError('儲存失敗')
    } finally {
      setOverwriting(false)
    }
  }

  const totalChanged = data.cats.reduce((n, c) => n + c.items.filter(itemChanged).length, 0)
  const selCat = sel.kind === 'cat' || sel.kind === 'item' ? data.cats[sel.ci] : undefined
  const selItem = sel.kind === 'item' ? selCat?.items[sel.ii] : undefined

  return (
    <MarkContext.Provider value={markCtx}>
      <div
        className="fixed inset-0 z-[100] flex flex-col"
        style={{ background: C.bg, color: C.fg, fontFamily: '"Noto Sans TC","PingFang TC","Microsoft JhengHei",system-ui,sans-serif' }}
      >
        {/* 頂部列 */}
        <header className="flex items-end gap-3 px-5 pt-3 pb-2.5" style={{ borderBottom: `2px solid ${C.ink}` }}>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] tracking-[.12em]" style={{ color: C.chg, fontFamily: '"IBM Plex Mono",ui-monospace,monospace' }}>EUP · 編輯模式</div>
            <div className="text-xl font-black truncate" style={{ color: C.ink }}>{data.meta.title.replace(/[«»]/g, '') || '價目表'}</div>
          </div>
          <button
            type="button"
            onMouseDown={e => e.preventDefault()} // 保留輸入框的焦點與選取範圍
            onClick={() => activeToggle.current?.()}
            title="先點一個欄位（或選取其中幾個字），再按這裡切換紅底"
            className="h-9 whitespace-nowrap shrink-0 px-3 rounded-lg border bg-white text-sm flex items-center gap-1.5 hover:bg-[#eef0f4]"
            style={{ borderColor: C.line }}
          >
            <mark className="rounded px-1 font-bold" style={{ background: C.chgBg, color: C.chg }}>紅底</mark>
            標記／取消本次調整
          </button>
          <span className="text-xs self-center whitespace-nowrap" style={{ color: C.muted }}>{totalChanged} 項調整</span>
          <button
            type="button"
            onClick={() => (dirty ? setConfirmLeave(true) : onClose())}
            className="h-9 whitespace-nowrap shrink-0 px-4 rounded-lg border bg-white text-sm hover:bg-[#eef0f4]"
            style={{ borderColor: C.line }}
          >取消</button>
          <button
            type="button"
            onClick={() => setSaveOpen(true)}
            disabled={overwriting}
            className={canOverwrite
              ? 'h-9 whitespace-nowrap shrink-0 px-4 rounded-lg border bg-white text-sm hover:bg-[#eef0f4] disabled:opacity-50'
              : 'h-9 whitespace-nowrap shrink-0 px-4 rounded-lg text-sm font-bold text-white hover:opacity-90'}
            style={canOverwrite ? { borderColor: C.line, color: C.ink } : { background: C.ink }}
            title="調價、換新價目表時使用：新增一個版本，原版本保留在歷史版本"
          >另存為新版本</button>
          {canOverwrite && (
            <button
              type="button"
              onClick={saveOverwrite}
              disabled={overwriting || !dirty}
              className="h-9 whitespace-nowrap shrink-0 px-4 rounded-lg text-sm font-bold text-white hover:opacity-90 flex items-center gap-1.5 disabled:opacity-50"
              style={{ background: C.ink }}
              title="細節修改：直接更新目前這個版本，不新增版本；修改前的內容留在修改紀錄"
            >
              {overwriting && <Loader2 className="h-4 w-4 animate-spin" />}儲存修改
            </button>
          )}
        </header>
        {(saveError || !canOverwrite) && (
          <div className="px-5 py-1.5 text-xs" style={saveError ? { background: C.chgBg, color: C.chg } : { background: '#fdf3e3', color: '#8a5a1c' }}>
            {saveError ?? '你正在看歷史版本：歷史版本維持當時核決的內容不能修改，改完只能「另存為新版本」。'}
          </div>
        )}

        <div className="flex-1 min-h-0 grid" style={{ gridTemplateColumns: '230px minmax(0,1fr) minmax(0,0.9fr)' }}>
          {/* 左：目錄 */}
          <nav className="overflow-y-auto px-2 py-3 space-y-0.5 text-sm">
            <TreeLabel>基本</TreeLabel>
            <TreeBtn active={sel.kind === 'meta'} onClick={() => setSel({ kind: 'meta' })}>表頭資訊</TreeBtn>
            <TreeBtn active={sel.kind === 'rules'} onClick={() => setSel({ kind: 'rules' })} count={data.rules.length}>權限規則</TreeBtn>
            <TreeLabel className="pt-3">產品分類</TreeLabel>
            {data.cats.map((cat, ci) => (
              <div key={cat.id}>
                <TreeBtn active={sel.kind === 'cat' && sel.ci === ci} onClick={() => setSel({ kind: 'cat', ci })} bold
                  count={cat.items.length} chg={cat.items.filter(itemChanged).length}>
                  {cat.name || '（未命名分類）'}
                </TreeBtn>
                {cat.items.map((it, ii) => (
                  <TreeBtn key={ii} indent active={sel.kind === 'item' && sel.ci === ci && sel.ii === ii}
                    onClick={() => setSel({ kind: 'item', ci, ii })} chg={itemChanged(it) ? -1 : 0}>
                    {it.name.replace(/[«»]/g, '') || '（未命名產品）'}
                  </TreeBtn>
                ))}
                {(sel.kind === 'cat' || sel.kind === 'item') && sel.ci === ci && (
                  <div className="pl-5"><AddBtn onClick={() => addItem(ci)}>新增產品</AddBtn></div>
                )}
              </div>
            ))}
            <div className="pt-1"><AddBtn onClick={addCat}>新增分類</AddBtn></div>
          </nav>

          {/* 中：表單 */}
          <main className="overflow-y-auto py-4 pr-2">
            <div className="bg-white border rounded-xl px-5 py-4" style={{ borderColor: C.line }}>
              {sel.kind === 'meta' && <MetaForm meta={data.meta} onChange={setMeta} />}
              {sel.kind === 'rules' && <RulesForm rules={data.rules} onChange={rules => update(d => ({ ...d, rules }))} />}
              {sel.kind === 'cat' && selCat && (
                <CatForm
                  cat={selCat} index={sel.ci} count={data.cats.length}
                  onChange={patch => setCat(sel.ci, patch)}
                  onMove={d => moveCat(sel.ci, d)}
                  onDelete={() => deleteCat(sel.ci)}
                  onAddItem={() => addItem(sel.ci)}
                  onOpenItem={ii => setSel({ kind: 'item', ci: sel.ci, ii })}
                />
              )}
              {sel.kind === 'item' && selItem && (
                <SheetItemForm
                  item={selItem} cats={data.cats} catIndex={sel.ci} itemIndex={sel.ii} itemCount={selCat!.items.length}
                  onChange={it => setItem(sel.ci, sel.ii, it)}
                  onMove={d => moveItem(sel.ci, sel.ii, d)}
                  onCopy={() => copyItem(sel.ci, sel.ii)}
                  onDelete={() => deleteItem(sel.ci, sel.ii)}
                  onMoveToCat={t => moveItemToCat(sel.ci, sel.ii, t)}
                />
              )}
            </div>
          </main>

          {/* 右：即時預覽 */}
          <aside className="flex flex-col min-h-0 py-4 pr-4 pl-2">
            <div className="flex items-center gap-2 mb-2 text-xs" style={{ color: C.muted }}>
              <span className="flex-1">即時預覽</span>
              <div className="flex rounded-md border overflow-hidden bg-white" style={{ borderColor: C.line }}>
                {(['page', 'item'] as const).map(m => (
                  <button key={m} type="button" onClick={() => setPreviewMode(m)}
                    className="px-2.5 py-1"
                    style={previewMode === m ? { background: C.ink, color: '#fff' } : { color: C.muted }}>
                    {m === 'page' ? '整頁' : '此產品'}
                  </button>
                ))}
              </div>
            </div>
            <iframe
              title="價目表預覽"
              srcDoc={previewHtml}
              sandbox="allow-scripts"
              className="flex-1 w-full rounded-xl border bg-white"
              style={{ borderColor: C.line }}
            />
            {previewMode === 'item' && sel.kind !== 'item' && (
              <p className="text-[11px] mt-1" style={{ color: '#8a93a3' }}>選左邊的產品時，這裡只顯示該產品卡片</p>
            )}
          </aside>
        </div>

        {saveOpen && (
          <SaveDialog
            data={data}
            baseMeta={baseMeta}
            onCancel={() => setSaveOpen(false)}
            onSaved={sheet => { setDirty(false); onSaved(sheet) }}
          />
        )}

        <ConfirmDialog
          open={confirmLeave}
          title="放棄這次的修改？"
          message="還沒儲存的修改都會消失。"
          confirmLabel="放棄修改"
          danger
          onConfirm={() => { setConfirmLeave(false); onClose() }}
          onCancel={() => setConfirmLeave(false)}
        />
        <ConfirmDialog
          open={!!confirmDelete}
          title="確定刪除？"
          message={confirmDelete?.message}
          confirmLabel="刪除"
          danger
          onConfirm={() => { confirmDelete?.run(); setConfirmDelete(null) }}
          onCancel={() => setConfirmDelete(null)}
        />
      </div>
    </MarkContext.Provider>
  )
}

// ── 目錄按鈕 ──
function TreeLabel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`px-3 pb-1 text-[11px] tracking-[.08em] ${className}`} style={{ color: C.muted }}>{children}</div>
}

function TreeBtn({ children, active, onClick, indent, bold, count, chg = 0 }: {
  children: React.ReactNode; active: boolean; onClick: () => void; indent?: boolean; bold?: boolean; count?: number; chg?: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-2 py-1.5 pr-2.5 rounded-lg text-left transition-colors ${indent ? 'pl-6 text-[13px]' : 'pl-3'} ${active ? '' : 'hover:bg-[#eef0f4]'}`}
      style={{
        borderLeft: `3px solid ${active ? C.chg : 'transparent'}`,
        background: active ? C.surface : undefined,
        boxShadow: active ? '0 1px 2px rgba(0,0,0,.06)' : undefined,
        color: active ? C.ink : indent ? C.muted : C.fg,
        fontWeight: active ? 700 : bold ? 500 : 400,
      }}
    >
      <span className="truncate">{children}</span>
      {chg > 0 ? <em className="not-italic text-[11px] font-bold shrink-0" style={{ color: C.chg }}>{chg} 調整</em>
        : chg < 0 ? <em className="not-italic text-[11px] font-bold shrink-0" style={{ color: C.chg }}>調整</em>
        : count !== undefined ? <em className="not-italic text-[11px] shrink-0" style={{ color: C.muted }}>{count}</em> : null}
    </button>
  )
}

// ── 表頭資訊 ──
function MetaForm({ meta, onChange }: { meta: SheetMeta; onChange: (p: Partial<SheetMeta>) => void }) {
  return (
    <div>
      <h2 className="text-lg font-black mb-4" style={{ color: C.ink }}>表頭資訊</h2>
      <div className="grid grid-cols-2 gap-x-3">
        <Section title="左上小字"><Field value={meta.brand} onChange={v => onChange({ brand: v })} /></Section>
        <Section title="瀏覽器分頁標題" hint="也是存檔時的預設標題"><Field value={meta.docTitle} onChange={v => onChange({ docTitle: v })} /></Section>
      </div>
      <Section title="大標題"><Field value={meta.title} onChange={v => onChange({ title: v })} bold /></Section>
      <Section title="副標" hint="簽呈、適用日、單位"><Field value={meta.sub} onChange={v => onChange({ sub: v })} multiline /></Section>
      <div className="grid grid-cols-3 gap-x-3">
        <Section title="右上日期"><Field value={meta.factDate} onChange={v => onChange({ factDate: v })} /></Section>
        <Section title="日期說明"><Field value={meta.factDateLabel} onChange={v => onChange({ factDateLabel: v })} /></Section>
        <Section title="調整標籤文字" hint="產品卡片上"><Field value={meta.changeTag} onChange={v => onChange({ changeTag: v })} placeholder="例如 10/1 調整" /></Section>
      </div>
      <Section title="圖例" hint="表頭下方一排說明；左邊整格標成紅底就會顯示成紅底樣式">
        <div className="space-y-1.5">
          {meta.legend.map((g, i) => (
            <div key={i} className="flex items-start gap-1">
              <div className="w-32 shrink-0"><Field value={g.k} onChange={k => onChange({ legend: setAt(meta.legend, i, { ...g, k }) })} placeholder="名稱" /></div>
              <div className="flex-1 min-w-0"><Field value={g.v} onChange={v => onChange({ legend: setAt(meta.legend, i, { ...g, v }) })} placeholder="說明" /></div>
              <IconBtn title="上移" onClick={() => onChange({ legend: move(meta.legend, i, -1) })} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title="刪除" danger onClick={() => onChange({ legend: removeAt(meta.legend, i) })}><X className="h-3.5 w-3.5" /></IconBtn>
            </div>
          ))}
          <AddBtn onClick={() => onChange({ legend: [...meta.legend, { k: '', v: '' }] })}>新增圖例</AddBtn>
        </div>
      </Section>
      <Section title="頁尾"><Field value={meta.footer} onChange={v => onChange({ footer: v })} multiline /></Section>
    </div>
  )
}

// ── 權限規則 ──
function RulesForm({ rules, onChange }: { rules: SheetRule[]; onChange: (r: SheetRule[]) => void }) {
  return (
    <div>
      <h2 className="text-lg font-black mb-1" style={{ color: C.ink }}>權限規則</h2>
      <p className="text-xs mb-4" style={{ color: C.muted }}>價目表最下方「權限規則與重要備註」的卡片，每張卡片一個標題加幾條條文。</p>
      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={i} className="border rounded-lg p-3" style={{ borderColor: C.line, background: '#fafbfc' }}>
            <div className="flex items-center gap-1 mb-2">
              <div className="flex-1"><Field value={r.h} onChange={h => onChange(setAt(rules, i, { ...r, h }))} placeholder="卡片標題" bold /></div>
              <IconBtn title="上移" onClick={() => onChange(move(rules, i, -1))} disabled={i === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title="下移" onClick={() => onChange(move(rules, i, 1))} disabled={i === rules.length - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
              <IconBtn title="刪除這張卡片" danger onClick={() => onChange(removeAt(rules, i))}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
            </div>
            <div className="pl-3">
              <StringList items={r.li} onChange={li => onChange(setAt(rules, i, { ...r, li }))} addLabel="新增條文" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2"><AddBtn onClick={() => onChange([...rules, { h: '新規則', li: [''] }])}>新增規則卡片</AddBtn></div>
    </div>
  )
}

// ── 分類 ──
function CatForm({ cat, index, count, onChange, onMove, onDelete, onAddItem, onOpenItem }: {
  cat: SheetCat; index: number; count: number
  onChange: (p: Partial<SheetCat>) => void; onMove: (d: number) => void; onDelete: () => void
  onAddItem: () => void; onOpenItem: (ii: number) => void
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-4">
        <h2 className="text-lg font-black flex-1 truncate" style={{ color: C.ink }}>{cat.name || '（未命名分類）'}</h2>
        <IconBtn title="上移" onClick={() => onMove(-1)} disabled={index === 0}><ArrowUp className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="下移" onClick={() => onMove(1)} disabled={index === count - 1}><ArrowDown className="h-3.5 w-3.5" /></IconBtn>
        <IconBtn title="刪除此分類" danger onClick={onDelete}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
      <div className="grid grid-cols-2 gap-x-3">
        <Section title="分類名稱" hint="左側選單顯示的名稱"><Field value={cat.name} onChange={v => onChange({ name: v })} bold /></Section>
        <Section title="分類說明" hint="標題旁的灰字"><Field value={cat.desc} onChange={v => onChange({ desc: v })} /></Section>
      </div>
      <Section title={`產品（${cat.items.length}）`}>
        <div className="border rounded-lg divide-y" style={{ borderColor: C.line }}>
          {cat.items.map((it, ii) => (
            <button key={ii} type="button" onClick={() => onOpenItem(ii)}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[#f5f6f8]" style={{ borderColor: C.line }}>
              <span className="flex-1 truncate">{it.name.replace(/[«»]/g, '') || '（未命名產品）'}</span>
              <span className="text-xs" style={{ color: C.muted }}>{it.model}</span>
            </button>
          ))}
          {cat.items.length === 0 && <div className="px-3 py-3 text-sm" style={{ color: C.muted }}>這個分類還沒有產品</div>}
        </div>
        <div className="mt-1.5">
          <button type="button" onClick={onAddItem}
            className="inline-flex items-center gap-1 text-[13px] font-medium px-1.5 py-1 rounded-md hover:bg-[#eef0f4]" style={{ color: C.ink }}>
            <Plus className="h-3.5 w-3.5" />新增產品
          </button>
        </div>
      </Section>
    </div>
  )
}

// ── 另存為新版本 ──
function SaveDialog({ data, baseMeta, onCancel, onSaved }: {
  data: SheetData; baseMeta: StandardPriceSheetMeta; onCancel: () => void; onSaved: (s: StandardPriceSheetMeta) => void
}) {
  const [title, setTitle] = useState(data.meta.docTitle || baseMeta.title)
  const [month, setMonth] = useState(baseMeta.effective_date.slice(0, 7))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!title.trim()) { setError('請輸入標題'); return }
    if (!/^\d{4}-\d{2}$/.test(month)) { setError('請選擇生效月份'); return }
    setSaving(true)
    setError(null)
    try {
      const html = renderSheetHtml(data)
      const res = await fetch('/api/standard-prices/sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          effective_date: `${month}-01`,
          file_name: `${title.trim()}_${month.replace('-', '')}.html`,
          html,
        }),
      })
      if (!res.ok) { setError(await readApiError(res, '儲存失敗')); return }
      const json = await res.json()
      onSaved(json.sheet)
    } catch {
      setError('儲存失敗')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full h-9 border rounded-lg px-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#24324a]/60'
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center" style={{ background: 'rgba(27,34,48,.45)' }}>
      <div className="w-[400px] bg-white rounded-xl border p-5 shadow-xl" style={{ borderColor: C.line }}>
        <h3 className="text-base font-black mb-3" style={{ color: C.ink }}>另存為新版本</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: C.muted }}>標題</label>
            <input value={title} onChange={e => setTitle(e.target.value)} disabled={saving} className={inputCls} style={{ borderColor: C.line }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: C.muted }}>生效月份</label>
            <input type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={saving} className={inputCls} style={{ borderColor: C.line }} />
          </div>
          <p className="text-xs" style={{ color: C.muted }}>用於調價或換新價目表：會新增一個版本，原本的版本保留在「歷史版本」，生效月份最新的版本會成為現行版本。只是修正細節請改按「儲存修改」。</p>
          {error && <p className="text-xs" style={{ color: C.chg }}>{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onCancel} disabled={saving}
              className="h-9 px-4 rounded-lg border bg-white text-sm" style={{ borderColor: C.line }}>返回編輯</button>
            <button type="button" onClick={save} disabled={saving}
              className="h-9 px-4 rounded-lg text-sm font-bold text-white flex items-center gap-1.5 disabled:opacity-60" style={{ background: C.ink }}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}儲存
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
