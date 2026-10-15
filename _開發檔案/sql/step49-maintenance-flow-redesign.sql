-- Step 49：維修資訊頁面改為「回廠流程」視角
-- 執行順序：須在 step38、step39 之後執行；整份可重複執行（IF NOT EXISTS / DO 區塊 / 條件式 UPDATE）。
-- 本檔由使用者手動於正式 Supabase SQL Editor 執行，agent 不代為執行。
--
-- 誰能做什麼：
--   - maintenance_exit_options：已登入者可讀（SELECT policy）；寫入一律走
--     PUT /api/maintenance/options（service_role + requirePermission('manage_maintenance_info')）。
--   - maintenance_rules 既有 RLS 不變。

-- ── 1. maintenance_rules 欄位調整 ──────────────────────────────────────────
-- 廠商改選填（FK 與 ON DELETE CASCADE 維持）
ALTER TABLE maintenance_rules ALTER COLUMN vendor_id DROP NOT NULL;
-- 舊欄位 rule_type 不再必填，保留資料供回溯
ALTER TABLE maintenance_rules ALTER COLUMN rule_type DROP NOT NULL;

ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT '待歸類';
ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS sub_category TEXT;
ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS exit_option TEXT;
ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS age_limit_months INT;
ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS age_limit_basis TEXT;

DO $$ BEGIN
  ALTER TABLE maintenance_rules
    ADD CONSTRAINT maintenance_rules_stage_check
    CHECK (stage IN ('回廠', '檢測', '送修', '報廢', '待歸類'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE maintenance_rules
    ADD CONSTRAINT maintenance_rules_age_limit_range
    CHECK (age_limit_months IS NULL OR (age_limit_months >= 0 AND age_limit_months <= 1200));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_maintenance_rules_stage ON maintenance_rules(stage);

-- ── 2. 舊資料遷移（只處理尚為「待歸類」且 rule_type 有值者，重跑不覆蓋人工調整）──
-- 報廢條件 → 檢測／年限判斷
UPDATE maintenance_rules
   SET stage = '檢測', sub_category = '年限判斷'
 WHERE stage = '待歸類' AND rule_type = '報廢條件';

-- 送修規則、保固說明 → 送修／廠商送修
UPDATE maintenance_rules
   SET stage = '送修', sub_category = '廠商送修'
 WHERE stage = '待歸類' AND rule_type IN ('送修規則', '保固說明');

-- 其他 → 維持「待歸類」（不需處理，由使用者在畫面用批次「改區塊」整理）

-- ── 3. maintenance_exit_options（回廠區塊「處理後去向」選項）──────────────────
CREATE TABLE IF NOT EXISTS maintenance_exit_options (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE maintenance_exit_options ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "maintenance_exit_options_select" ON maintenance_exit_options
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

INSERT INTO maintenance_exit_options (label, sort_order) VALUES
  ('回一般流程', 0),
  ('結案', 1),
  ('跳到檢測', 2),
  ('跳到送修', 3),
  ('跳到報廢', 4)
ON CONFLICT (label) DO NOTHING;
