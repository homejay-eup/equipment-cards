-- Step 30b：文件管理頁面（跨卡片批次上傳/刪除/重新產生目錄檔）
-- 執行前注意：可安全重複執行（ON CONFLICT DO NOTHING）。

-- 管理員角色預設授予新權限 manage_documents（其他角色由管理員自行在角色管理頁勾選）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'manage_documents' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════════════════
-- 備註（不需執行，說明用）：
-- POST /api/documents/regenerate-index 會在 app_settings 新增一筆 key = 'documentIndexSheet'，
-- value 為 { sheet_id, sheet_url, generated_at }，用來記住「文件目錄表」Google Sheet 的
-- file id，讓下次呼叫改成覆蓋同一份檔案而非每次新建。app_settings 是既有的 key/value
-- 表（value 為 JSONB），此為新增一列資料，不需要 DDL、也沒有舊資料相容性問題——
-- 第一次呼叫時該 key 不存在，程式會自動建立新的 Google Sheet 並寫入這筆設定。
