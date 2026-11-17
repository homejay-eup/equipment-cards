-- Step 55：庫存頁新增「移交出去／待接收／持有過久」分頁
-- 只新增一張資料表＋兩個權限，不改、不刪任何既有資料。可安全重複執行。
-- 移交出去、持有過久直接用現有「條碼明細」（inventory_items 的最後操作／更新時間）算，不需要新表；
-- 只有「移給哪一倉（接收倉）」CRM 庫存總表匯出裡沒有，另外存在這張表（來源：資料庫前一日備份，無法即時刷新）。

CREATE TABLE IF NOT EXISTS inventory_transfer_dest (
  barcode        TEXT PRIMARY KEY,
  kind           TEXT NOT NULL,                 -- 車機／配件
  dest_warehouse TEXT NOT NULL,                 -- 接收倉（移交的目的倉）
  source_date    DATE NOT NULL,                 -- 資料庫備份日（＝畫面上標示的「接收倉資料時間」）
  loaded_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventory_transfer_dest_dest_idx ON inventory_transfer_dest (dest_warehouse);
ALTER TABLE inventory_transfer_dest ENABLE ROW LEVEL SECURITY;   -- 不開 policy：只有 service_role（網站 API、公司電腦同步）能讀寫

-- 權限：第一版只給「管理員」，其他角色由管理員在「系統管理 → 角色管理 → 庫存」勾選
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, k FROM roles, unnest(ARRAY['view_inventory_transfers', 'view_inventory_idle_tech']) AS k
WHERE name = '管理員'
ON CONFLICT DO NOTHING;
