-- Step 42：任務「說明」欄位支援貼圖/貼表格 + 更新紀錄支援修改
-- 前置條件：add-tracker.sql、step41-issue-updates-attachments.sql 必須已執行

-- ── 1. issues：說明欄位支援貼圖/貼表格 ────────────────────────
-- 跟 issue_updates.image_urls/table_data 同格式，方便前端共用元件/型別。

ALTER TABLE issues ADD COLUMN IF NOT EXISTS description_image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE issues ADD COLUMN IF NOT EXISTS description_table_data JSONB;

-- 不需要 CHECK constraint：description 整組（文字＋圖片＋表格）本身是選填欄位，
-- issue 已經有 title 作為必填內容把關，跟 issue_updates 的「三者至少一項」邏輯不同。

-- ── 2. issue_updates：支援「修改」＋顯示最後修改時間 ───────────
-- null＝從未被修改過（前端顯示時 fallback：updated_at ?? created_at）；
-- 一旦被 PATCH 就寫入當下時間。

ALTER TABLE issue_updates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

-- ── 3. RLS 政策 ────────────────────────────────────────────────
-- 不需要新增/調整 RLS 政策：以上都是既有表的新欄位，沿用 add-tracker.sql 已設好的政策
-- （issues/issue_updates 皆為「authenticated 可讀，寫入一律走 API Route 的 Service Role」）。
-- 誰能做什麼（沿用現況，無變動）：
--   - SELECT：登入者皆可讀（部門隔離由 API Route 的 department_id 過濾負責，非 RLS 層）
--   - INSERT/UPDATE/DELETE：僅透過 API Route（Service Role）寫入，前端不直接寫入資料庫

-- ── 4. 舊資料相容性 ──────────────────────────────────────────
-- issues.description_image_urls：因 DEFAULT '[]'::jsonb，既有資料列不會是 null，
--   前端可安全 .map()／.length，不需額外 ?? [] 防護（但 API 回傳的舊資料若跳過本次
--   select 調整的角落仍可能缺這個 key，前端仍建議用 ?? [] 保底，比照 Step 41 的作法）。
-- issues.description_table_data：既有資料列維持 null，代表「無表格」。
-- issue_updates.updated_at：既有資料列維持 null，代表「從未被修改過」，前端顯示一律
--   fallback 用 updated_at ?? created_at，不需要额外 UPDATE 既有資料列回填。
-- 不需要額外的資料回填 UPDATE 語句。
