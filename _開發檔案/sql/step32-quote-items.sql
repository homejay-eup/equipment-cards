-- Step 32：報價查詢
-- 執行前注意：本檔案為一次性建表 + 預設分類 + 管理員權限授予腳本，可安全重複執行（皆用 IF NOT EXISTS / ON CONFLICT DO NOTHING）。

-- 1. 建表：報價品項（無料號，純品名 + 分類 + 兩種售價）
CREATE TABLE IF NOT EXISTS quote_items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category       TEXT NOT NULL,
  name           TEXT NOT NULL,
  standard_price NUMERIC NOT NULL,
  manager_price  NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by     TEXT
);

-- 2. RLS：內部價格資料，全鎖不開放 authenticated 直接讀寫（比對 Step 31 的作法）
--    所有讀寫一律經過 API Route，用 service_role 存取並依權限做欄位篩選（如 manager_price）
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;

-- 3. 預設分類清單寫入 app_settings（若已存在則不覆蓋）
INSERT INTO app_settings (key, value)
VALUES ('quoteCategories', '["影像配件","溫控配件","純定位配件","數位大餅配件","環保車機配件","整新費用","其他配件"]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 4. 管理員角色預設授予 3 個新權限（供應鏈/業務/業助等角色由管理員自行在角色管理頁勾選）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'view_quotes' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'view_quotes_manager_price' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'edit_quotes' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
