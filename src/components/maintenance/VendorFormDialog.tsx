'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2 } from 'lucide-react'
import { MaintenanceVendor } from '@/types/maintenance'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  vendor?: MaintenanceVendor
  onClose: () => void
  onSaved: (vendor: MaintenanceVendor) => void
}

// 新增/編輯廠商 Dialog：代號/名稱/地址/聯絡人/電話
export default function VendorFormDialog({ open, mode, vendor, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [vendorCode, setVendorCode] = useState('')
  const [address, setAddress] = useState('')
  const [contactName, setContactName] = useState('')
  const [contactPhone, setContactPhone] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setName(vendor?.name ?? '')
    setVendorCode(vendor?.vendor_code ?? '')
    setAddress(vendor?.address ?? '')
    setContactName(vendor?.contact_name ?? '')
    setContactPhone(vendor?.contact_phone ?? '')
    setError(null)
  }, [open, vendor])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('廠商名稱為必填'); return }
    setSubmitting(true)
    setError(null)
    try {
      const body = {
        name: name.trim(),
        vendor_code: vendorCode.trim() || null,
        address: address.trim() || null,
        contact_name: contactName.trim() || null,
        contact_phone: contactPhone.trim() || null,
      }
      const res = await fetch(
        mode === 'create' ? '/api/maintenance/vendors' : `/api/maintenance/vendors/${vendor!.id}`,
        {
          method: mode === 'create' ? 'POST' : 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data?.error ?? '儲存失敗'); return }
      onSaved(data.vendor)
      onClose()
    } catch {
      setError('儲存失敗，請重試')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && !submitting && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#5a3820]">{mode === 'create' ? '新增廠商' : '編輯廠商'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs text-[#a08060] mb-1">廠商名稱 *</label>
            <input
              value={name} onChange={e => setName(e.target.value)} autoFocus disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">廠商代號</label>
            <input
              value={vendorCode} onChange={e => setVendorCode(e.target.value)} disabled={submitting}
              placeholder="例如 1234567（允許重複或空白）"
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          <div>
            <label className="block text-xs text-[#a08060] mb-1">地址</label>
            <input
              value={address} onChange={e => setAddress(e.target.value)} disabled={submitting}
              className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-[#a08060] mb-1">聯絡人</label>
              <input
                value={contactName} onChange={e => setContactName(e.target.value)} disabled={submitting}
                className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-xs text-[#a08060] mb-1">聯絡電話</label>
              <input
                value={contactPhone} onChange={e => setContactPhone(e.target.value)} disabled={submitting}
                className="w-full border border-[#e8ddd0] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-[#faf6f0] focus:outline-none focus:border-[#c49a72] disabled:opacity-50"
              />
            </div>
          </div>
          {error && <p className="text-xs text-[#b5451b]">{error}</p>}
          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} disabled={submitting}
              className="px-3 py-1.5 text-sm text-[#a08060] border border-[rgba(122,82,48,.2)] rounded-lg hover:text-[#7a5230] hover:border-[rgba(122,82,48,.4)] transition-colors disabled:opacity-40">
              取消
            </button>
            <button type="submit" disabled={submitting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] disabled:opacity-50 transition-colors">
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {mode === 'create' ? '新增' : '儲存'}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
