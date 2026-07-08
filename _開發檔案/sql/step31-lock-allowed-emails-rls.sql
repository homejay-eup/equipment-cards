-- Step 31 後續補強：鎖住帳號管理相關三張表的 RLS
-- 背景：實測發現 allowed_emails / roles / role_permissions 三張表未鎖 RLS，
-- anon key（前端公開金鑰）可直接對這三張表做 SELECT 與 INSERT，等同繞過整個登入白名單機制。
-- 應用程式端（src/lib/admin.ts）全程只用 SUPABASE_SERVICE_ROLE_KEY 存取這三張表，
-- 前端 / RLS 下的 anon、authenticated 角色完全不需要任何存取權限，
-- 因此鎖死 RLS 且不加任何 policy 不會影響既有功能。

ALTER TABLE allowed_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- 不建立任何 policy：預設 RLS 開啟 + 無 policy = anon/authenticated 完全無法存取
-- service_role 具備 bypass RLS 權限，不受影響，應用程式邏輯照常運作
