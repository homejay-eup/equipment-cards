'use client'

import { useState } from 'react'
import { X, Loader2, Copy } from 'lucide-react'

interface Props {
  sourceName: string
  onConfirm: (newName: string) => Promise<void>
  onCancel: () => void
}

// 複製組合彈窗：強制輸入新名稱（預設帶「原名稱（副本）」）才能建立，不與來源做任何關聯
export default function DuplicatePackageDialog({ sourceName, onConfirm, onCancel }: Props) {
  const [name, setName] = useState(`${sourceName}（副本）`)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    const trimmed = name.trim()
    if (!trimmed) {
      setError('新組合名稱為必填')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onConfirm(trimmed)
    } catch (e) {
      setError(e instanceof Error ? e.message : '複製失敗')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[#faf6f0] rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-[rgba(122,82,48,.15)] flex items-center justify-between">
          <p className="text-sm font-semibold text-[#5a3820]">複製組合「{sourceName}」</p>
          <button onClick={onCancel} className="text-[#a08060] hover:text-[#7a5230]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="p-4 space-y-2">
          <p className="text-xs text-[#a08060]">新組合名稱（同部門內不可重複）</p>
          <input
            autoFocus
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
            disabled={saving}
            className="w-full border border-[#c49a72] rounded-lg px-3 py-2 text-sm text-[#2c1e12] bg-white focus:outline-none focus:ring-2 focus:ring-[#c49a72] disabled:opacity-50"
          />
          {error && <p className="text-xs text-[#b5451b]">{error}</p>}
        </div>
        <div className="px-4 pb-4 flex gap-2 justify-end">
          <button
            onClick={onCancel}
            disabled={saving}
            className="px-3 py-1.5 text-xs border border-[#e8ddd0] rounded-lg text-[#a08060] hover:text-[#7a5230] hover:border-[rgba(122,82,48,.3)] disabled:opacity-40 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={saving || !name.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-[#7a5230] text-white rounded-lg disabled:opacity-40 hover:bg-[#9c6b42] transition-colors"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Copy className="h-3 w-3" />}
            建立副本
          </button>
        </div>
      </div>
    </div>
  )
}
