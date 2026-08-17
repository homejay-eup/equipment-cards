import { useState } from 'react'

// Step 34：設備組合（部門共享組合）。封裝 /api/packages/* 呼叫，
// 風格比照 useDocumentUpload：失敗時 throw Error（訊息取自 API 回應的 error 欄位），
// 由呼叫端 try/catch 處理，不在 hook 內部吞掉錯誤。

export interface PackageItemRecord {
  equipment_id: string
  added_at: string
  quantity: number
  sort_order: number
}

export interface PackageSharedDepartment {
  department_id: string
}

// UI 上顯示為「組合」（跟「我的關注」/UserGroup 統一用字），
// 但程式碼識別字、API 路由（/api/packages/*）、資料庫資料表（equipment_packages）沿用原本的
// 「套餐」/Package 命名，未跟著改名。要找「設備套餐」相關程式碼時認這個型別/前綴。
export interface EquipmentPackage {
  id: string
  name: string
  department_id: string
  source_group_id: string | null
  source_synced_at: string | null
  sort_order: number | null
  created_by: string
  created_at: string
  updated_at: string
  package_items: PackageItemRecord[]
  package_shared_departments: PackageSharedDepartment[]
}

// GET /api/packages/shared 額外帶來源部門名稱
export interface SharedEquipmentPackage extends EquipmentPackage {
  source_department_name: string | null
}

export interface BatchShareResult {
  success: true
}

export interface BatchDeleteResult {
  success: true
  deleted: number
}

export interface BatchItemsResult {
  add?: string[]
  remove?: string[]
}

async function parseErrorOr<T>(res: Response, fallback: string): Promise<T> {
  if (res.status === 204) return undefined as unknown as T
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((data as { error?: string }).error ?? fallback)
  return data as T
}

export function usePackages() {
  const [loading, setLoading] = useState(false)

  // ── 本部門組合清單 ──────────────────────────────────────────
  async function list(): Promise<EquipmentPackage[]> {
    const res = await fetch('/api/packages')
    return parseErrorOr<EquipmentPackage[]>(res, '查詢組合失敗')
  }

  // ── 其他部門分享給我的組合 ──────────────────────────────────
  async function listShared(): Promise<SharedEquipmentPackage[]> {
    const res = await fetch('/api/packages/shared')
    return parseErrorOr<SharedEquipmentPackage[]>(res, '查詢分享組合失敗')
  }

  // ── 建立組合（可帶 source_group_id 做「複製為組合」） ──────────
  async function create(name: string, sourceGroupId?: string): Promise<EquipmentPackage> {
    setLoading(true)
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, source_group_id: sourceGroupId }),
      })
      return await parseErrorOr<EquipmentPackage>(res, '建立組合失敗')
    } finally {
      setLoading(false)
    }
  }

  // ── 改名 ───────────────────────────────────────────────────
  async function rename(id: string, name: string): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return parseErrorOr<EquipmentPackage>(res, '改名失敗')
  }

  // ── 刪除單一組合 ────────────────────────────────────────────
  async function remove(id: string): Promise<void> {
    const res = await fetch(`/api/packages/${id}`, { method: 'DELETE' })
    await parseErrorOr<void>(res, '刪除失敗')
  }

  // ── 加入單一料卡 ────────────────────────────────────────────
  async function addItem(packageId: string, equipmentId: string): Promise<void> {
    const res = await fetch(`/api/packages/${packageId}/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ equipment_id: equipmentId }),
    })
    await parseErrorOr<PackageItemRecord>(res, '加入料卡失敗')
  }

  // ── 移除單一料卡 ────────────────────────────────────────────
  async function removeItem(packageId: string, equipmentId: string): Promise<void> {
    const res = await fetch(`/api/packages/${packageId}/items/${equipmentId}`, { method: 'DELETE' })
    await parseErrorOr<void>(res, '移除料卡失敗')
  }

  // ── 更新單一料卡數量 ──────────────────────────────────────────
  async function updateItemQuantity(packageId: string, equipmentId: string, quantity: number): Promise<PackageItemRecord> {
    const res = await fetch(`/api/packages/${packageId}/items/${equipmentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ quantity }),
    })
    return parseErrorOr<PackageItemRecord>(res, '更新數量失敗')
  }

  // ── 批次加/移料號掛載，回傳更新後的完整組合 ─────────────────
  async function batchItems(packageId: string, opts: { add?: string[]; remove?: string[] }): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${packageId}/items/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
    return parseErrorOr<EquipmentPackage>(res, '批次更新料號失敗')
  }

  // ── 複製組合（A -> B） ──────────────────────────────────────
  async function duplicate(packageId: string, name: string): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${packageId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return parseErrorOr<EquipmentPackage>(res, '複製組合失敗')
  }

  // ── 從來源組合重新對齊 ──────────────────────────────────────
  async function align(packageId: string): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${packageId}/align`, { method: 'POST' })
    return parseErrorOr<EquipmentPackage>(res, '重新對齊失敗')
  }

  // ── 批次設定分享部門（全量覆蓋） ────────────────────────────
  async function batchShare(packageIds: string[], departmentIds: string[]): Promise<BatchShareResult> {
    const res = await fetch('/api/packages/batch/share', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_ids: packageIds, department_ids: departmentIds }),
    })
    return parseErrorOr<BatchShareResult>(res, '批次分享設定失敗')
  }

  // ── 批次刪除組合 ────────────────────────────────────────────
  async function batchDelete(packageIds: string[]): Promise<BatchDeleteResult> {
    const res = await fetch('/api/packages/batch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_ids: packageIds }),
    })
    return parseErrorOr<BatchDeleteResult>(res, '批次刪除失敗')
  }

  // ── 組合內料卡拖曳排序 ──────────────────────────────────────
  async function reorderItems(packageId: string, orders: { equipment_id: string; sort_order: number }[]): Promise<void> {
    const res = await fetch(`/api/packages/${packageId}/items/reorder`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    })
    await parseErrorOr<void>(res, '排序更新失敗')
  }

  // ── 組合本身拖曳排序 ────────────────────────────────────────
  async function reorderPackages(orders: { id: string; sort_order: number }[]): Promise<void> {
    const res = await fetch('/api/packages/reorder', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orders }),
    })
    await parseErrorOr<void>(res, '排序更新失敗')
  }

  // ── 跨套餐批次替換料卡（Step 37，比照 /api/groups/replace） ──────
  // reviewer 註記：API 端已改成批次一次處理全部套餐（insert/delete/update 各一個
  // SQL 陳述式），任何一步失敗直接回錯誤狀態碼，不會有「部分套餐成功、部分失敗」
  // 卻仍回 success: true 的情況，呼叫端維持單純的 throw-on-error 語意即可
  async function replaceItem(oldEquipmentId: string, newEquipmentId: string, packageIds: string[]): Promise<void> {
    const res = await fetch('/api/packages/replace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ old_equipment_id: oldEquipmentId, new_equipment_id: newEquipmentId, package_ids: packageIds }),
    })
    await parseErrorOr<void>(res, '替換料卡失敗')
  }

  return {
    list, listShared, create, rename, remove,
    addItem, removeItem, updateItemQuantity, batchItems, duplicate, align,
    batchShare, batchDelete, reorderItems, reorderPackages, replaceItem, loading,
  }
}
