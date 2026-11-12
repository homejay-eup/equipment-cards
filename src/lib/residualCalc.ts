// Step 53：設備殘值 計算與輸出（純函式＋瀏覽器 canvas，從「設備殘值計算器」HTML 原樣搬移，計算規則不變）
//
// 殘值＝金額 ÷ 年限(月) × 剩餘月數（超過年限以 0 計）
// 使用月數同 Excel DATEDIF(起算日, 計算日, "M")，只算滿月；每列殘值四捨五入到元，合計為各列加總。
import type { ResidualItem } from '@/types/residual'

export type ResidualMode = 'device' | 'contract'

export type RowState = 'empty' | 'notfound' | 'noprice' | 'needcalc' | 'needstart' | 'future' | 'ok'

export interface CalcResult {
  state: RowState
  item: ResidualItem | null
  used?: number   // 使用月數
  yrs?: number    // 年限（月）
  left?: number   // 剩餘月數
  price?: number
  per?: number    // 每月成本
  val?: number    // 殘值
}

interface YMD { y: number; m: number; d: number }

function parseD(s: string): YMD | null {
  if (!s) return null
  const [y, m, d] = s.split('-').map(Number)
  if (!y || !m || !d) return null
  return { y, m, d }
}

/** 同 Excel DATEDIF(a, b, "M")：滿幾個月 */
function datedifM(a: YMD, b: YMD): number {
  let n = (b.y - a.y) * 12 + (b.m - a.m)
  if (b.d < a.d) n--
  return n
}

function cmp(a: YMD, b: YMD): number {
  return (a.y - b.y) || (a.m - b.m) || (a.d - b.d)
}

export interface ItemIndex {
  byName: Map<string, ResidualItem>
  byCode: Map<string, ResidualItem>
}

export function buildIndex(items: ResidualItem[]): ItemIndex {
  const byName = new Map<string, ResidualItem>()
  const byCode = new Map<string, ResidualItem>()
  for (const it of items) {
    byName.set(it.name.toLowerCase(), it)
    byCode.set(it.code, it)
  }
  return { byName, byCode }
}

/** 輸入框內容（品名或品號）→ 品項；找不到回 null */
export function lookupItem(index: ItemIndex, text: string): ResidualItem | null {
  const s = (text ?? '').trim()
  if (!s) return null
  return index.byName.get(s.toLowerCase()) ?? index.byCode.get(s) ?? null
}

/** startDate 已由呼叫端依模式決定（設備＝該列起算日，合約＝合約起算日） */
export function calcRow(index: ItemIndex, name: string, calcDate: string, startDate: string): CalcResult {
  if (!name.trim()) return { state: 'empty', item: null }
  const item = lookupItem(index, name)
  if (!item) return { state: 'notfound', item: null }
  if (item.price == null || item.years == null) return { state: 'noprice', item }
  const calcD = parseD(calcDate)
  const start = parseD(startDate)
  if (!calcD) return { state: 'needcalc', item }
  if (!start) return { state: 'needstart', item }
  if (cmp(start, calcD) > 0) return { state: 'future', item }
  const used = datedifM(start, calcD)
  const yrs = item.years
  const left = Math.max(0, yrs - used)
  const per = item.price / yrs
  const val = Math.round(per * left)
  return { state: 'ok', item, used, yrs, left, price: item.price, per, val }
}

/** 已超過年限時顯示用的說明：已滿年限／已超過 1 年 2 個月 */
export function overText(c: CalcResult): string {
  const o = (c.used ?? 0) - (c.yrs ?? 0)
  if (o <= 0) return '已滿年限'
  const y = Math.floor(o / 12)
  const m = o % 12
  return '已超過 ' + (y ? y + ' 年' : '') + (y && m ? ' ' : '') + (m ? m + ' 個月' : '')
}

