'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { X, Upload, Trash2, Plus, Loader2, AlertCircle, AlertTriangle, CheckSquare, Square, ChevronDown, FileText, Search, RefreshCw } from 'lucide-react'
import { EquipmentCard, DetailPhoto, AppSettings, Document as EquipmentDocument } from '@/types/equipment'
import SettingsPopover from '@/components/SettingsPopover'
import ConfirmDialog from '@/components/ConfirmDialog'
import { useDocumentUpload, DocumentSearchResult } from '@/hooks/useDocumentUpload'

interface Props {
  mode: 'create' | 'edit'
  card?: EquipmentCard
  open: boolean
  onClose: () => void
  settings: AppSettings
  permissions?: string[]
}

interface FormState {
  equipment_id: string
  name: string
  category: string
  vendor: string
  status: string
  tags: string
  notes: string
  net_weight: string
}

interface PendingDetail {
  file: File
  preview: string
}

// documents 現在的角色是「純顯示快取」，id/drive_file_id/equipment_ids 是掛載後才有的
// 管理用資訊：card.documents（equipment_cards.documents 唯讀快取）不含這些欄位，
// 編輯模式開啟時另外用 /api/documents/search 依名稱解析回補
interface ManagedDocument extends EquipmentDocument {
  id?: string
  drive_file_id?: string
  equipment_ids?: string[]
}

// 新增模式：卡片尚未建立，equipment_id 還不存在，文件上傳/掛載都要暫存到卡片建立成功後才能呼叫
interface PendingDocUpload {
  localId: string
  file: File
  type: string
  name: string
}

interface PendingDocLink {
  localId: string
  documentId: string
  name: string
  type: string
  url: string
  drive_file_id: string
  equipment_ids: string[]
}

// 「先刪除舊的再上傳」：整份舊文件要從其他掛載的料卡也一併解除關聯（不只當前卡片）。
// 記錄 documentId -> 要額外呼叫 unlink 的其他 equipment_id 清單，儲存時才真正呼叫 API
interface PendingFullRemoveDoc {
  documentId: string
  otherEquipmentIds: string[]
}

// 上傳新文件時偵測到精確同名既有文件，暫停詢問使用者要「取代（更新版本）」還是「先刪除舊的再上傳」。
// resolve() 讓多選批次上傳的處理佇列，在使用者做完選擇後才繼續處理下一個檔案
interface DuplicateDocPromptState {
  file: File
  type: string
  displayName: string
  match: DocumentSearchResult
  resolve: () => void
}

// 「先刪除舊的再上傳」且舊文件還掛載在其他料卡時，二次確認要不要一併移除
interface DeleteReuploadConfirmState {
  file: File
  type: string
  displayName: string
  match: DocumentSearchResult
  affectedCards: { equipment_id: string; name: string }[] | null
  otherIds: string[]
  resolve: () => void
}

// 本次多選清單內查重：新選的檔案跟 pending 清單裡尚未送出的項目同名
interface PendingDocDuplicatePromptState {
  file: File
  displayName: string
  pendingLocalId: string
  resolve: () => void
}

