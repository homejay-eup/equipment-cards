-- Step 54b：ERP（鼎新 Cosmos）品號庫存。公司電腦在使用者登入 ERP 後，背景匯出「品號資料建立作業 INVMI02」並上傳到這裡。
-- 只做新增（建新表、加一個權限），不動任何既有表。ERP 不能像 CRM 一樣即時刷新，所以和 CRM 庫存分開存放、分開授權（view_erp_inventory）。

-- 1. 每次匯出的紀錄（資料時間＝匯出完成時間）
CREATE TABLE IF NOT EXISTS erp_stock_runs (
  id           BIGSERIAL PRIMARY KEY,
  exported_at  TIMESTAMPTZ NOT NULL,
  uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  rows         INTEGER NOT NULL,
  status       TEXT NOT NULL DEFAULT 'uploading',   -- uploading／ok／failed
  trigger      TEXT,                                -- login／manual
  note         TEXT
);

-- 2. ERP 品項庫存（每次上傳存一整批，run_id 指到哪一次；網站讀「最新一次 ok」的那批，上傳失敗不影響畫面）
CREATE TABLE IF NOT EXISTS erp_stock_items (
  product_id     TEXT NOT NULL,                     -- 品號
  name           TEXT NOT NULL,                     -- 品名
  qty            NUMERIC NOT NULL DEFAULT 0,        -- 庫存數量
  main_wh        TEXT,                              -- 主要庫別（代碼）
  vendor         TEXT,                              -- 主要廠商名稱
  has_serial     BOOLEAN NOT NULL DEFAULT false,    -- 進貨序號紀錄＝Y（有條碼管控）
  own_barcode    BOOLEAN NOT NULL DEFAULT false,    -- 控制編碼原則＝Y（自有條碼）
  serial_prefix  TEXT,                              -- 序號前置碼（自有條碼的前置碼）
  warranty_months INTEGER,                          -- 保固期（月）
  run_id         BIGINT NOT NULL REFERENCES erp_stock_runs(id) ON DELETE CASCADE,
  PRIMARY KEY (run_id, product_id)
);

-- 3. RLS：只開不放行（一律經 API Route 用 service_role 存取，權限在 API 把關）
ALTER TABLE erp_stock_runs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_stock_items ENABLE ROW LEVEL SECURITY;

-- 4. 權限：view_erp_inventory（看 ERP 庫存）、upload_erp_inventory（手動上傳匯出檔）先只給「管理員」，其他角色由管理員在「系統管理 → 角色管理」勾選
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, k FROM roles, unnest(ARRAY['view_erp_inventory', 'upload_erp_inventory']) AS k WHERE name = '管理員'
ON CONFLICT DO NOTHING;
