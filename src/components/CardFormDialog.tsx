'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { X, Upload, Trash2, Plus, Loader2, AlertCircle, CheckSquare, Square } from 'lucide-react'
import { EquipmentCard, DetailPhoto, AppSettings } from '@/types/equipment'
import SettingsPopover from '@/components/SettingsPopover'

interface Props {
  mode: 'create' | 'edit'
  card?: EquipmentCard
  open: boolean
  onClose: () => void
  settings: AppSettings
}

interface FormState {
  equipment_id: string
  name: string
  category: string
  vendor: string
  status: string
  tags: string
  notes: string
}

interface PendingDetail {
  file: File
  preview: string
}

export default function CardFormDialog({ mode, card, open, onClose, settings }: Props) {
  const router = useRouter()
  const mainFileRef   = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)

  const defaultStatus = settings.statuses[0] ?? '現役'

  // 本地可寫的 settings，讓 Popover 更新後下拉選單立即反映（不依賴 parent re-fetch）
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings)

  const [form, setForm] = useState<FormState>({
    equipment_id: card?.equipment_id ?? '',
    name:         card?.name ?? '',
    category:     card?.category ?? '',
    vendor:       card?.vendor ?? '',
    status:       card?.status ?? defaultStatus,
    tags:         card?.tags.join(', ') ?? '',
    notes:        card?.notes ?? '',
  })

  const [mainPhoto, setMainPhoto]               = useState<string | null>(card?.main_photo ?? null)
  const [mainPhotoId, setMainPhotoId]           = useState<string | null>(card?.main_photo_public_id ?? null)
  const [detailPhotos, setDetailPhotos]         = useState<DetailPhoto[]>(card?.detail_photos ?? [])
  // staged new main photo (both modes)
  const [mainPhotoFile, setMainPhotoFile]       = useState<File | null>(null)
  const [mainPhotoPreview, setMainPhotoPreview] = useState<string | null>(null)
  // staged new detail photos (both modes)
  const [pendingDetails, setPendingDetails]     = useState<PendingDetail[]>([])
  // edit mode: existing photos staged for deletion on save
  const [deleteMainPending, setDeleteMainPending]   = useState(false)
  const [deleteDetailIds, setDeleteDetailIds]       = useState<Set<string>>(new Set())

  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [photoError, setPhotoError]   = useState<string | null>(null)
  // 細節照片選取模式
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
    })
    setMainPhoto(card?.main_photo ?? null)
    setMainPhotoId(card?.main_photo_public_id ?? null)
    setDetailPhotos(card?.detail_photos ?? [])
    setMainPhotoFile(null)
    setMainPhotoPreview(null)
    setPendingDetails([])
    setDeleteMainPending(false)
    setDeleteDetailIds(new Set())
    setError(null)
    setPhotoError(null)
    setSelectMode(false)
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
  }, [card, open]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function parseTags(raw: string): string[] {
    return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean)
  }

  function handleClose() {
    // Revoke any locally staged object URLs to avoid memory leaks
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    pendingDetails.forEach(p => URL.revokeObjectURL(p.preview))
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
        body: JSON.stringify({ ...form, tags: parseTags(form.tags) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? '建立失敗'); return }

      const equipId = form.equipment_id.trim()

      if (mainPhotoFile) {
        setUploading(true)
        try {
          await uploadPhoto(mainPhotoFile, equipId, 'main')
        } catch (e) {
          setError(`料卡已建立，但主照片上傳失敗：${e instanceof Error ? e.message : ''}`)
          router.refresh()
          return
        } finally {
          setUploading(false)
        }
      }

      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) {
          setError(`料卡已建立，但細節照片上傳失敗：${e instanceof Error ? e.message : ''}`)
          router.refresh()
          return
        } finally {
          setUploading(false)
        }
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
    setSaving(true)
    setError(null)
    try {
      // 1. Patch text fields
      const res = await fetch(`/api/cards/${card!.equipment_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tags: parseTags(form.tags) }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '更新失敗'); return }

      const equipId = card!.equipment_id

      // 2. Delete existing main photo if marked for deletion (and no replacement staged)
      if (deleteMainPending && mainPhotoId && !mainPhotoFile) {
        setUploading(true)
        try {
          await fetch(
            `/api/upload/${encodeURIComponent(mainPhotoId)}?equipment_id=${equipId}&type=main`,
            { method: 'DELETE' },
          )
        } catch { /* non-fatal */ } finally {
          setUploading(false)
        }
      }

      // 3. Upload staged main photo
      if (mainPhotoFile) {
        setUploading(true)
        try {
          await uploadPhoto(mainPhotoFile, equipId, 'main')
        } catch (e) {
          setError(`主照片上傳失敗：${e instanceof Error ? e.message : ''}`)
          router.refresh()
          return
        } finally {
          setUploading(false)
        }
      }

      // 4. Delete marked detail photos
      if (deleteDetailIds.size > 0) {
        setUploading(true)
        try {
          for (const publicId of Array.from(deleteDetailIds)) {
            await fetch(
              `/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=detail`,
              { method: 'DELETE' },
            )
          }
        } catch { /* non-fatal */ } finally {
          setUploading(false)
        }
      }

      // 5. Upload staged detail photos
      if (pendingDetails.length > 0) {
        setUploading(true)
        try {
          const base = Date.now()
          for (let i = 0; i < pendingDetails.length; i++) {
            await uploadPhoto(pendingDetails[i].file, equipId, `detail_${base}_${i}`)
          }
        } catch (e) {
          setError(`細節照片上傳失敗：${e instanceof Error ? e.message : ''}`)
          router.refresh()
          return
        } finally {
          setUploading(false)
        }
      }

      router.refresh()
      onClose()
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  function handleMainPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    if (mainPhotoPreview) URL.revokeObjectURL(mainPhotoPreview)
    setMainPhotoFile(file)
    setMainPhotoPreview(URL.createObjectURL(file))
    // If user had marked the existing photo for deletion, the new upload replaces it
    setDeleteMainPending(false)
  }

  function handleDeleteMain() {
    if (mainPhotoPreview) {
      // Delete the staged (not-yet-uploaded) file
      URL.revokeObjectURL(mainPhotoPreview)
      setMainPhotoFile(null)
      setMainPhotoPreview(null)
    } else {
      // Mark the existing DB photo for deletion on save
      setDeleteMainPending(true)
    }
  }

  function handleAddDetail(e: React.ChangeEvent<HTMLInputElement>) {
    // Copy to plain array BEFORE resetting value — some browsers clear the
    // FileList in-place when value='' is set, leaving a stale live reference.
    const fileArray = Array.from(e.target.files ?? [])
    e.target.value = ''
    if (!fileArray.length) return

    if (mode === 'create') {
      const equipId = form.equipment_id.trim()
      if (!equipId) { setPhotoError('請先填入料號'); return }
    }

    const newItems: PendingDetail[] = fileArray.map(f => ({
      file: f,
      preview: URL.createObjectURL(f),
    }))
    setPendingDetails(prev => [...prev, ...newItems])
  }

  function handleDeletePendingDetail(index: number) {
    setPendingDetails(prev => {
      URL.revokeObjectURL(prev[index].preview)
      return prev.filter((_, i) => i !== index)
    })
  }

  function handleDeleteDetail(publicId: string) {
    setDeleteDetailIds(prev => new Set([...Array.from(prev), publicId]))
  }

  function toggleSelectDetail(publicId: string) {
    setSelectedDetailIds(prev => {
      const next = new Set(prev)
      if (next.has(publicId)) { next.delete(publicId) } else { next.add(publicId) }
      return next
    })
  }

  function toggleSelectPending(idx: number) {
    setSelectedPendingIdxs(prev => {
      const next = new Set(prev)
      if (next.has(idx)) { next.delete(idx) } else { next.add(idx) }
      return next
    })
  }

  function handleBatchDelete() {
    // 批次刪除：existing photos
    selectedDetailIds.forEach(id => handleDeleteDetail(id))
    // 批次刪除：pending photos（index 由大到小，避免移除後 index 偏移）
    const sortedIdxs = Array.from(selectedPendingIdxs).sort((a, b) => b - a)
    sortedIdxs.forEach(idx => handleDeletePendingDetail(idx))
    setSelectedDetailIds(new Set())
    setSelectedPendingIdxs(new Set())
    setSelectMode(false)
  }

  const totalSelected = selectedDetailIds.size + selectedPendingIdxs.size

  const isBusy = saving || uploading
  // Show staged preview if available, otherwise show existing (unless marked for delete)
  const currentMainPhoto = mainPhotoPreview ?? (deleteMainPending ? null : mainPhoto)
  // Only show existing details not marked for deletion
  const visibleDetails = detailPhotos.filter(p => !deleteDetailIds.has(p.public_id))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? '新增料卡' : '編輯料卡'}
          </h2>
          <button onClick={handleClose} disabled={isBusy}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-40">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {/* 料號 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              料號 <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.equipment_id}
              onChange={e => set('equipment_id', e.target.value)}
              disabled={mode === 'edit'} placeholder="例：1000003"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>

          {/* 品名 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              品名 <span className="text-red-500">*</span>
            </label>
            <input type="text" value={form.name}
              onChange={e => set('name', e.target.value)} placeholder="例：S168-4G衛星定位器"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 分類 + 狀態 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                分類
                <SettingsPopover
                  settingKey="categories"
                  items={localSettings.categories}
                  onConfirm={cats => setLocalSettings(prev => ({ ...prev, categories: cats }))}
                  disabled={isBusy}
                />
              </label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— 未分類 —</option>
                {localSettings.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-1">
                狀態
                <SettingsPopover
                  settingKey="statuses"
                  items={localSettings.statuses}
                  onConfirm={stats => setLocalSettings(prev => ({ ...prev, statuses: stats }))}
                  disabled={isBusy}
                />
              </label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {localSettings.statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* 廠商 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">廠商</label>
            <input type="text" value={form.vendor}
              onChange={e => set('vendor', e.target.value)} placeholder="例：格瑪車機"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 標籤 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              標籤 <span className="text-gray-400 font-normal ml-1">（逗號分隔）</span>
            </label>
            <input type="text" value={form.tags}
              onChange={e => set('tags', e.target.value)} placeholder="例：HS昇銳, RFID, 4G"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 備註 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">備註</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} placeholder="補充說明…"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          {/* 照片錯誤提示（就近顯示） */}
          {photoError && (
            <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>{photoError}</span>
            </div>
          )}

          {/* 主照片 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">主照片</label>
            {currentMainPhoto ? (
              <div className="flex items-center gap-3">
                <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                  <Image src={currentMainPhoto} alt="主照片" fill className="object-cover" />
                </div>
                <div className="flex flex-col gap-2">
                  <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy}
                    className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-40">
                    更換照片
                  </button>
                  <button type="button" onClick={handleDeleteMain} disabled={isBusy}
                    className="text-sm text-red-500 hover:text-red-700 disabled:opacity-40">
                    刪除照片
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => mainFileRef.current?.click()} disabled={isBusy}
                className="flex items-center gap-2 border-2 border-dashed border-gray-300 rounded-lg px-4 py-3 text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors disabled:opacity-40">
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
              <label className="text-sm font-medium text-gray-700">細節照片</label>
              {(visibleDetails.length > 0 || pendingDetails.length > 0) && (
                <button type="button" onClick={() => {
                  setSelectMode(v => !v)
                  setSelectedDetailIds(new Set())
                  setSelectedPendingIdxs(new Set())
                }} disabled={isBusy}
                  className="text-xs text-gray-500 hover:text-blue-600 disabled:opacity-40 transition-colors">
                  {selectMode ? '取消選取' : '選取'}
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {/* existing detail photos */}
              {visibleDetails.map(photo => {
                const isSelected = selectedDetailIds.has(photo.public_id)
                return (
                  <div key={photo.public_id}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      selectMode
                        ? isSelected ? 'border-red-400 cursor-pointer' : 'border-gray-200 cursor-pointer'
                        : 'border-gray-200'
                    } bg-gray-50`}
                    onClick={selectMode ? () => toggleSelectDetail(photo.public_id) : undefined}
                  >
                    <Image src={photo.url} alt="細節照片" fill className="object-cover" />
                    {selectMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-red-400/20' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-red-500 drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : (
                      <button type="button" onClick={() => handleDeleteDetail(photo.public_id)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}

              {/* staged detail photos (not yet uploaded) */}
              {pendingDetails.map((item, idx) => {
                const isSelected = selectedPendingIdxs.has(idx)
                return (
                  <div key={idx}
                    className={`relative group w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 border-2 transition-colors ${
                      selectMode
                        ? isSelected ? 'border-red-400 cursor-pointer' : 'border-blue-200 cursor-pointer'
                        : 'border-blue-200'
                    } bg-blue-50`}
                    onClick={selectMode ? () => toggleSelectPending(idx) : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.preview} alt="細節照片預覽" className="w-full h-full object-cover" />
                    {selectMode ? (
                      <div className={`absolute inset-0 flex items-end justify-end p-1 ${isSelected ? 'bg-red-400/20' : ''}`}>
                        {isSelected
                          ? <CheckSquare className="h-5 w-5 text-red-500 drop-shadow" />
                          : <Square className="h-5 w-5 text-white drop-shadow" />
                        }
                      </div>
                    ) : (
                      <button type="button" onClick={() => handleDeletePendingDetail(idx)}
                        disabled={isBusy}
                        className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                )
              })}

              {/* 新增按鈕（選取模式時隱藏） */}
              {!selectMode && (
                <button type="button" onClick={() => detailFileRef.current?.click()} disabled={isBusy}
                  className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-40">
                  <Plus className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* 選取模式 action bar */}
            {selectMode && (
              <div className="mt-3 flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                <span className="text-sm text-gray-600">
                  已選 <span className="font-semibold text-gray-900">{totalSelected}</span> 張
                </span>
                <button type="button" onClick={handleBatchDelete}
                  disabled={isBusy || totalSelected === 0}
                  className="text-sm font-medium text-red-600 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  刪除選取
                </button>
              </div>
            )}

            <input ref={detailFileRef} type="file" accept="image/*" multiple className="hidden"
              onChange={handleAddDetail} />
          </div>

          {uploading && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              照片處理中…
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={handleClose} disabled={isBusy}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-40">
            取消
          </button>
          <button onClick={mode === 'create' ? handleCreate : handleUpdate} disabled={isBusy}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === 'create' ? '建立' : '儲存'}
          </button>
        </div>
      </div>
    </div>
  )
}
