import { useState } from 'react'

export interface DocumentRecord {
  id: string
  name: string
  type: string
  url: string
  drive_file_id: string
  uploaded_by?: string | null
  created_at?: string
  updated_at?: string
}

export interface DocumentSearchResult {
  id: string
  name: string
  type: string
  url: string
  drive_file_id: string
  created_at: string
  updated_at: string
  equipment_ids: string[]
}

export interface DocumentUploadResult {
  document: DocumentRecord
  linked_equipment_ids: string[]
}

export interface DocumentUnlinkResult {
  ok: true
  document_deleted: boolean
}

// 封裝 /api/documents/* 呼叫，風格比照 usePhotoUpload：
// 失敗時 throw Error（訊息取自 API 回應的 error 欄位），由呼叫端 try/catch 處理，
// 不在 hook 內部吞掉錯誤，避免 React state 更新時序造成呼叫端讀到舊的 error 值。
export function useDocumentUpload() {
  const [uploading, setUploading] = useState(false)

  // ── 上傳新文件（可一次綁定多個料號） ─────────────────────────
  async function upload(
    file: File,
    type: string,
    equipmentIds: string[],
    name?: string,
  ): Promise<DocumentUploadResult> {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('type', type)
      if (name) formData.append('name', name)
      formData.append('equipment_ids', JSON.stringify(equipmentIds))

      const res = await fetch('/api/documents/upload', { method: 'POST', body: formData })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? '文件上傳失敗')
      return data as DocumentUploadResult
    } finally {
      setUploading(false)
    }
  }

  // ── 依名稱模糊查詢既有文件（挑選既有文件用） ────────────────────
  async function search(name: string): Promise<DocumentSearchResult[]> {
    const res = await fetch(`/api/documents/search?name=${encodeURIComponent(name)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '查詢失敗')
    return (data.documents ?? []) as DocumentSearchResult[]
  }

  // ── 依 equipment_id 直接反查該卡片實際掛載的所有文件（解析快取用） ─
  // 走 card_documents 表直接查，不用猜名稱，避免同名文件造成 id 對錯的風險
  async function listByEquipment(equipmentId: string): Promise<DocumentSearchResult[]> {
    const res = await fetch(`/api/documents?equipment_id=${encodeURIComponent(equipmentId)}`)
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '查詢失敗')
    return (data.documents ?? []) as DocumentSearchResult[]
  }

  // ── 把既有文件掛到另一個料號 ─────────────────────────────────
  async function link(documentId: string, equipmentId: string): Promise<void> {
    const res = await fetch(`/api/documents/${documentId}/link`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ equipment_id: equipmentId }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      throw new Error(data.error ?? '掛載失敗')
    }
  }

  // ── 解除本卡片與文件的關聯（若為最後一個關聯，文件本體會一併刪除） ─
  async function unlink(documentId: string, equipmentId: string): Promise<DocumentUnlinkResult> {
    const res = await fetch(
      `/api/documents/${documentId}/link?equipment_id=${encodeURIComponent(equipmentId)}`,
      { method: 'DELETE' },
    )
    const data = await res.json()
    if (!res.ok) throw new Error(data.error ?? '解除掛載失敗')
    return data as DocumentUnlinkResult
  }

  // ── 更新文件版本（同一 drive_file_id 覆蓋內容，url 不變） ──────
  async function updateVersion(documentId: string, file: File): Promise<void> {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/documents/${documentId}`, { method: 'PATCH', body: formData })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? '更新版本失敗')
      }
    } finally {
      setUploading(false)
    }
  }

  return { upload, search, listByEquipment, link, unlink, updateVersion, uploading }
}
