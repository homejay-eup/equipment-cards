-- Step 39：維修資訊管理——實測回饋修正
-- 新增「保固期間」欄位（月數），沿用既有 warranty_start_date 欄位（不重新命名）

ALTER TABLE maintenance_rules ADD COLUMN IF NOT EXISTS warranty_period_months INT;

-- CHECK constraint：與 API 端驗證（0～1200 個月＝100 年）一致，資料庫層再把關一次防呆。
-- ALTER TABLE ... ADD CONSTRAINT 不支援 IF NOT EXISTS，用 DO $$ ... EXCEPTION 包起來讓重複執行不報錯
-- （寫法比照 step35-item-quantity.sql 的 quantity 範圍限制）
DO $$ BEGIN
  ALTER TABLE maintenance_rules
    ADD CONSTRAINT maintenance_rules_warranty_period_range
    CHECK (warranty_period_months IS NULL OR (warranty_period_months >= 0 AND warranty_period_months <= 1200));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
