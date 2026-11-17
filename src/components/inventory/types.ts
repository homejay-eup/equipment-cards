// Step 54：CRM 庫存頁共用型別
export interface InvProduct {
  key: string                 // 料號，或「name:類型|名稱」（沒對到料號）
  pid: string | null
  name: string                // 有料卡用料卡名稱，否則用 CRM 名稱
  crmNames: string[]
  type: string                // 車機／配件／Sim卡
  onCard: boolean             // 料號是否為網站上的料卡
  cells: Record<string, [number, number]>   // 倉 → [可使用, 不可使用]
}
export interface InvWarehouse { name: string; region: string }
export interface InvBatch { label: string; exportedAt: string | null }
export interface InvCan { barcodes: boolean; refresh: boolean; stocktake: boolean; transfers?: boolean; idle?: boolean }

/** 移交出去／待接收／持有過久用的設備一筆（對應 /api/inventory/transfers） */
export interface TransferItem {
  barcode: string; from: string; to: string | null; category: string | null; name: string
  product_id: string | null; at: string | null; op: string | null; who: string | null
}

export interface InvItem {
  barcode: string; warehouse: string; region: string | null; category: string | null; name: string
  product_id: string | null; car: string | null; crm_updated: string | null; op: string | null; who: string | null
  unusable: boolean; note: string | null
}

export interface InvPrefs {
  wh: string[]                          // 自選倉庫（＝樞紐表欄位，順序即欄位順序）
  view: 'pivot' | 'list'
  grp: 'type' | 'none'
  sort: { k: string; d: 1 | -1 }         // k：pid／name／tot／<倉名>／custom
  order: string[]                       // 我拖曳排好的產品順序（product key）
  gorder: string[]                      // 分組順序
  col: Record<string, boolean>          // 分組收合
  onlyStock: boolean
  xs?: Partial<Record<'out' | 'in' | 'idle', string[] | null>>   // 移交出去／待接收／持有過久各自的倉庫範圍；沒設＝預設（持有過久＝全部技師不含測試倉，其餘＝全部倉庫）；null／空＝全部倉庫
}

export const TYPE_ORDER = ['車機', '配件', 'Sim卡']
export const DEFAULT_WH = ['總倉', '固資倉(整新)', '固資倉(舊品)']

export function defaultPrefs(all: InvWarehouse[]): InvPrefs {
  const names = all.map(w => w.name)
  const wh = DEFAULT_WH.filter(w => names.includes(w))
  return {
    wh: wh.length ? wh : names.slice(0, 5),
    view: 'pivot', grp: 'type', sort: { k: 'pid', d: 1 }, order: [], gorder: [...TYPE_ORDER], col: {}, onlyStock: true,
  }
}

export const fmt = (n: number) => (n ? n.toLocaleString() : '')
export const cell = (p: InvProduct, w: string): [number, number] => p.cells[w] ?? [0, 0]
