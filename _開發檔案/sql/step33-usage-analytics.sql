-- Step 33：使用統計（登入次數／停留時長／功能使用分析）
-- 執行前注意：本檔案為一次性建表 + RLS 鎖定腳本，可安全重複執行（皆用 IF NOT EXISTS）。
-- 三張表皆比照 Step 31/32 的作法：全程只透過 service_role 讀寫，
-- 前端 anon / authenticated 角色完全不需要任何存取權限，因此鎖死 RLS 且不加任何 policy
-- 不會影響既有功能。

-- 1. login_events：每次成功登入的事件記錄，用來算登入次數/頻率
CREATE TABLE IF NOT EXISTS login_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS login_events_email_idx ON login_events(email);

ALTER TABLE login_events ENABLE ROW LEVEL SECURITY;

-- 2. usage_sessions：估算單次停留時長
--    id 由前端用 crypto.randomUUID() 產生（存在 sessionStorage，分頁關閉即失效），
--    不使用 DEFAULT gen_random_uuid()，寫入時一律由呼叫端帶入 id。
CREATE TABLE IF NOT EXISTS usage_sessions (
  id            UUID PRIMARY KEY,
  email         TEXT NOT NULL,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_ping_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_sessions_email_idx ON usage_sessions(email);

ALTER TABLE usage_sessions ENABLE ROW LEVEL SECURITY;

-- 3. usage_events：通用功能使用事件表，之後新增追蹤點只需多一行呼叫，不需要改 schema
CREATE TABLE IF NOT EXISTS usage_events (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  event_type TEXT NOT NULL,
  metadata   JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS usage_events_email_idx ON usage_events(email);
CREATE INDEX IF NOT EXISTS usage_events_type_idx ON usage_events(event_type);

ALTER TABLE usage_events ENABLE ROW LEVEL SECURITY;

-- 不建立任何 policy：預設 RLS 開啟 + 無 policy = anon/authenticated 完全無法存取
-- service_role 具備 bypass RLS 權限，不受影響，應用程式邏輯（API Routes）照常運作
