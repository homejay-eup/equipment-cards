'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { X, Upload, Trash2, Plus, Loader2, AlertCircle } from 'lucide-react'
import { EquipmentCard, DetailPhoto, AppSettings } from '@/types/equipment'

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

export default function CardFormDialog({ mode, card, open, onClose, settings }: Props) {
  const router = useRouter()
  const mainFileRef   = useRef<HTMLInputElement>(null)
  const detailFileRef = useRef<HTMLInputElement>(null)

  const defaultStatus = settings.statuses[0] ?? '現役'

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
  const [mainPhotoFile, setMainPhotoFile]       = useState<File | null>(null)
  const [mainPhotoPreview, setMainPhotoPreview] = useState<string | null>(null)

  const [saving, setSaving]           = useState(false)
  const [uploading, setUploading]     = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [photoError, setPhotoError]   = useState<string | null>(null)

  useEffect(() => {
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
    setError(null)
    setPhotoError(null)
  }, [card, open])

  if (!open) return null

  function set(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function parseTags(raw: string): string[] {
    return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean)
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

      if (mainPhotoFile) {
        setUploading(true)
        try {
          await uploadPhoto(mainPhotoFile, form.equipment_id.trim(), 'main')
        } catch (e) {
          setError(`料卡已建立，但照片上傳失敗：${e instanceof Error ? e.message : ''}`)
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
      const res = await fetch(`/api/cards/${card!.equipment_id}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tags: parseTags(form.tags) }),
      })
      if (!res.ok) { const d = await res.json(); setError(d.error ?? '更新失敗'); return }
      router.refresh()
      onClose()
    } catch {
      setError('更新失敗，請重試')
    } finally {
      setSaving(false)
    }
  }

  async function handleMainPhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (mode === 'create') {
      setMainPhotoFile(file)
      setMainPhotoPreview(URL.createObjectURL(file))
      return
    }

    setUploading(true)
    setPhotoError(null)
    try {
      const result = await uploadPhoto(file, card!.equipment_id, 'main')
      setMainPhoto(result.url)
      setMainPhotoId(result.public_id)
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : '上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteMain() {
    if (mode === 'create') {
      setMainPhotoFile(null)
      setMainPhotoPreview(null)
      return
    }
    if (!mainPhotoId) return
    setUploading(true)
    try {
      await fetch(
        `/api/upload/${encodeURIComponent(mainPhotoId)}?equipment_id=${card!.equipment_id}&type=main`,
        { method: 'DELETE' },
      )
      setMainPhoto(null)
      setMainPhotoId(null)
    } catch {
      setPhotoError('刪除失敗')
    } finally {
      setUploading(false)
    }
  }

  async function handleAddDetail(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files?.length) return
    e.target.value = ''
    const equipId = mode === 'edit' ? card!.equipment_id : form.equipment_id.trim()
    if (!equipId) { setPhotoError('請先填入料號'); return }

    setUploading(true)
    setPhotoError(null)
    try {
      const base = Date.now()
      for (let i = 0; i < files.length; i++) {
        const type   = `detail_${base}_${i}`
        const result = await uploadPhoto(files[i], equipId, type)
        setDetailPhotos(prev => [...prev, result])
      }
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : '上傳失敗')
    } finally {
      setUploading(false)
    }
  }

  async function handleDeleteDetail(publicId: string) {
    const equipId = mode === 'edit' ? card!.equipment_id : form.equipment_id.trim()
    setUploading(true)
    try {
      await fetch(
        `/api/upload/${encodeURIComponent(publicId)}?equipment_id=${equipId}&type=detail`,
        { method: 'DELETE' },
      )
      setDetailPhotos(prev => prev.filter(p => p.public_id !== publicId))
    } catch {
      setPhotoError('刪除失敗')
    } finally {
      setUploading(false)
    }
  }

  const isBusy = saving || uploading
  const currentMainPhoto = mode === 'create' ? mainPhotoPreview : mainPhoto

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">

        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">
            {mode === 'create' ? '新增料卡' : '編輯料卡'}
          </h2>
          <button onClick={onClose} disabled={isBusy}
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
              <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
              <select value={form.category} onChange={e => set('category', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                <option value="">— 未分類 —</option>
                {settings.categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">狀態</label>
              <select value={form.status} onChange={e => set('status', e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400">
                {settings.statuses.map(s => <option key={s} value={s}>{s}</option>)}
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
            <label className="block text-sm font-medium text-gray-700 mb-2">細節照片</label>
            <div className="flex flex-wrap gap-2">
              {detailPhotos.map(photo => (
                <div key={photo.public_id}
                  className="relative group w-20 h-20 rounded-lg overflow-hidden border border-gray-200 bg-gray-50 flex-shrink-0">
                  <Image src={photo.url} alt="細節照片" fill className="object-cover" />
                  <button type="button" onClick={() => handleDeleteDetail(photo.public_id)}
                    disabled={isBusy}
                    className="absolute inset-0 bg-black/50 hidden group-hover:flex items-center justify-center text-white disabled:opacity-40">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => detailFileRef.current?.click()} disabled={isBusy}
                className="w-20 h-20 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors disabled:opacity-40">
                <Plus className="h-5 w-5" />
              </button>
            </div>
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
          <button onClick={onClose} disabled={isBusy}
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
