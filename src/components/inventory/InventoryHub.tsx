'use client'
// 庫存頁入口：CRM 庫存／ERP 庫存分開授權。兩個都有權限時顯示切換；只有一個就直接顯示那個。
// CRM 庫存保持掛載（進網站就背景載入）；ERP 庫存首次切過去才載入。
import { useState } from 'react'
import InventoryClient from './InventoryClient'
import ErpInventory from './ErpInventory'

export default function InventoryHub({ canCrm, canErp }: { canCrm: boolean; canErp: boolean }) {
  const [tab, setTab] = useState<'crm' | 'erp'>(canCrm ? 'crm' : 'erp')
  const [erpSeen, setErpSeen] = useState(!canCrm)
  const both = canCrm && canErp
  const seg = (on: boolean) => `px-4 py-1.5 text-[13px] ${on ? 'bg-[#7a5230] font-semibold text-white' : 'bg-white text-[#6b4f38] hover:text-[#7a5230]'}`
  // 切換鈕放在各頁標題列的右邊（兩頁位置一致），不佔獨立一列
  const switcher = both ? (
    <div className="inline-flex self-start overflow-hidden rounded-lg border border-[#e8ddd0]">
      <button className={seg(tab === 'crm')} onClick={() => setTab('crm')}>CRM 庫存</button>
      <button className={seg(tab === 'erp')} onClick={() => { setTab('erp'); setErpSeen(true) }}>ERP 庫存</button>
    </div>
  ) : null
  return (
    <div>
      {canCrm && <div className={tab === 'crm' ? '' : 'hidden'}><InventoryClient switcher={switcher} /></div>}
      {canErp && erpSeen && <div className={tab === 'erp' ? '' : 'hidden'}><ErpInventory switcher={switcher} /></div>}
    </div>
  )
}
