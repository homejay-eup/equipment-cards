-- Step 54：CRM 庫存整合（庫存頁、刷新、盤點表）
-- 只新增資料表／檢視／權限，不改、不刪任何既有資料表。可安全重複執行（IF NOT EXISTS／ON CONFLICT DO NOTHING／CREATE OR REPLACE）。
-- 存取方式比照 standard_price_items：全部開 RLS、不開放 authenticated 直接讀寫；
--   網站一律經 API Route 用 service_role 讀寫（API 內檢查權限與角色倉庫範圍）；
--   公司電腦的同步程式也用 service_role（金鑰只放公司電腦 .env）。
-- 使用者 2026-11-13 核准直接在正式 Supabase 建立（不另建測試專案）。

-- 1. 同步紀錄：每一批每一次匯出一筆
CREATE TABLE IF NOT EXISTS inventory_snapshots (
  id           BIGSERIAL PRIMARY KEY,
  batch_key    TEXT NOT NULL,               -- company-main／company-rest／tech-north／tech-hsinchu／tech-central／tech-south／repair
  source       TEXT NOT NULL DEFAULT 'crm', -- crm／db
  trigger      TEXT NOT NULL DEFAULT 'schedule', -- schedule／refresh／manual
  request_id   BIGINT,                      -- 由網站刷新觸發時，對應 inventory_refresh_requests.id
  status       TEXT NOT NULL DEFAULT 'uploading', -- uploading／ok／failed
  rows         INTEGER,
  by_wh        JSONB,                       -- {倉庫: 筆數}
  error        TEXT,
  exported_at  TIMESTAMPTZ,                 -- CRM 匯出完成時間（＝畫面上的「資料時間」）
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS inventory_snapshots_batch_idx ON inventory_snapshots (batch_key, created_at DESC);

-- 2. 每批目前生效的那一次（上傳完整才切過去，讀的人不會看到半套資料）
CREATE TABLE IF NOT EXISTS inventory_batch_current (
  batch_key    TEXT PRIMARY KEY,
  snapshot_id  BIGINT NOT NULL REFERENCES inventory_snapshots(id),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. 條碼明細（CRM 匯出整理後；不含客戶名稱／車牌）
CREATE TABLE IF NOT EXISTS inventory_items (
  id           BIGSERIAL PRIMARY KEY,
  snapshot_id  BIGINT NOT NULL REFERENCES inventory_snapshots(id) ON DELETE CASCADE,
  batch_key    TEXT NOT NULL,
  region       TEXT,
  warehouse    TEXT NOT NULL,
  category     TEXT,          -- 匯出的「產品分類」
  name         TEXT NOT NULL, -- 匯出的「產品名稱」
  car          TEXT,
  barcode      TEXT,
  crm_updated  TEXT,          -- 匯出的「更新時間」原字串
  op           TEXT,
  who          TEXT,
  unusable     BOOLEAN NOT NULL DEFAULT false,
  note         TEXT
);
CREATE INDEX IF NOT EXISTS inventory_items_snapshot_idx ON inventory_items (snapshot_id);
CREATE INDEX IF NOT EXISTS inventory_items_barcode_idx  ON inventory_items (barcode);
CREATE INDEX IF NOT EXISTS inventory_items_wh_name_idx  ON inventory_items (warehouse, category, name);

-- 4. 名稱 → 料號對照（匯出檔沒有料號）
CREATE TABLE IF NOT EXISTS inventory_name_map (
  category     TEXT NOT NULL DEFAULT '',
  name         TEXT NOT NULL,
  product_id   TEXT,                       -- 料卡 equipment_id；NULL＝待補（畫面標「未對應料卡」）
  source       TEXT NOT NULL DEFAULT 'auto', -- auto（由資料庫條碼對出）／manual（管理員補）
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (category, name)
);
CREATE INDEX IF NOT EXISTS inventory_name_map_pid_idx ON inventory_name_map (product_id);

-- 5. 網站「刷新」請求（公司電腦每幾秒來拿一次）
CREATE TABLE IF NOT EXISTS inventory_refresh_requests (
  id           BIGSERIAL PRIMARY KEY,
  requested_by TEXT NOT NULL,              -- 使用者 email
  batch_keys   TEXT[] NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued', -- queued／running／done／failed
  step         TEXT,                       -- 開始／刷新／CRM／完成
  progress     JSONB,                      -- {batch_key: 'waiting'|'running'|'ok'|'failed'}
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS inventory_refresh_requests_status_idx ON inventory_refresh_requests (status, created_at);

-- 6. 每位使用者自己的庫存頁設定（倉庫欄位與順序、列順序、分組、排序、收合、檢視…）
CREATE TABLE IF NOT EXISTS user_inventory_prefs (
  user_email   TEXT PRIMARY KEY,
  prefs        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. 角色預設排列（新使用者第一次進來、或按「恢復預設」時套用）
CREATE TABLE IF NOT EXISTS role_inventory_defaults (
  role_id      UUID PRIMARY KEY REFERENCES roles(id) ON DELETE CASCADE,
  prefs        JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 8. 角色可看的倉庫範圍（沒有任何一列＝看不到任何倉）
CREATE TABLE IF NOT EXISTS role_inventory_warehouses (
  role_id      UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  warehouse    TEXT NOT NULL,
  PRIMARY KEY (role_id, warehouse)
);

-- 9. 盤點表「倉別」（儲位）記憶：跟著品號
CREATE TABLE IF NOT EXISTS stocktake_locations (
  product_key  TEXT PRIMARY KEY,           -- 料號；未對應料卡的品項用「名稱:<產品名稱>」
  location     TEXT NOT NULL,
  source       TEXT NOT NULL DEFAULT 'web', -- web／sheet
  updated_by   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. 匯出過的盤點表（下次匯出前讀回倉別用）
CREATE TABLE IF NOT EXISTS stocktake_exports (
  id           BIGSERIAL PRIMARY KEY,
  created_by   TEXT NOT NULL,
  warehouses   TEXT[] NOT NULL,
  mode         TEXT NOT NULL,              -- merge／each
  qty_mode     TEXT NOT NULL,              -- all／ok
  file_name    TEXT NOT NULL,
  sheet_id     TEXT,
  sheet_url    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 11. 檢視：目前生效的條碼明細、產品 × 倉庫彙總
CREATE OR REPLACE VIEW inventory_current_items AS
SELECT i.*, m.product_id, s.exported_at
FROM inventory_items i
JOIN inventory_batch_current c ON c.snapshot_id = i.snapshot_id
JOIN inventory_snapshots s ON s.id = i.snapshot_id
LEFT JOIN inventory_name_map m ON m.category = COALESCE(i.category, '') AND m.name = i.name;

CREATE OR REPLACE VIEW inventory_summary AS
SELECT product_id, category, name, warehouse, region, batch_key,
       COUNT(*) FILTER (WHERE NOT unusable) AS ok_count,
       COUNT(*) FILTER (WHERE unusable)     AS bad_count,
       MAX(exported_at)                     AS exported_at
FROM inventory_current_items
GROUP BY product_id, category, name, warehouse, region, batch_key;

-- 12. RLS：全開、不加 policy（只有 service_role 能讀寫）
ALTER TABLE inventory_snapshots        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_batch_current    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items            ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_name_map         ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_refresh_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_inventory_prefs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_inventory_defaults    ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_inventory_warehouses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE stocktake_exports          ENABLE ROW LEVEL SECURITY;
-- 檢視跟著查詢者的權限走（不讓 anon／authenticated 透過檢視繞過 RLS）
ALTER VIEW inventory_current_items SET (security_invoker = true);
ALTER VIEW inventory_summary       SET (security_invoker = true);

-- 13. 權限：第一版只授予「管理員」；其他角色由管理員在「系統管理 → 角色管理」勾選
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, k FROM roles, unnest(ARRAY['view_inventory', 'view_inventory_barcodes', 'refresh_inventory', 'export_stocktake']) AS k
WHERE name = '管理員'
ON CONFLICT DO NOTHING;
