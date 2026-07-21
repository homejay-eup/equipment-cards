import { useState } from 'react'

// Step 34：設備套餐（部門共享群組）。封裝 /api/packages/* 呼叫，
// 風格比照 useDocumentUpload：失敗時 throw Error（訊息取自 API 回應的 error 欄位），
// 由呼叫端 try/catch 處理，不在 hook 內部吞掉錯誤。

export interface PackageItemRecord {
  equipment_id: string
  added_at: string
}

export interface PackageSharedDepartment {
  department_id: string
}

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

  // ── 本部門套餐清單 ──────────────────────────────────────────
  async function list(): Promise<EquipmentPackage[]> {
    const res = await fetch('/api/packages')
    return parseErrorOr<EquipmentPackage[]>(res, '查詢套餐失敗')
  }

  // ── 其他部門分享給我的套餐 ──────────────────────────────────
  async function listShared(): Promise<SharedEquipmentPackage[]> {
    const res = await fetch('/api/packages/shared')
    return parseErrorOr<SharedEquipmentPackage[]>(res, '查詢分享套餐失敗')
  }

  // ── 建立套餐（可帶 source_group_id 做「複製為套餐」） ──────────
  async function create(name: string, sourceGroupId?: string): Promise<EquipmentPackage> {
    setLoading(true)
    try {
      const res = await fetch('/api/packages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, source_group_id: sourceGroupId }),
      })
      return await parseErrorOr<EquipmentPackage>(res, '建立套餐失敗')
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

  // ── 刪除單一套餐 ────────────────────────────────────────────
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

  // ── 批次加/移料號掛載，回傳更新後的完整套餐 ─────────────────
  async function batchItems(packageId: string, opts: { add?: string[]; remove?: string[] }): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${packageId}/items/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(opts),
    })
    return parseErrorOr<EquipmentPackage>(res, '批次更新料號失敗')
  }

  // ── 複製套餐（A -> B） ──────────────────────────────────────
  async function duplicate(packageId: string, name: string): Promise<EquipmentPackage> {
    const res = await fetch(`/api/packages/${packageId}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    return parseErrorOr<EquipmentPackage>(res, '複製套餐失敗')
  }

  // ── 從來源群組重新對齊 ──────────────────────────────────────
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

  // ── 批次刪除套餐 ────────────────────────────────────────────
  async function batchDelete(packageIds: string[]): Promise<BatchDeleteResult> {
    const res = await fetch('/api/packages/batch', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ package_ids: packageIds }),
    })
    return parseErrorOr<BatchDeleteResult>(res, '批次刪除失敗')
  }

  return {
    list, listShared, create, rename, remove,
    addItem, removeItem, batchItems, duplicate, align,
    batchShare, batchDelete, loading,
  }
}