// 自訂下拉元件（供分類、狀態共用）
function FieldSelect({
  value, options, placeholder = '— 未選 —', onChange, disabled,
}: {
  value: string
  options: string[]
  placeholder?: string
  onChange: (v: string) => void
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(v => !v)}
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 px-3 py-2 border rounded-lg text-sm bg-[#faf6f0] text-[#2c1e12] transition-all focus:outline-none disabled:opacity-50 ${
          open
            ? 'border-[#c49a72] shadow-[0_0_8px_rgba(122,82,48,.25)]'
            : 'border-[#e8ddd0] hover:border-[rgba(122,82,48,.35)]'
        }`}
      >
        <span className={value ? 'text-[#2c1e12]' : 'text-[#a08060]'}>
          {value || placeholder}
        </span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#a08060] transition-transform duration-150 flex-shrink-0 ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 right-0 bg-[#fff9f4] border border-[rgba(122,82,48,.2)] rounded-lg shadow-md overflow-hidden z-50 max-h-52 overflow-y-auto">
          {placeholder && (
            <button type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                !value ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]' : 'text-[#a08060] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
              }`}>
              {placeholder}
            </button>
          )}
          {options.map(o => (
            <button key={o} type="button"
              onClick={() => { onChange(o); setOpen(false) }}
              className={`w-full text-left px-3.5 py-2 text-sm transition-colors ${
                value === o
                  ? 'bg-[rgba(122,82,48,.08)] text-[#7a5230] font-semibold border-l-[3px] border-[#7a5230] pl-[11px]'
                  : 'text-[#6b4f38] hover:bg-[rgba(122,82,48,.06)] hover:text-[#7a5230]'
              }`}>
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// 共用 input class
const inputCls = 'w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] placeholder:text-[#a08060] bg-[#faf6f0] focus:outline-none focus:ring-2 focus:ring-[#c49a72] focus:border-[#c49a72] transition-all'

export default function CardFormDialog({ mode, card, open, onClose, settings, permissions = [] }: Props) {
  const router = useRouter()
  const isEditMode = mode === 'edit'
  const canEdit = (key: string) => !isEditMode || permissions.includes(key)
  const mainFileRef   = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)
  const weightFileRef = useRef<HTMLInputElement>(null)

  const defaultStatus = settings.statuses[0] ?? '現役'

  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)

  const [form, setForm] = useState<FormState>({
    equipment_id: card?.equipment_id ?? '',
    name:         card?.name ?? '',
    category:     card?.category ?? '',
    vendor:       card?.vendor ?? '',
    status:       card?.status ?? defaultStatus,
    tags:         card?.tags.join(', ') ?? '',
    notes:        card?.notes ?? '',
    net_weight:   card?.net_weight?.toString() ?? '',
  })

  const [isNew, setIsNew] = useState<boolean>(card?.is_new ?? true)

  const [mainPhoto, setMainPhoto]               = useState<string | null>(card?.main_photo ?? null)
  const [mainPhotoId, setMainPhotoId]           = useState<string | null>(card?.main_photo_public_id ?? null)
  const [detailPhotos, setDetailPhotos]         = useState<DetailPhoto[]>(card?.detail_photos ?? [])
  const [mainPhotoFile, setMainPhotoFile]       = useState<File | null>(null)
  const [mainPhotoPreview, setMainPhotoPreview] = useState<string | null>(null)
  const [pendingDetails, setPendingDetails]     = useState<PendingDetail[]>([])
  const [detailCaptions, setDetailCaptions]     = useState<Record<string, string>>(() => {
    const m: Record<string, string> = {}
    card?.detail_photos.forEach(p => { if (p.caption) m[p.public_id] = p.caption })
    return m
  })
  const [deleteMainPending, setDeleteMainPending]   = useState(false)
  const [deleteDetailIds, setDeleteDetailIds]       = useState<Set<string>>(new Set())

  const [existingWeightPhotos, setExistingWeightPhotos]           = useState<DetailPhoto[]>(card?.weight_photos ?? [])
  const [pendingWeightPhotos, setPendingWeightPhotos]             = useState<PendingDetail[]>([])
  const [deleteWeightPhotoIds, setDeleteWeightPhotoIds]           = useState<Set<string>>(new Set())
  const [selectWeightMode, setSelectWeightMode]                   = useState(false)
  const [selectedWeightIds, setSelectedWeightIds]                 = useState<Set<string>>(new Set())
  const [selectedPendingWeightIdxs, setSelectedPendingWeightIdxs] = useState<Set<number>>(new Set())

  const docApi = useDocumentUpload()
  const docFileRef       = useRef<HTMLInputElement>(null)
  const docUpdateFileRef = useRef<HTMLInputElement>(null)

  const [documents, setDocuments]           = useState<ManagedDocument[]>(card?.documents ?? [])
  const [docsResolving, setDocsResolving]   = useState(false)
  const [docsBusy, setDocsBusy]             = useState(false)
  const [docActionError, setDocActionError] = useState<string | null>(null)
  const [pendingDocUploads, setPendingDocUploads] = useState<PendingDocUpload[]>([])
  // pendingDocUploads 的同步鏡像：多選上傳逐檔處理時，同一次選取內連續兩個檔案之間
  // 沒有機會等 React state 提交/重新渲染，用 state 讀「目前 pending 清單」會讀到還沒
  // 加入前一個檔案的舊值。這個 ref 在每次 setPendingDocUploads 的當下同步更新，
  // 讓本批次內查重可以讀到最新結果。
  const pendingDocUploadsRef = useRef<PendingDocUpload[]>([])
  const [pendingDocLinks, setPendingDocLinks]     = useState<PendingDocLink[]>([])
  const [docUploadType, setDocUploadType]   = useState<string>(settings.documentTypes[0] ?? '規格書')
  const [showDocSearch, setShowDocSearch]   = useState(false)
  const [docSearchQuery, setDocSearchQuery] = useState('')
  const [docSearchResults, setDocSearchResults] = useState<DocumentSearchResult[]>([])
  const [docSearching, setDocSearching]     = useState(false)
  const [docUpdateTargetId, setDocUpdateTargetId] = useState<string | null>(null)
  const [confirmRemoveDoc, setConfirmRemoveDoc]   = useState<ManagedDocument | null>(null)
  // 編輯模式：文件動作全面改為「暫存到按儲存才生效」，跟 pendingDetails/deleteDetailIds 同一套模式
  const [pendingRemoveDocIds, setPendingRemoveDocIds]     = useState<Set<string>>(new Set())
  const [pendingVersionUpdates, setPendingVersionUpdates] = useState<Map<string, File>>(new Map())
  // 「先刪除舊的再上傳」：要從其他料卡一併解除關聯的待處理清單
  const [pendingFullRemoveDocs, setPendingFullRemoveDocs] = useState<PendingFullRemoveDoc[]>([])
  // 上傳新文件時偵測到精確同名既有文件，暫停詢問使用者要「取代（更新版本）」還是「先刪除舊的再上傳」
  const [duplicateDocPrompt, setDuplicateDocPrompt] = useState<DuplicateDocPromptState | null>(null)
  // 「先刪除舊的再上傳」且舊文件還掛載在其他料卡時，二次確認要不要一併移除
  const [deleteReuploadConfirm, setDeleteReuploadConfirm] = useState<DeleteReuploadConfirmState | null>(null)
  // 本次多選清單內查重：跟 pending 清單裡尚未送出的項目同名時，二選一（取代該 pending 項目的
  // 檔案內容／取消這次選取），不用資料庫版「先刪除再上傳」那套（都還沒真的上傳，無需確認掛載料卡）
  const [pendingDocDuplicatePrompt, setPendingDocDuplicatePrompt] = useState<PendingDocDuplicatePromptState | null>(null)
  // 儲存成功但 Google Drive 檔案清除失敗時的警示（跟一般 error 視覺區分，不是紅色錯誤）
  const [driveWarning, setDriveWarning] = useState<string | null>(null)

  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [photoError, setPhotoError]   = useState<string | null>(null)
  const [selectMode, setSelectMode]               = useState(false)
  const [selectedDetailIds, setSelectedDetailIds] = useState<Set<string>>(new Set())
  const [selectedPendingIdxs, setSelectedPendingIdxs] = useState<Set<number>>(new Set())

  useEffect(() => {
    setLocalSettings(settings)
    setForm({
      equipment_id: card?.equipment_id ?? '',
      name:         card?.name ?? '',
      category:     card?.category ?? '',
      vendor:       card?.vendor ?? '',
      status:       card?.status ?? defaultStatus,
      tags:         card?.tags.join(', ') ?? '',
      notes:        card?.notes ?? '',
      net_weight:   card?.net_weight?.toString() ?? '',
    })
    setIsNew(card?.is_new ?? true)
    setMainPhoto(card?.main_photo ?? null)
    setMainPhotoId(card?.main_photo_public_id ?? null)
    setDetailPhotos(card?.detail_photos ?? [])
    setMainPhotoFile(null)
    setMainPhotoPreview(null)
    setPendingDetails([])
    setDeleteMainPending(false)
    setDeleteDetailIds(new Set())
    setExistingWeightPhotos(card?.weight_photos ?? [])
    setPendingWeightPhotos([])
    setDeleteWeightPhotoIds(new Set())
    setSelectWeightMode(false)
    setSelectedWeightIds(new Set())
    setSelectedPendingWeightIdxs(new Set())
    setError(null)
    setPhotoError(null)
    setSelectMode(false)
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
    const captionInit: Record<string, string> = {}
    card?.detail_photos.forEach(p => { if (p.caption) captionInit[p.public_id] = p.caption })
    setDetailCaptions(captionInit)
    setDocuments(card?.documents ?? [])
    setDocsResolving(false)
    setDocsBusy(false)
    setDocActionError(null)
    setPendingDocUploads([])
    pendingDocUploadsRef.current = []
    setPendingDocLinks([])
    setDocUploadType(settings.documentTypes[0] ?? '規格書')
    setShowDocSearch(false)
    setDocSearchQuery('')
    setDocSearchResults([])
    setDocSearching(false)
    setDocUpdateTargetId(null)
    setConfirmRemoveDoc(null)
    setPendingRemoveDocIds(new Set())
    setPendingVersionUpdates(new Map())
    setPendingFullRemoveDocs([])
    setDuplicateDocPrompt(null)
    setDeleteReuploadConfirm(null)
    setPendingDocDuplicatePrompt(null)
    setDriveWarning(null)
  }, [card, open]) // eslint-disable-line react-hooks/exhaustive-deps

  // 編輯模式開啟時，直接反查 card_documents 表拿到這張卡片實際掛載的文件
  // （含 id/drive_file_id/equipment_ids），才能做「移除」「更新版本」「顯示也用於幾個品號」。
  // 改用 GET /api/documents?equipment_id= 直接查，取代原本「用名稱反查 /api/documents/search」
  // 的作法——若舊資料曾有同名文件，用名稱比對會把不同文件的 id 混在一起，直接查 equipment_id 沒有這個風險
  useEffect(() => {
    if (!open || mode !== 'edit' || !card) return
    if (!canEdit('edit_card_documents')) return

    let cancelled = false
    setDocsResolving(true)
    ;(async () => {
      try {
        const results = await docApi.listByEquipment(card.equipment_id)
        if (cancelled) return
        setDocuments(results.map(r => ({
          id: r.id,
          name: r.name,
          type: r.type,
          url: r.url,
          drive_file_id: r.drive_file_id,
          equipment_ids: r.equipment_ids,
        })))
      } catch {
        // 查詢失敗：保留 card.documents 唯讀快取的顯示，動作按鈕因缺少 id 會維持停用
      } finally {
        if (!cancelled) setDocsResolving(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, card])

  if (!open) return null

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function parseTags(raw: string): string[] {
    return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  }

  function handleClose() {
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    pendingDetails.forEach(p => URL.revokeObjectURL(p.preview))
    pendingWeightPhotos.forEach(p => URL.revokeObjectURL(p.preview))
    onClose()
  }

  async function uploadPhoto(file: File, equipmentId: string, type: string) {
    const sigRes = await fetch('/api/upload', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ equipment_id: equipmentId, type }),
    })
    if (!sigRes.ok) throw new Error('無法取得上傳簽名')
    const { signature, timestamp, public_id, folder, api_key, cloud_name } = await sigRes.json()

    const formData = new FormData()
    formData.append('file',      file)
    formData.append('api_key',   api_key)
    formData.append('timestamp', String(timestamp))
    formData.append('signature', signature)
    formData.append('public_id', public_id)
    formData.append('folder',    folder)

    const cdnRes = await fetch(
      `https://api.cloudinary.com/v1_1/${cloud_name}/image/upload`,
      { method: 'POST', body: formData },
    )
    if (!cdnRes.ok) throw new Error('Cloudinary 上傳失敗')
    const { secure_url } = await cdnRes.json()

    const patchRes = await fetch('/api/upload', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ equipment_id: equipmentId, type, public_id, url: secure_url }),
    })
    if (!patchRes.ok) throw new Error('無法儲存照片紀錄')

    return { public_id, url: secure_url }
  }

  async function handleCreate() {
    if (!form.equipment_id.trim() || !form.name.trim()) {
      setError('料號和品名為必填')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/cards', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          tags: parseTags(form.tags),
          is_new: isNew,
          net_weight: form.net_weight !== '' ? parseFloat(form.net_weight) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '建立失敗'); return }

      const equipId = form.equipment_id.trim()

      if (mainPhotoFile) {
        setUploading(true)
        try { await uploadPhoto(mainPhotoFile, equipId, 'main') }
        catch (e) { setError(`料卡已建立，但主照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) { setError(`料卡已建立，但細節照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingWeightPhotos.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingWeightPhotos.length; i++) {
            await uploadPhoto(pendingWeightPhotos[i].file, equipId, `weight_${base}_${i}`)
          }
        } catch (e) { setError(`料卡已建立，但淨重照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      // 「先刪除舊的再上傳」：先解除舊文件跟其他料卡的關聯（新卡片本身還沒有這份舊文件的關聯，
      // 不需要對 equipId 呼叫 unlink）
      let driveDeletePendingCount = 0
      if (pendingFullRemoveDocs.length > 0) {
        setUploading(true)
        try {
          for (const { documentId, otherEquipmentIds } of pendingFullRemoveDocs) {
            for (const otherId of otherEquipmentIds) {
              const result = await docApi.unlink(documentId, otherId)
              if (result.drive_delete_pending) driveDeletePendingCount++
            }
          }
        } catch (e) { setError(`料卡已建立，但文件移除失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingDocUploads.length > 0 || pendingDocLinks.length > 0) {
        setUploading(true)
        try {
          for (const p of pendingDocUploads) {
            await docApi.upload(p.file, p.type, [equipId], p.name.trim() || undefined)
          }
          for (const p of pendingDocLinks) {
            await docApi.link(p.documentId, equipId)
          }
        } catch (e) { setError(`料卡已建立，但文件處理失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (driveDeletePendingCount > 0) {
        setDriveWarning(`已建立，但其中 ${driveDeletePendingCount} 份文件的關聯已解除、Google Drive 檔案清除失敗，文件記錄暫時保留，請聯絡管理員人工確認`)
        router.refresh()
        return
      }

      router.refresh()
      onClose()
    } catch {
      setError('建立失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdate() {
    if (!form.name.trim()) { setError('品名為必填'); return }
    if (!form.equipment_id.trim()) { setError('料號為必填'); return }
    setSaving(true)
    setError(null)
    try {
      // Compute what changed for the audit trail
      const changedFields: string[] = []
      const orig = card!
      const newTags = parseTags(form.tags)
      const newNetWeight = form.net_weight !== '' ? parseFloat(form.net_weight) : null
      if (form.equipment_id.trim() !== orig.equipment_id) changedFields.push('料號')
      if (form.name.trim() !== orig.name) changedFields.push('品名')
      if ((form.category || null) !== orig.category) changedFields.push('分類')
      if ((form.vendor?.trim() || null) !== orig.vendor) changedFields.push('廠商')
      if (form.status !== orig.status) changedFields.push('狀態')
      if (JSON.stringify([...newTags].sort()) !== JSON.stringify([...orig.tags].sort())) changedFields.push('標籤')
      if ((form.notes?.trim() || null) !== orig.notes) changedFields.push('備註')
      // 文件已改為透過 /api/documents/* 即時生效（不再等按「儲存」），此處不再需要比對變更
      if (newNetWeight !== orig.net_weight) changedFields.push('淨重')
      if (isNew !== !!orig.is_new) changedFields.push('新品標記')
      if (deleteMainPending || mainPhotoFile) changedFields.push('主圖')
      if (deleteDetailIds.size > 0 || pendingDetails.length > 0) changedFields.push('細節照片')
      if (deleteWeightPhotoIds.size > 0 || pendingWeightPhotos.length > 0) changedFields.push('淨重照片')

      const res = await fetch(`/api/cards/${card!.equipment_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form, tags: parseTags(form.tags), is_new: isNew,
          detail_photo_captions: detailCaptions,
          net_weight: form.net_weight !== '' ? parseFloat(form.net_weight) : null,
          updated_fields: changedFields,
        }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '更新失敗'); return }

      const equipId = form.equipment_id.trim()

      if (deleteMainPending && mainPhotoId && !mainPhotoFile) {
        setUploading(true)
        try { await fetch(`/api/upload/${encodeURIComponent(mainPhotoId)}?equipment_id=${equipId}&type=main`, { method: 'DELETE' }) }
        catch { /* non-fatal */ } finally { setUploading(false) }
      }

      if (mainPhotoFile) {
        setUploading(true)
        try { await uploadPhoto(mainPhotoFile, equipId, 'main') }
        catch (e) { setError(`主照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (deleteDetailIds.size > 0) {
        setUploading(true)
        try {
          for (const publicId of Array.from(deleteDetailIds)) {
            await fetch(`/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=detail`, { method: 'DELETE' })
          }
        } catch { /* non-fatal */ } finally { setUploading(false) }
      }

      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) { setError(`細節照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      // 刪除已標記的淨重照片
      if (deleteWeightPhotoIds.size > 0) {
        setUploading(true)
        try {
          for (const publicId of Array.from(deleteWeightPhotoIds)) {
            await fetch(`/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=weight`, { method: 'DELETE' })
          }
        } catch { /* non-fatal */ } finally { setUploading(false) }
      }

      // 上傳新淨重照片
      if (pendingWeightPhotos.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingWeightPhotos.length; i++) {
            await uploadPhoto(pendingWeightPhotos[i].file, equipId, `weight_${base}_${i}`)
          }
        } catch (e) { setError(`淨重照片上傳失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      // 文件：移除、更新版本、上傳新文件、掛載既有文件，全部暫存到現在（PATCH 成功後）才依序真正呼叫 API
      let driveDeletePendingCount = 0

      if (pendingRemoveDocIds.size > 0) {
        setUploading(true)
        try {
          for (const docId of Array.from(pendingRemoveDocIds)) {
            const result = await docApi.unlink(docId, equipId)
            if (result.drive_delete_pending) driveDeletePendingCount++
          }
        } catch (e) { setError(`文件移除失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      // 「先刪除舊的再上傳」：舊文件也掛載在其他料卡時，一併解除那些料卡的關聯
      // （當前卡片若也掛載了這份舊文件，已包含在上面的 pendingRemoveDocIds 處理中）
      if (pendingFullRemoveDocs.length > 0) {
        setUploading(true)
        try {
          for (const { documentId, otherEquipmentIds } of pendingFullRemoveDocs) {
            for (const otherId of otherEquipmentIds) {
              const result = await docApi.unlink(documentId, otherId)
              if (result.drive_delete_pending) driveDeletePendingCount++
            }
          }
        } catch (e) { setError(`文件移除失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingVersionUpdates.size > 0) {
        setUploading(true)
        try {
          for (const [docId, file] of Array.from(pendingVersionUpdates.entries())) {
            await docApi.updateVersion(docId, file)
          }
        } catch (e) { setError(`文件版本更新失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (pendingDocUploads.length > 0 || pendingDocLinks.length > 0) {
        setUploading(true)
        try {
          for (const p of pendingDocUploads) {
            await docApi.upload(p.file, p.type, [equipId], p.name.trim() || undefined)
          }
          for (const p of pendingDocLinks) {
            await docApi.link(p.documentId, equipId)
          }
        } catch (e) { setError(`文件處理失敗：${e instanceof Error ? e.message : ''}`); router.refresh(); return }
        finally { setUploading(false) }
      }

      if (driveDeletePendingCount > 0) {
        setDriveWarning(`已儲存，但其中 ${driveDeletePendingCount} 份文件的關聯已解除、Google Drive 檔案清除失敗，文件記錄暫時保留，請聯絡管理員人工確認`)
        router.refresh()
        return
      }

      router.refresh()
      onClose()
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  // ── 文件連結：新增/編輯模式都暫存到按「建立」/「儲存」才真正呼叫 API ──
  function stageDocUpload(file: File, type: string, name: string) {
    setPendingDocUploads(prev => {
      const next = [...prev, { localId: `${Date.now()}_${prev.length}`, file, type, name }]
      pendingDocUploadsRef.current = next
      return next
    })
  }

  // 多選檔案：逐一處理，每個檔案各自做同名偵測；若偵測到同名，暫停等使用者二選一
  // （取代版本／先刪除再上傳）決定完才繼續處理下一個檔案，避免多個提示疊在一起
  async function handleDocFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (files.length === 0) return
    for (const file of files) {
      // eslint-disable-next-line no-await-in-loop
      await processDocFileForUpload(file)
    }
  }

  async function processDocFileForUpload(file: File) {
    const type = docUploadType || localSettings.documentTypes[0] || '規格書'
    const displayName = file.name.replace(/\.[^/.]+$/, '')

    // 本次多選清單內查重：跟 pending 清單裡尚未送出的項目同名時，直接問要不要取代該 pending
    // 項目的檔案內容（都還沒真的上傳到任何地方，不需要走資料庫版「先刪除再上傳」的完整流程）。
    // 讀 ref 而不是 state，因為同一次多選裡前一個檔案可能才剛 stage 進去，state 還沒提交
    const pendingMatch = pendingDocUploadsRef.current.find(
      p => p.name.trim().toLowerCase() === displayName.trim().toLowerCase(),
    )
    if (pendingMatch) {
      await new Promise<void>(resolve => {
        setPendingDocDuplicatePrompt({ file, displayName, pendingLocalId: pendingMatch.localId, resolve })
      })
      return
    }

    // 精確同名（不拘大小寫）既有文件偵測：search 本身是模糊查詢，這裡自己做精確過濾，
    // 避免「S168」這種短字串隨便命中一堆不相關文件就跳提示
    setDocsBusy(true)
    setDocActionError(null)
    let duplicate: DocumentSearchResult | null = null
    try {
      const results = await docApi.search(displayName)
      duplicate = results.find(r => r.name.trim().toLowerCase() === displayName.trim().toLowerCase()) ?? null
    } catch {
      // 查重查詢本身失敗不擋原本上傳流程，當作沒查到
      duplicate = null
    } finally {
      setDocsBusy(false)
    }

    if (!duplicate) {
      stageDocUpload(file, type, displayName)
      return
    }

    // 精確同名：暫停，等使用者在 ConfirmDialog 二選一後才繼續處理下一個檔案
    await new Promise<void>(resolve => {
      setDuplicateDocPrompt({ file, type, displayName, match: duplicate as DocumentSearchResult, resolve })
    })
  }

  // 選項一：取代（更新版本）——新檔案內容排入既有同名文件的版本更新佇列，
  // 若目前這張卡片還沒有掛載那份既有文件，一併排入待掛載
  function handleDuplicateReplace() {
    if (!duplicateDocPrompt) return
    const { file, match, resolve } = duplicateDocPrompt
    setDuplicateDocPrompt(null)
    setPendingVersionUpdates(prev => {
      const n = new Map(prev)
      n.set(match.id, file)
      return n
    })
    const isAlreadyLinkedHere = documents.some(d => d.id === match.id) || pendingDocLinks.some(p => p.documentId === match.id)
    if (!isAlreadyLinkedHere) {
      setPendingDocLinks(prev => [...prev, {
        localId: `${Date.now()}_${prev.length}`,
        documentId: match.id, name: match.name, type: match.type,
        url: match.url, drive_file_id: match.drive_file_id, equipment_ids: match.equipment_ids,
      }])
    }
    resolve()
  }

  // 選項二：先刪除舊的再上傳——舊文件整個報廢。若還掛載在其他料卡，先跳二次確認列出受影響料卡
  async function handleDuplicateDeleteReupload() {
    if (!duplicateDocPrompt) return
    const { file, type, displayName, match, resolve } = duplicateDocPrompt
    setDuplicateDocPrompt(null)

    const currentEquipId = form.equipment_id.trim()
    const otherIds = match.equipment_ids.filter(id => id !== currentEquipId)

    if (otherIds.length === 0) {
      finalizeDeleteReupload(match, file, type, displayName, [])
      resolve()
      return
    }

    // 用窄範圍反查端點取得料卡品名：只需要 edit_card_documents 權限（跟開這個對話框
    // 需要的權限相同），一般編輯者也看得到完整清單。仍保留 try/catch 防呆
    // （網路異常等非權限問題），失敗時退回只顯示受影響張數，不擋流程。
    let affectedCards: { equipment_id: string; name: string }[] | null = null
    try {
      const found = await docApi.getLinkedCards(match.id)
      affectedCards = found.linked_cards.filter(c => c.equipment_id !== currentEquipId)
    } catch {
      affectedCards = null
    }

    setDeleteReuploadConfirm({ file, type, displayName, match, affectedCards, otherIds, resolve })
  }

  // 「先刪除舊的再上傳」的實際暫存：標記舊文件全面移除（含當前卡片、含其他料卡），
  // 再把新選的檔案照「上傳新文件」流程排入（全新獨立文件，只掛載這張卡片）
  function finalizeDeleteReupload(
    match: DocumentSearchResult, file: File, type: string, displayName: string, otherIds: string[],
  ) {
    const currentEquipId = form.equipment_id.trim()
    const isCurrentlyLinkedHere = match.equipment_ids.includes(currentEquipId) && documents.some(d => d.id === match.id)
    if (isCurrentlyLinkedHere) {
      setPendingRemoveDocIds(prev => new Set([...Array.from(prev), match.id]))
    }
    if (otherIds.length > 0) {
      setPendingFullRemoveDocs(prev => [...prev, { documentId: match.id, otherEquipmentIds: otherIds }])
    }
    // 移除意圖優先：這份舊文件即將整個報廢，若剛好也留有待處理的版本更新，一併撤銷，
    // 避免儲存時對已解除關聯（甚至已被刪除）的 documentId 又跑一次 updateVersion
    clearPendingVersionUpdate(match.id)
    stageDocUpload(file, type, displayName)
  }

  // 移除意圖優先於版本更新：標記一份文件要移除時，同步撤銷該文件先前選好的「更新版本」暫存，
  // 避免 handleUpdate 先處理完移除（甚至已把文件本體刪除）之後，又對同一個 documentId 呼叫
  // updateVersion——輕則對已消失的文件 404、重則誤覆蓋了其他料卡仍在共用的同一份文件內容
  function clearPendingVersionUpdate(docId: string) {
    setPendingVersionUpdates(prev => {
      if (!prev.has(docId)) return prev
      const n = new Map(prev)
      n.delete(docId)
      return n
    })
  }

  function updatePendingDocUploadType(localId: string, type: string) {
    setPendingDocUploads(prev => prev.map(p => p.localId === localId ? { ...p, type } : p))
  }

  function handleRemovePendingDocUpload(localId: string) {
    setPendingDocUploads(prev => {
      const next = prev.filter(p => p.localId !== localId)
      pendingDocUploadsRef.current = next
      return next
    })
  }

  // 本次多選清單內查重二選一：取代 pending 項目的檔案內容 / 取消這次選取（不加入新列）
  function handlePendingDocDupReplace() {
    if (!pendingDocDuplicatePrompt) return
    const { file, pendingLocalId, resolve } = pendingDocDuplicatePrompt
    setPendingDocDuplicatePrompt(null)
    setPendingDocUploads(prev => {
      const next = prev.map(p => p.localId === pendingLocalId ? { ...p, file } : p)
      pendingDocUploadsRef.current = next
      return next
    })
    resolve()
  }

  function handlePendingDocDupCancel() {
    if (!pendingDocDuplicatePrompt) return
    const { resolve } = pendingDocDuplicatePrompt
    setPendingDocDuplicatePrompt(null)
    resolve()
  }

  function handleRemovePendingDocLink(localId: string) {
    setPendingDocLinks(prev => prev.filter(p => p.localId !== localId))
  }

  async function handleSearchDocs() {
    const q = docSearchQuery.trim()
    if (!q) { setDocSearchResults([]); return }
    setDocSearching(true)
    setDocActionError(null)
    try {
      const results = await docApi.search(q)
      setDocSearchResults(results)
    } catch (err) {
      setDocActionError(err instanceof Error ? err.message : '查詢失敗')
    } finally {
      setDocSearching(false)
    }
  }

  function handlePickExistingDoc(result: DocumentSearchResult) {
    setPendingDocLinks(prev => [...prev, {
      localId: `${Date.now()}_${prev.length}`,
      documentId: result.id, name: result.name, type: result.type,
      url: result.url, drive_file_id: result.drive_file_id, equipment_ids: result.equipment_ids,
    }])
    setDocSearchResults(prev => prev.filter(d => d.id !== result.id))
  }

  // 移除文件：仍立即跳 ConfirmDialog 讓使用者當下確認意圖，但確認後只標記待移除，
  // 實際呼叫 unlink API 要等 handleUpdate 的 PATCH 成功後才執行
  function doRemoveDoc(doc: ManagedDocument) {
    const docId = doc.id
    if (!docId) return
    setPendingRemoveDocIds(prev => new Set([...Array.from(prev), docId]))
    // 移除意圖優先：若這份文件先前已選好要更新版本，一併撤銷該暫存
    clearPendingVersionUpdate(docId)
    setConfirmRemoveDoc(null)
  }

  function handleRemoveDoc(doc: ManagedDocument) {
    if (!doc.id) return
    setConfirmRemoveDoc(doc)
  }

  function handleUndoRemoveDoc(docId: string) {
    setPendingRemoveDocIds(prev => {
      const n = new Set(prev)
      n.delete(docId)
      return n
    })
  }

  function handleDocUpdateVersionClick(docId: string) {
    setDocUpdateTargetId(docId)
    docUpdateFileRef.current?.click()
  }

  // 更新版本：選檔後暫存，等 handleUpdate 的 PATCH 成功後才真正呼叫 API
  function handleDocUpdateVersionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !docUpdateTargetId) return
    setPendingVersionUpdates(prev => {
      const n = new Map(prev)
      n.set(docUpdateTargetId, file)
      return n
    })
    setDocUpdateTargetId(null)
  }

  function handleMainPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    setMainPhotoFile(file)
    setMainPhotoPreview(URL.createObjectURL(file))
    setDeleteMainPending(false)
  }

  function handleDeleteMain() {
    if (mainPhotoPreview) {
      URL.revokeObjectURL(mainPhotoPreview)
      setMainPhotoFile(null)
      setMainPhotoPreview(null)
    } else {
      setDeleteMainPending(true)
    }
  }

  function handleAddDetail(e: React.ChangeEvent<HTMLInputElement>) {
    const fileArray = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fileArray.length) return
    if (mode === 'create') {
      const equipId = form.equipment_id.trim()
      if (!equipId) { setPhotoError('請先填入料號'); return }
    }
    const newItems: PendingDetail[] = fileArray.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPendingDetails(prev => [...prev, ...newItems])
  }

  function handleDeletePendingDetail(index: number) {
    setPendingDetails(prev => { URL.revokeObjectURL(prev[index].preview); return prev.filter((_, i) => i !== index) })
  }

  function handleDeleteDetail(publicId: string) {
    setDeleteDetailIds(prev => new Set([...Array.from(prev), publicId]))
  }

  function handleAddWeightPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const fileArray = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fileArray.length) return
    if (mode === 'create') {
      const equipId = form.equipment_id.trim()
      if (!equipId) { setPhotoError('請先填入料號'); return }
    }
    const newItems: PendingDetail[] = fileArray.map(f => ({ file: f, preview: URL.createObjectURL(f) }))
    setPendingWeightPhotos(prev => [...prev, ...newItems])
  }

  function handleDeleteExistingWeight(publicId: string) {
    setDeleteWeightPhotoIds(prev => new Set([...Array.from(prev), publicId]))
  }

  function handleDeletePendingWeight(index: number) {
    setPendingWeightPhotos(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function toggleSelectWeight(publicId: string) {
    setSelectedWeightIds(prev => {
      const n = new Set(prev)
      if (n.has(publicId)) n.delete(publicId); else n.add(publicId)
      return n
    })
  }

  function toggleSelectPendingWeight(idx: number) {
    setSelectedPendingWeightIdxs(prev => {
      const n = new Set(prev)
      if (n.has(idx)) n.delete(idx); else n.add(idx)
      return n
    })
  }

  function handleBatchDeleteWeight() {
    selectedWeightIds.forEach(id => handleDeleteExistingWeight(id))
    Array.from(selectedPendingWeightIdxs).sort((a, b) => b - a).forEach(idx => handleDeletePendingWeight(idx))
    setSelectedWeightIds(new Set())
    setSelectedPendingWeightIdxs(new Set())
    setSelectWeightMode(false)
  }

  function toggleSelectDetail(publicId: string) {
    setSelectedDetailIds(prev => { const n = new Set(prev); if (n.has(publicId)) { n.delete(publicId) } else { n.add(publicId) }; return n })
  }

  function toggleSelectPending(idx: number) {
    setSelectedPendingIdxs(prev => { const n = new Set(prev); if (n.has(idx)) { n.delete(idx) } else { n.add(idx) }; return n })
  }

  function handleBatchDelete() {
    selectedDetailIds.forEach(id => handleDeleteDetail(id))
    Array.from(selectedPendingIdxs).sort((a, b) => b - a).forEach(idx => handleDeletePendingDetail(idx))
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
    setSelectMode(false)
  }

  const totalSelected = selectedDetailIds.size + selectedPendingIdxs.size
  const isBusy = saving || uploading || docsBusy
  const currentMainPhoto = mainPhotoPreview ?? (deleteMainPending ? null : mainPhoto)
  const visibleDetails = detailPhotos.filter(p => !deleteDetailIds.has(p.public_id))
  const visibleWeightPhotos = existingWeightPhotos.filter(p => !deleteWeightPhotoIds.has(p.public_id))
  const totalSelectedWeight = selectedWeightIds.size + selectedPendingWeightIdxs.size
  const linkedDocIds = new Set([
    ...documents.map(d => d.id).filter((id): id is string => Boolean(id)),
    ...pendingDocLinks.map(p => p.documentId),
  ])
  const filteredDocSearchResults = docSearchResults.filter(r => !linkedDocIds.has(r.id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-[#fff9f4] rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col border border-[rgba(122,82,48,.18)]"
        style={{ boxShadow: '0 0 30px rgba(122,82,48,.15), 0 20px 60px rgba(0,0,0,.2)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[rgba(122,82,48,.15)]">
          <h2 className="text-lg font-semibold text-[#7a5230]">
            {mode === 'create' ? '新增料卡' : '編輯料卡'}
          </h2>
          <button onClick={handleClose} disabled={isBusy}
            className="text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {error && (
            <div className="text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {driveWarning && (
            <div className="flex items-start gap-2 text-sm text-[#8a5a12] bg-[rgba(196,154,114,.18)] border border-[rgba(196,154,114,.5)] rounded-lg px-3 py-2">
              <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{driveWarning}</span>
            </div>
          )}

          {/* 料號 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              料號 <span className="text-[#b5451b]">*</span>
            </label>
            <input type="text" value={form.equipment_id}
              onChange={e => set('equipment_id', e.target.value)}
              placeholder="例：1000003"
              disabled={!canEdit('edit_card_equipment_id')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 品名 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              品名 <span className="text-[#b5451b]">*</span>
            </label>
            <input type="text" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="例：S168-4G衛星定位器"
              disabled={!canEdit('edit_card_name')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 分類 + 狀態 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38] mb-1">
                分類
                <SettingsPopover
                  settingKey="categories"
                  items={localSettings.categories}
                  onConfirm={cats => setLocalSettings(prev => ({ ...prev, categories: cats }))}
                  disabled={isBusy}
                />
              </label>
              <FieldSelect
                value={form.category}
                options={localSettings.categories}
                placeholder="— 未分類 —"
                onChange={v => set('category', v)}
                disabled={isBusy || !canEdit('edit_card_category')}
              />
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38] mb-1">
                狀態
                <SettingsPopover
                  settingKey="statuses"
                  items={localSettings.statuses}
                  onConfirm={stats => setLocalSettings(prev => ({ ...prev, statuses: stats }))}
                  disabled={isBusy}
                />
              </label>
              <FieldSelect
                value={form.status}
                options={localSettings.statuses}
                onChange={v => set('status', v)}
                disabled={isBusy || !canEdit('edit_card_status')}
              />
            </div>
          </div>

          {/* 廠商 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">廠商</label>
            <input type="text" value={form.vendor}
              onChange={e => set('vendor', e.target.value)} placeholder="例：格瑪"
              disabled={!canEdit('edit_card_vendor')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 標籤 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">
              標籤 <span className="text-[#a08060] font-normal ml-1">（逗號分隔）</span>
            </label>
            <input type="text" value={form.tags}
              onChange={e => set('tags', e.target.value)} placeholder="例：回傳, 純錄, 台製"
              disabled={!canEdit('edit_card_tags')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">備註</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={5} placeholder="補充說明…"
              disabled={!canEdit('edit_card_notes')}
              className={`${inputCls} resize-none disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 淨重（kg） */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-1">淨重（kg）</label>
            <input
              type="text"
              inputMode="decimal"
              value={form.net_weight}
              onChange={e => set('net_weight', e.target.value)}
              placeholder="例：1.25"
              disabled={isBusy || !canEdit('edit_card_weight')}
              className={`${inputCls} disabled:opacity-50 disabled:cursor-not-allowed`}
            />
          </div>

          {/* 文件連結 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="flex items-center gap-1 text-sm font-medium text-[#6b4f38]">
                文件連結
                <SettingsPopover
                  settingKey="documentTypes"
                  items={localSettings.documentTypes}
                  onConfirm={types => setLocalSettings(prev => ({ ...prev, documentTypes: types }))}
                  disabled={isBusy}
                />
              </label>
            </div>

            {canEdit('edit_card_documents') && (
              <div className="flex flex-col gap-2 mb-3 p-2.5 bg-[rgba(122,82,48,.04)] border border-[rgba(122,82,48,.12)] rounded-lg">
                <div className="flex gap-2">
                  <select
                    value={docUploadType}
                    onChange={e => setDocUploadType(e.target.value)}
                    disabled={isBusy}
                    className="border border-[#e8ddd0] rounded-lg px-2 py-1.5 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
                  >
                    {localSettings.documentTypes.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="flex-1 flex items-center text-[10px] text-[#a08060]">
                    顯示名稱固定用檔名（去除副檔名）
                  </span>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => docFileRef.current?.click()} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] transition-all disabled:opacity-40">
                    <Upload className="h-3.5 w-3.5" />
                    上傳新文件（可多選）
                  </button>
                  <button type="button" onClick={() => setShowDocSearch(v => !v)} disabled={isBusy}
                    className="flex-1 flex items-center justify-center gap-1.5 border-2 border-dashed border-[#e8ddd0] rounded-lg px-3 py-2 text-xs text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] transition-all disabled:opacity-40">
                    <Search className="h-3.5 w-3.5" />
                    挑選既有文件
                  </button>
                </div>
                <input ref={docFileRef} type="file" multiple className="hidden" onChange={handleDocFileChosen} />

                {showDocSearch && (
                  <div className="flex flex-col gap-1.5 pt-1">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={docSearchQuery}
                        onChange={e => setDocSearchQuery(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSearchDocs() } }}
                        placeholder="輸入文件名稱關鍵字…"
                        disabled={isBusy}
                        className={`${inputCls} flex-1 text-xs py-1.5 disabled:opacity-50`}
                      />
                      <button type="button" onClick={handleSearchDocs} disabled={isBusy || docSearching}
                        className="px-3 py-1.5 text-xs font-medium text-[#7a5230] border border-[rgba(122,82,48,.3)] rounded-lg hover:bg-[rgba(122,82,48,.06)] disabled:opacity-40 transition-colors">
                        {docSearching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : '搜尋'}
                      </button>
                    </div>
                    {filteredDocSearchResults.length > 0 && (
                      <div className="flex flex-col gap-1 max-h-32 overflow-y-auto">
                        {filteredDocSearchResults.map(r => (
                          <button key={r.id} type="button" onClick={() => handlePickExistingDoc(r)} disabled={isBusy}
                            className="flex items-center justify-between gap-2 text-left px-2.5 py-1.5 text-xs bg-[#fff9f4] border border-[rgba(122,82,48,.15)] rounded-lg hover:border-[#c49a72] disabled:opacity-40 transition-colors">
                            <span className="flex items-center gap-1.5 truncate">
                              <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                              <span className="truncate">{r.name}</span>
                              <span className="text-[#a08060] flex-shrink-0">（{r.type}）</span>
                            </span>
                            <span className="text-[#a08060] flex-shrink-0">用於 {r.equipment_ids.length} 個品號</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {docActionError && (
              <div className="flex items-start gap-2 text-xs text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2 mb-2">
                <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                <span>{docActionError}</span>
              </div>
            )}

            {documents.length === 0 && pendingDocUploads.length === 0 && pendingDocLinks.length === 0 ? (
              <p className="text-xs text-[#b0967a]">尚無文件連結</p>
            ) : (
              <div className="flex flex-col gap-2">
                {documents.map((doc, i) => {
                  const otherCount = (doc.equipment_ids?.length ?? 1) - 1
                  const isPendingRemove = !!doc.id && pendingRemoveDocIds.has(doc.id)
                  const hasPendingVersion = !!doc.id && pendingVersionUpdates.has(doc.id)
                  return (
                    <div key={doc.id ?? `${doc.name}-${i}`}
                      className={`flex items-center justify-between gap-2 p-2.5 border rounded-lg ${
                        isPendingRemove
                          ? 'bg-[rgba(181,69,27,.05)] border-[rgba(181,69,27,.25)]'
                          : 'bg-[rgba(122,82,48,.04)] border-[rgba(122,82,48,.12)]'
                      }`}>
                      <a href={doc.url} target="_blank" rel="noopener noreferrer"
                        className={`flex items-center gap-1.5 text-xs truncate min-w-0 ${
                          isPendingRemove ? 'text-[#a08060] line-through' : 'text-[#4a3422] hover:text-[#7a5230]'
                        }`}>
                        <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                        <span className="truncate">{doc.name}</span>
                        <span className="text-[#a08060] flex-shrink-0">（{doc.type}）</span>
                      </a>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {!isPendingRemove && doc.id && otherCount > 0 && (
                          <span className="text-[10px] text-[#a08060] whitespace-nowrap">也用於 {otherCount} 個品號</span>
                        )}
                        {!isPendingRemove && hasPendingVersion && (
                          <span className="text-[10px] text-[#7a5230] whitespace-nowrap">已選擇新版本待上傳</span>
                        )}
                        {!doc.id && docsResolving && <Loader2 className="h-3.5 w-3.5 animate-spin text-[#a08060]" />}
                        {isPendingRemove ? (
                          <button type="button" onClick={() => handleUndoRemoveDoc(doc.id as string)} disabled={isBusy}
                            className="text-xs font-medium text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors whitespace-nowrap">
                            復原
                          </button>
                        ) : canEdit('edit_card_documents') && doc.id && (
                          <>
                            <button type="button" onClick={() => handleDocUpdateVersionClick(doc.id as string)} disabled={isBusy}
                              title="更新版本"
                              className="text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 transition-colors">
                              <RefreshCw className="h-3.5 w-3.5" />
                            </button>
                            <button type="button" onClick={() => handleRemoveDoc(doc)} disabled={isBusy}
                              title="移除"
                              className="text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}

                {pendingDocUploads.map(p => (
                  <div key={p.localId} className="flex flex-col gap-1.5 p-2.5 bg-[#f2ebe0] border border-[#c49a72] rounded-lg">
                    <div className="flex gap-2">
                      <span className="flex-1 flex items-center gap-1.5 text-xs text-[#4a3422] truncate">
                        <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                        <span className="truncate">{p.file.name}</span>
                      </span>
                      <button type="button" onClick={() => handleRemovePendingDocUpload(p.localId)} disabled={isBusy}
                        className="text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors flex-shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <select value={p.type} onChange={e => updatePendingDocUploadType(p.localId, e.target.value)}
                      disabled={isBusy}
                      className="border border-[#e8ddd0] rounded-lg px-2 py-1 text-xs text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50">
                      {localSettings.documentTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-[10px] text-[#a08060]">{mode === 'create' ? '待建立料卡後上傳' : '待儲存後上傳'}</span>
                  </div>
                ))}

                {pendingDocLinks.map(p => (
                  <div key={p.localId} className="flex items-center justify-between gap-2 p-2.5 bg-[#f2ebe0] border border-[#c49a72] rounded-lg">
                    <span className="flex items-center gap-1.5 text-xs text-[#4a3422] truncate">
                      <FileText className="h-3.5 w-3.5 text-[#a08060] flex-shrink-0" />
                      <span className="truncate">{p.name}</span>
                      <span className="text-[#a08060] flex-shrink-0">（{p.type}）</span>
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {pendingVersionUpdates.has(p.documentId) && (
                        <span className="text-[10px] text-[#7a5230] whitespace-nowrap">已選擇新版本待上傳</span>
                      )}
                      <span className="text-[10px] text-[#a08060] whitespace-nowrap">{mode === 'create' ? '待建立料卡後掛載' : '待儲存後掛載'}</span>
                      <button type="button" onClick={() => handleRemovePendingDocLink(p.localId)} disabled={isBusy}
                        className="text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 transition-colors">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <input ref={docUpdateFileRef} type="file" className="hidden" onChange={handleDocUpdateVersionFile} />
          </div>

          {/* NEW 標記 */}
          <div className="flex items-center justify-between py-1">
            <div>
              <span className="text-sm font-medium text-[#6b4f38]">標記為新品項</span>
              <span className="badge-new-pulse ml-2 text-[10px] font-bold tracking-widest text-white bg-[#b5451b] px-1.5 py-0.5 rounded shadow-sm">
                NEW
              </span>
            </div>
            <button
              type="button"
              onClick={() => setIsNew(v => !v)}
              disabled={isBusy || !canEdit('edit_card_is_new')}
              className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-all focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed ${
                isNew
                  ? 'bg-[#b5451b] shadow-[0_0_8px_rgba(181,69,27,.4)]'
                  : 'bg-[#e8ddd0]'
              }`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                isNew ? 'translate-x-4' : 'translate-x-0.5'
              }`} />
            </button>
          </div>

          {/* 照片錯誤 */}
          {photoError && (
            <div className="flex items-start gap-2 text-sm text-[#b5451b] bg-[rgba(181,69,27,.06)] border border-[rgba(181,69,27,.2)] rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{photoError}</span>
            </div>
          )}

          {/* 主照片 */}
          <div>
            <label className="block text-sm font-medium text-[#6b4f38] mb-2">主照片</label>
            {currentMainPhoto ? (
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-[rgba(122,82,48,.2)] bg-[#e8ddd0] flex-shrink-0">
                  <Image src={currentMainPhoto} alt="主照片" fill className="object-cover" />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy || !canEdit('edit_card_main_photo')}
                    className="text-sm text-[#7a5230] hover:text-[#9c6b42] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    更換照片
                  </button>
                  <button type="button" onClick={handleDeleteMain} disabled={isBusy || !canEdit('edit_card_main_photo')}
                    className="text-sm text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                    刪除照片
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy || !canEdit('edit_card_main_photo')}
                className="flex items-center gap-2 border-2 border-dashed border-[#e8ddd0] rounded-lg px-4 py-3 text-sm text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_8px_rgba(122,82,48,.2)] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
                <Upload className="h-4 w-4" />
                上傳主照片
              </button>
            )}
            <input ref={mainFileRef} type="file" accept="image/*" className="hidden"
              onChange={handleMainPhotoChange} />
          </div>

          {/* 細節照片 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#6b4f38]">細節照片</label>
              {(visibleDetails.length > 0 || pendingDetails.length > 0) && canEdit('edit_card_detail_photos') && (
                <button type="button" onClick={() => {
                  setSelectMode(v => !v)
                  setSelectedDetailIds(new Set())
                  setSelectedPendingIdxs(new Set())
                }} disabled={isBusy}
                  className="text-xs text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
                  {selectMode ? '取消選取' : '選取'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleDetails.map(photo => {
                const isSelected = selectedDetailIds.has(photo.public_id)
                return (
                  <div key={photo.public_id} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        selectMode
                          ? isSelected
                            ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                            : 'border-[#e8ddd0] cursor-pointer'
                          : 'border-[rgba(122,82,48,.15)]'
                      } bg-[#e8ddd0]`}
                      onClick={selectMode ? () => toggleSelectDetail(photo.public_id) : undefined}
                    >
                      <Image src={photo.url} alt="細節照片" fill className="object-cover" />
                      {selectMode ? (
                        <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                            : <Square className="h-5 w-5 text-white drop-shadow" />
                          }
                        </div>
                      ) : canEdit('edit_card_detail_photos') ? (
                        <button type="button" onClick={() => handleDeleteDetail(photo.public_id)}
                          disabled={isBusy}
                          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {!selectMode && (
                      <input
                        type="text"
                        value={detailCaptions[photo.public_id] ?? ''}
                        onChange={e => setDetailCaptions(prev => ({ ...prev, [photo.public_id]: e.target.value }))}
                        placeholder="說明"
                        disabled={isBusy}
                        className="w-20 text-[10px] border border-[#e8ddd0] rounded px-1.5 py-0.5 text-[#4a3422] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] placeholder:text-[#c0a890] disabled:opacity-40"
                      />
                    )}
                  </div>
                )
              })}

              {pendingDetails.map((item, idx) => {
                const isSelected = selectedPendingIdxs.has(idx)
                return (
                  <div key={idx} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div
                      className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                        selectMode
                          ? isSelected
                            ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                            : 'border-[#c49a72] cursor-pointer'
                          : 'border-[#c49a72]'
                      } bg-[#f2ebe0]`}
                      onClick={selectMode ? () => toggleSelectPending(idx) : undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={item.preview} alt="細節照片預覽" className="w-full h-full object-cover" />
                      {selectMode ? (
                        <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                          {isSelected
                            ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                            : <Square className="h-5 w-5 text-white drop-shadow" />
                          }
                        </div>
                      ) : canEdit('edit_card_detail_photos') ? (
                        <button type="button" onClick={() => handleDeletePendingDetail(idx)}
                          disabled={isBusy}
                          className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                    {!selectMode && (
                      <input
                        type="text"
                        placeholder="說明"
                        disabled={isBusy}
                        className="w-20 text-[10px] border border-[#c49a72] rounded px-1.5 py-0.5 text-[#4a3422] bg-[#faf6f0] focus:outline-none focus:border-[#7a5230] placeholder:text-[#c0a890] disabled:opacity-40"
                      />
                    )}
                  </div>
                )
              })}

              {!selectMode && canEdit('edit_card_detail_photos') && (
                <button type="button" onClick={() => detailFileRef.current?.click()} disabled={isBusy}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-[#e8ddd0] flex items-center justify-center text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.2)] transition-all disabled:opacity-40">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {selectMode && (
              <div className="mt-3 flex items-center justify-between bg-[rgba(122,82,48,.05)] border border-[rgba(122,82,48,.18)] rounded-lg px-3 py-2">
                <span className="text-sm text-[#6b4f38]">
                  已選 <span className="font-semibold text-[#7a5230]">{totalSelected}</span> 張
                </span>
                <button type="button" onClick={handleBatchDelete}
                  disabled={isBusy || totalSelected === 0}
                  className="text-sm font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  刪除選取
                </button>
              </div>
            )}

            <input ref={detailFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleAddDetail} />
          </div>

          {/* 淨重照片 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[#6b4f38]">淨重照片</label>
              {(visibleWeightPhotos.length > 0 || pendingWeightPhotos.length > 0) && canEdit('edit_card_weight') && (
                <button type="button" onClick={() => {
                  setSelectWeightMode(v => !v)
                  setSelectedWeightIds(new Set())
                  setSelectedPendingWeightIdxs(new Set())
                }} disabled={isBusy}
                  className="text-xs text-[#a08060] hover:text-[#7a5230] disabled:opacity-40 transition-colors">
                  {selectWeightMode ? '取消選取' : '選取'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {visibleWeightPhotos.map(photo => {
                const isSelected = selectedWeightIds.has(photo.public_id)
                return (
                  <div
                    key={photo.public_id}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selectWeightMode
                        ? isSelected
                          ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                          : 'border-[#e8ddd0] cursor-pointer'
                        : 'border-[rgba(122,82,48,.15)]'
                    } bg-[#e8ddd0]`}
                    onClick={selectWeightMode ? () => toggleSelectWeight(photo.public_id) : undefined}
                  >
                    <Image src={photo.url} alt="淨重照片" fill className="object-cover" />
                    {selectWeightMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : canEdit('edit_card_weight') ? (
                      <button type="button" onClick={() => handleDeleteExistingWeight(photo.public_id)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {pendingWeightPhotos.map((item, idx) => {
                const isSelected = selectedPendingWeightIdxs.has(idx)
                return (
                  <div
                    key={idx}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden border-2 transition-all ${
                      selectWeightMode
                        ? isSelected
                          ? 'border-[#7a5230] cursor-pointer shadow-[0_0_8px_rgba(122,82,48,.35)]'
                          : 'border-[#c49a72] cursor-pointer'
                        : 'border-[#c49a72]'
                    } bg-[#f2ebe0]`}
                    onClick={selectWeightMode ? () => toggleSelectPendingWeight(idx) : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt="淨重照片預覽" className="w-full h-full object-cover" />
                    {selectWeightMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-[rgba(122,82,48,.2)]' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-[#7a5230] drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : canEdit('edit_card_weight') ? (
                      <button type="button" onClick={() => handleDeletePendingWeight(idx)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                )
              })}

              {!selectWeightMode && canEdit('edit_card_weight') && (
                <button type="button" onClick={() => weightFileRef.current?.click()} disabled={isBusy}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-[#e8ddd0] flex items-center justify-center text-[#a08060] hover:border-[#c49a72] hover:text-[#7a5230] hover:shadow-[0_0_6px_rgba(122,82,48,.2)] transition-all disabled:opacity-40">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {selectWeightMode && (
              <div className="mt-3 flex items-center justify-between bg-[rgba(122,82,48,.05)] border border-[rgba(122,82,48,.18)] rounded-lg px-3 py-2">
                <span className="text-sm text-[#6b4f38]">
                  已選 <span className="font-semibold text-[#7a5230]">{totalSelectedWeight}</span> 張
                </span>
                <button type="button" onClick={handleBatchDeleteWeight}
                  disabled={isBusy || totalSelectedWeight === 0}
                  className="text-sm font-medium text-[#b5451b] hover:text-[#9a3a16] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  刪除選取
                </button>
              </div>
            )}

            <input ref={weightFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleAddWeightPhoto} />
          </div>

          {(uploading || docsBusy) && (
            <div className="flex items-center gap-2 text-sm text-[#7a5230]">
              <Loader2 className="h-4 w-4 animate-spin" />
              檔案處理中…
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[rgba(122,82,48,.15)]">
          <button onClick={handleClose} disabled={isBusy}
            className="px-4 py-2 text-sm text-[#a08060] hover:text-[#6b4f38] disabled:opacity-40 transition-colors">
            取消
          </button>
          <button onClick={mode === 'create' ? handleCreate : handleUpdate} disabled={isBusy}
            className="flex items-center gap-2 px-5 py-2 bg-[#7a5230] text-white text-sm font-medium rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-all shadow-[0_0_10px_rgba(122,82,48,.4)] hover:shadow-[0_0_14px_rgba(122,82,48,.55)]">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'create' ? '建立' : '儲存'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmRemoveDoc}
        title="移除文件"
        message={
          confirmRemoveDoc && (confirmRemoveDoc.equipment_ids?.length ?? 1) - 1 > 0
            ? `這份文件還用於其他 ${(confirmRemoveDoc.equipment_ids?.length ?? 1) - 1} 個品號，移除後只會解除本卡片的關聯，不影響其他品號。`
            : '這是此文件最後一個關聯的品號，移除後文件本體也會一併從 Google Drive 刪除，且無法復原。'
        }
        confirmLabel="移除"
        danger
        onConfirm={() => { if (confirmRemoveDoc) doRemoveDoc(confirmRemoveDoc) }}
        onCancel={() => setConfirmRemoveDoc(null)}
      />

      <ConfirmDialog
        open={!!pendingDocDuplicatePrompt}
        title="本次選取內有同名檔案"
        message={
          pendingDocDuplicatePrompt
            ? `待上傳清單裡已經有「${pendingDocDuplicatePrompt.displayName}」，是否要用這次選的檔案取代它？`
            : undefined
        }
        confirmLabel="取代"
        cancelLabel="取消這次選取"
        onConfirm={handlePendingDocDupReplace}
        onCancel={handlePendingDocDupCancel}
      />

      <ConfirmDialog
        open={!!duplicateDocPrompt}
        title="發現同名文件"
        message={
          duplicateDocPrompt
            ? `已有相同名稱的文件「${duplicateDocPrompt.match.name}」，請選擇處理方式：`
            : undefined
        }
        confirmLabel="取代（更新版本）"
        cancelLabel="先刪除舊的再上傳"
        onConfirm={handleDuplicateReplace}
        onCancel={handleDuplicateDeleteReupload}
      />

      <ConfirmDialog
        open={!!deleteReuploadConfirm}
        title="這份文件也掛載在其他料卡"
        message={
          deleteReuploadConfirm
            ? deleteReuploadConfirm.affectedCards
              ? `這份文件也掛載在以下料卡：${deleteReuploadConfirm.affectedCards.map(c => `${c.equipment_id} ${c.name}`).join('、')}，確定要一併移除嗎？`
              : `這份文件目前還掛載在其他 ${deleteReuploadConfirm.otherIds.length} 個品號，確定要一併移除嗎？`
            : undefined
        }
        confirmLabel="確定一併移除"
        cancelLabel="取消（不處理這份檔案）"
        danger
        onConfirm={() => {
          if (!deleteReuploadConfirm) return
          const { match, file, type, displayName, otherIds, resolve } = deleteReuploadConfirm
          setDeleteReuploadConfirm(null)
          finalizeDeleteReupload(match, file, type, displayName, otherIds)
          resolve()
        }}
        onCancel={() => {
          if (!deleteReuploadConfirm) return
          const { resolve } = deleteReuploadConfirm
          setDeleteReuploadConfirm(null)
          resolve()
        }}
      />
    </div>
  )
}
