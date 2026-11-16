// ERP（鼎新 Cosmos）品號庫存：解析「品號資料建立作業 INVMI02」匯出的 Excel，並存成一批（erp_stock_runs／erp_stock_items）。
// 和公司電腦的 erp_upload.py 規則一致：用表頭文字對欄位、≥500 筆、品號不重複、不比上一次 ok 少超過 10%、整批寫完核對才生效。
import * as XLSX from 'xlsx'
import { getServiceClient } from '@/lib/departments'

export interface ErpRow {
  product_id: string; name: string; qty: number; main_wh: string | null; vendor: string | null
  has_serial: boolean; own_barcode: boolean; serial_prefix: string | null; warranty_months: number | null
}

const HEAD: Record<string, string> = {
  品號: 'pid', 品名: 'name', 庫存數量: 'qty', 主要庫別: 'wh', 主供應商名稱: 'vendor', 主要廠商名稱: 'vendor',
  控制編碼原則: 'own', 序號前置碼: 'prefix', 保固期: 'warranty', 進貨序號紀錄: 'serial',
}
const MIN_ROWS = 500
const CHUNK = 500

const str = (v: unknown) => (v == null ? '' : String(v).trim())

/** 解析匯出檔；格式不對就丟出白話錯誤 */
export function parseErpXlsx(buf: Buffer): ErpRow[] {
  let rows: unknown[][]
  try {
    const wb = XLSX.read(buf, { type: 'buffer' })
    const ws = wb.Sheets[wb.SheetNames[0]]
    rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true })
  } catch { throw new Error('讀不出這個檔案，請上傳 ERP「品號資料建立作業」匯出的 Excel（.xlsx）') }
  const hi = rows.findIndex(r => r.some(c => str(c) === '品號'))
  if (hi < 0) throw new Error('找不到「品號」表頭，這不是 ERP 品號資料建立作業的匯出檔')
  const col: Record<string, number> = {}
  rows[hi].forEach((h, i) => {
    const t = str(h)
    for (const k of Object.keys(HEAD)) if (t.startsWith(k) && !(HEAD[k] in col)) col[HEAD[k]] = i
  })
  const need = ['pid', 'name', 'qty', 'serial']
  const miss = need.filter(f => !(f in col))
  if (miss.length) throw new Error('匯出檔缺少必要欄位（品號、品名、庫存數量、進貨序號紀錄），請在匯出欄位設定勾選這些欄位')
  const get = (r: unknown[], f: string) => (f in col ? r[col[f]] : null)
  const out: ErpRow[] = []
  const seen = new Set<string>()
  for (const r of rows.slice(hi + 1)) {
    const pid = str(get(r, 'pid'))
    if (!pid) continue
    if (seen.has(pid)) throw new Error(`品號重複：${pid}`)
    seen.add(pid)
    const q = Number(get(r, 'qty') ?? 0)
    const w = get(r, 'warranty')
    out.push({
      product_id: pid, name: str(get(r, 'name')), qty: Number.isFinite(q) ? q : 0,
      main_wh: str(get(r, 'wh')) || null, vendor: str(get(r, 'vendor')) || null,
      has_serial: str(get(r, 'serial')) === 'Y', own_barcode: str(get(r, 'own')) === 'Y',
      serial_prefix: str(get(r, 'prefix')) || null,
      warranty_months: w != null && w !== '' && Number.isFinite(Number(w)) ? Math.round(Number(w)) : null,
    })
  }
  return out
}

/** 存成新的一批；成功才生效（網站讀最新一筆 ok），舊批整批清掉 */
export async function saveErpRun(items: ErpRow[], exportedAt: string, trigger: string, by: string) {
  const n = items.length
  if (n < MIN_ROWS) throw new Error(`只有 ${n} 筆，太少，不更新（應該是全部品號約 1,400 筆；請確認匯出前有把資料捲到最後一筆）`)
  const db = getServiceClient()
  const { data: last } = await db.from('erp_stock_runs').select('rows').eq('status', 'ok').order('exported_at', { ascending: false }).limit(1).maybeSingle()
  if (last && n < Math.floor(last.rows * 0.9)) throw new Error(`筆數 ${n} 比目前的 ${last.rows} 少超過 10%，不更新（可能匯出時沒有捲到最後一筆）`)
  const { data: run, error: re } = await db.from('erp_stock_runs')
    .insert({ exported_at: exportedAt, rows: n, status: 'uploading', trigger, note: by }).select('id').single()
  if (re || !run) throw new Error(re?.message ?? '建立紀錄失敗')
  try {
    for (let i = 0; i < n; i += CHUNK) {
      const { error } = await db.from('erp_stock_items').insert(items.slice(i, i + CHUNK).map(it => ({ ...it, run_id: run.id })))
      if (error) throw new Error(error.message)
    }
    const { count, error: ce } = await db.from('erp_stock_items').select('product_id', { count: 'exact', head: true }).eq('run_id', run.id)
    if (ce) throw new Error(ce.message)
    if (count !== n) throw new Error(`寫入筆數 ${count} ≠ 檔案 ${n}`)
    const { error: ue } = await db.from('erp_stock_runs').update({ status: 'ok' }).eq('id', run.id)
    if (ue) throw new Error(ue.message)
  } catch (e) {
    await db.from('erp_stock_runs').delete().eq('id', run.id)   // 連同寫一半的品項一起刪（cascade）
    throw e
  }
  await db.from('erp_stock_runs').delete().lt('id', run.id)       // 舊的整批清掉（cascade）
  return { runId: run.id as number, rows: n, noBarcode: items.filter(i => !i.has_serial).length, ownBarcode: items.filter(i => i.own_barcode).length }
}
