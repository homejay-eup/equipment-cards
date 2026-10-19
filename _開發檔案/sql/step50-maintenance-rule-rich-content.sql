-- Step 50：維修資訊規則「內容」支援貼圖／貼表格
-- 可重複執行。
--
-- 部署順序：先執行本 SQL，後部署程式碼。
-- 若程式碼先上線而本 SQL 尚未執行，GET /api/maintenance/rules 會因欄位不存在而回 500。
--
-- 權限說明：沿用既有 manage_maintenance_info，不新增 permission key，RLS 不變
-- （API 一律走 service_role，寫入由 requirePermission 把關）。
--
-- 舊資料相容性：既有規則的 content_image_urls 自動為 '[]'、content_table_data 為 NULL，不需 migration。

ALTER TABLE maintenance_rules
  ADD COLUMN IF NOT EXISTS content_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE maintenance_rules
  ADD COLUMN IF NOT EXISTS content_table_data JSONB;

-- 內容可只有圖片或表格：API 在無文字時寫入空字串，content 維持 NOT NULL
ALTER TABLE maintenance_rules
  ALTER COLUMN content SET DEFAULT '';