export const fmt = (n: number) => n.toLocaleString('zh-TW', { maximumFractionDigits: 0 })
export const fmt1 = (n: number) => n.toLocaleString('zh-TW', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

/** 價格版本（ISO）→ 2026-11-09 10:59（台灣時間） */
export function formatVersion(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(d)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`
}

export const STATE_NOTE: Record<string, string> = {
  notfound: '查無此品名',
  noprice: '報價無資料',
  needcalc: '缺計算日',
  needstart: '缺起算日',
  future: '起算日晚於計算日',
}

export interface OutputRow {
  name: string
  barcode: string
  start: string       // 該列顯示的起算日（合約模式為合約起算日）
  calc: CalcResult
}

export interface OutputMeta {
  mode: ResidualMode
  calcDate: string
  contractDate: string
  version: string     // 已格式化的價格版本
  totalText: string   // 已格式化的合計（含千分位）
}

/** 複製到 Excel 的 TSV（含表頭與合計列） */
export function buildTsv(rows: OutputRow[], meta: OutputMeta): string {
  const lines = [['品號', '品名', '條碼', '起算日', '計算日', '使用', '年限', '剩餘', '金額', '每月成本', '殘值', '備註'].join('\t')]
  for (const r of rows) {
    const c = r.calc
    if (c.state === 'empty') continue
    let note = STATE_NOTE[c.state] ?? ''
    if (c.state === 'ok' && c.left === 0) note = overText(c)
    lines.push([
      c.item ? c.item.code : '', r.name.trim(), r.barcode, r.start, meta.calcDate,
      c.used ?? '', c.yrs ?? '', c.left ?? '', c.price ?? '',
      c.per != null ? c.per.toFixed(1) : '', c.val ?? '', note,
    ].join('\t'))
  }
  lines.push(['', '', '', '', '', '', '', '', '', '合計', meta.totalText.replace(/,/g, ''), meta.mode === 'contract' ? '合約殘值' : '設備殘值'].join('\t'))
  return lines.join('\n')
}

/** 產出單據用圖片（PNG）；沒有可輸出的列回 null */
export function buildResultImage(rows: OutputRow[], meta: OutputMeta): Promise<Blob | null> {
  const R = rows.filter((r) => r.calc.state !== 'empty')
  if (!R.length) return Promise.resolve(null)
  const isC = meta.mode === 'contract'
  const cols: [string, number, 'l' | 'r'][] = [
    ['品名', 300, 'l'], ['條碼', 190, 'l'], ['起算日', 100, 'l'], ['使用', 56, 'r'], ['年限', 56, 'r'],
    ['剩餘', 56, 'r'], ['金額', 84, 'r'], ['每月成本', 84, 'r'], ['殘值', 210, 'r'],
  ]
  const pad = 24
  const rowH = 34
  const headH = 110
  const W = pad * 2 + cols.reduce((s, c) => s + c[1], 0)
  const H = headH + rowH * (R.length + 1) + 64
  const scale = 2
  const cv = document.createElement('canvas')
  cv.width = W * scale
  cv.height = H * scale
  const g = cv.getContext('2d')
  if (!g) return Promise.resolve(null)
  g.scale(scale, scale)
  g.textBaseline = 'middle'
  const F = '"Microsoft JhengHei","PingFang TC","Noto Sans TC",sans-serif'
  const fit = (t: string, w: number) => {
    if (g.measureText(t).width <= w) return t
    while (t.length && g.measureText(t + '…').width > w) t = t.slice(0, -1)
    return t + '…'
  }
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, W, H)
  g.fillStyle = '#1d2430'
  g.font = 'bold 20px ' + F
  g.fillText(isC ? '合約殘值計算' : '設備殘值計算', pad, 30)
  g.font = '14px ' + F
  g.fillStyle = '#5d6878'
  const info = ['計算日：' + (meta.calcDate || '—')]
  if (isC) info.push('合約起算日：' + (meta.contractDate || '—'))
  info.push('價格版本：' + meta.version)
  g.fillText(info.join('　｜　'), pad, 62)
  g.fillText('殘值＝金額 ÷ 年限 × 剩餘月數（超過年限以 0 計）', pad, 86)

  let y = headH
  const drawRow = (vals: (string | number)[], bold: boolean, colors?: Record<number, string>) => {
    let x = pad
    g.font = (bold ? 'bold ' : '') + '14px ' + F
    cols.forEach((c, i) => {
      const v = String(vals[i] ?? '')
      g.fillStyle = (colors && colors[i]) || '#1d2430'
      const t = fit(v, c[1] - 12)
      if (c[2] === 'r') { g.textAlign = 'right'; g.fillText(t, x + c[1] - 6, y + rowH / 2) }
      else { g.textAlign = 'left'; g.fillText(t, x + 6, y + rowH / 2) }
      x += c[1]
    })
    g.textAlign = 'left'
  }
  g.fillStyle = '#e3ecf6'
  g.fillRect(pad, y, W - pad * 2, rowH)
  drawRow(cols.map((c) => c[0]), true)

  for (const r of R) {
    const c = r.calc
    y += rowH
    g.strokeStyle = '#d9dee6'
    g.lineWidth = 1
    g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke()
    const val = c.state === 'ok'
      ? (c.left === 0 ? '0（' + overText(c) + '）' : fmt(c.val ?? 0))
      : (STATE_NOTE[c.state] ?? '')
    drawRow(
      [r.name.trim(), r.barcode, r.start, c.used ?? '', c.yrs ?? '', c.left ?? '',
        c.price != null ? fmt(c.price) : '', c.per != null ? fmt1(c.per) : '', val],
      false,
      { 8: c.state === 'ok' ? (c.left === 0 ? '#5d6878' : '#1d2430') : '#b3261e' },
    )
  }
  y += rowH
  g.strokeStyle = '#1d2430'
  g.lineWidth = 1.5
  g.beginPath(); g.moveTo(pad, y); g.lineTo(W - pad, y); g.stroke()
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  g.font = '12px ' + F
  g.fillStyle = '#5d6878'
  g.fillText(`產出時間 ${n.getFullYear()}-${p(n.getMonth() + 1)}-${p(n.getDate())} ${p(n.getHours())}:${p(n.getMinutes())}`, pad, y + 30)
  g.font = 'bold 18px ' + F
  g.fillStyle = '#1d2430'
  g.textAlign = 'right'
  g.fillText('殘值合計 ' + meta.totalText + ' 元', W - pad, y + 30)
  return new Promise((res) => cv.toBlob(res, 'image/png'))
}

export function imageFileName(mode: ResidualMode): string {
  const n = new Date()
  const p = (x: number) => String(x).padStart(2, '0')
  return `${mode === 'contract' ? '合約' : '設備'}殘值_${n.getFullYear()}${p(n.getMonth() + 1)}${p(n.getDate())}_${p(n.getHours())}${p(n.getMinutes())}.png`
}
