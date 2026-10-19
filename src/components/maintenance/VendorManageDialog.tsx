'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { MaintenanceVendor } from '@/types/maintenance'
import ConfirmDialog from '@/components/ConfirmDialog'
import VendorFormDialog from '@/components/maintenance/VendorFormDialog'

interface Props {
  open: boolean
  vendors: MaintenanceVendor[]
  onClose: () => void
  /** 廠商新增／編輯／刪除成功後呼叫（刪除廠商會連動刪除其規則，父層需一併重抓規則） */
  onChanged: () => void
}

const ICON_BTN = 'inline-flex items-center justify-center p-1 text-[#a08060] hover:text-[#7a5230] transition-colors rounded'

// 廠商資料管理：廠商清單＋新增／編輯（沿用 VendorFormDialog）／刪除。
// 刪除確認的 ConfirmDialog 刻意渲染在 DialogContent 內：Radix modal Dialog 開啟時 document.body 為
// pointer-events:none，放在 Dialog 外層的 ConfirmDialog 會點不到；DialogContent 帶 transform，
// 其內的 fixed 元素以 DialogContent 為定位基準，剛好蓋住整個視窗內容（所以 DialogContent 本身不可捲動，
// 清單區自己捲動）。
export default function VendorManageDialog({ open, vendors, onClose, onChanged }: Props) {
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create')
  const [editing, setEditing] = useState<MaintenanceVendor | undefined>(undefined)
  const [deleting, setDeleting] = useState<MaintenanceVendor | null>(null)
  const [error, setError] = useState<string | null>(null)

  function openCreate() {
    setFormMode('create')
    setEditing(undefined)
    setFormOpen(true)
  }

  function openEdit(v: MaintenanceVendor) {
    setFormMode('edit')
    setEditing(v)
    setFormOpen(true)
  }

  async function confirmDelete() {
    const vendor = deleting
    setDeleting(null)
    if (!vendor) return
    setError(null)
    try {
      const res = await fetch(`/api/maintenance/vendors/${vendor.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data?.error ?? '刪除失敗，請重試')
        return
      }
      onChanged()
    } catch {
      setError('刪除失敗，請重試')
    }
  }

  const deletingRuleCount = deleting?.rule_count ?? 0

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) { setError(null); onClose() } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#5a3820]">廠商資料</DialogTitle>
          </DialogHeader>

          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-[#a08060]">共 {vendors.length} 家。規則的廠商為選填，主要用在「送修」區塊。</p>
            <button
              type="button"
              onClick={openCreate}
              title="新增廠商"
              aria-label="新增廠商"
              className="inline-flex items-center justify-center p-1.5 px-2.5 bg-[#7a5230] text-white rounded-lg hover:bg-[#9c6b42] transition-colors flex-shrink-0"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {error && <p className="text-xs text-[#b5451b]" role="alert">{error}</p>}

          <div className="max-h-[50vh] overflow-y-auto border border-[#e8ddd0] rounded-lg bg-[#fffdf9]">
            {vendors.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-[#a08060]">尚無廠商</p>
            ) : vendors.map((v, i) => (
              <div key={v.id} className={`flex items-start gap-2 px-3 py-2.5 ${i > 0 ? 'border-t border-[rgba(122,82,48,.1)]' : ''}`}>
                <div className="flex-1 min-w-0 text-sm text-[#2c1e12]">
                  <p className="font-medium truncate">
                    {v.name}
                    {v.vendor_code && <span className="ml-1.5 text-xs font-normal text-[#a08060]">{v.vendor_code}</span>}
                  </p>
                  {(v.address || v.contact_name || v.contact_phone) && (
                    <div className="mt-0.5 space-y-0.5 text-xs">
                      {([
                        ['地址', v.address],
                        ['窗口', v.contact_name],
                        ['電話', v.contact_phone],
                      ] as const).filter(([, val]) => val).map(([label, val]) => (
                        <p key={label} className="flex gap-2">
                          <span className="w-8 shrink-0 text-[#a08060]">{label}</span>
                          <span className="min-w-0 break-words text-[#4a3422]">{val}</span>
                        </p>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-[#b0967a] mt-0.5">{v.rule_count ?? 0} 筆規則</p>
                </div>
                <button type="button" onClick={() => openEdit(v)} title="編輯廠商" aria-label={`編輯廠商「${v.name}」`} className={ICON_BTN}>
                  <Pencil className="h-[15px] w-[15px]" />
                </button>
                <button type="button" onClick={() => setDeleting(v)} title="刪除廠商" aria-label={`刪除廠商「${v.name}」`} className={`${ICON_BTN} hover:!text-[#b5451b]`}>
                  <Trash2 className="h-[15px] w-[15px]" />
                </button>
              </div>
            ))}
          </div>

          <ConfirmDialog
            open={deleting !== null}
            title={deleting ? `刪除廠商「${deleting.name}」？` : ''}
            message={deletingRuleCount > 0
              ? `此操作無法還原，底下 ${deletingRuleCount} 筆規則（含掛載的料號關聯）將一併刪除。`
              : '此操作無法還原。'}
            confirmLabel="刪除"
            danger
            onConfirm={confirmDelete}
            onCancel={() => setDeleting(null)}
          />
        </DialogContent>
      </Dialog>

      <VendorFormDialog
        open={formOpen}
        mode={formMode}
        vendor={editing}
        onClose={() => setFormOpen(false)}
        onSaved={() => onChanged()}
      />
    </>
  )
}
