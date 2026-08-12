-- Step 35：群組/套餐內料號數量
-- 執行前注意：本檔案為一次性 migration 腳本，可安全重複執行。
-- 「我的關注」個人群組（group_items）與「設備套餐」（package_items）目前只是純粹的關聯表，
-- 沒有「需要幾個」的數量概念。使用者實務情境：同一款線材某台車可能要裝 4 條，
-- 需要在群組/套餐裡記錄數量。預設 1（相容既有資料，不用額外 backfill），範圍 1–999。

-- 1. 新增 quantity 欄位，預設 1（既有資料自動補上預設值，無需額外 migration 資料）
ALTER TABLE group_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;
ALTER TABLE package_items ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1;

-- 2. CHECK constraint：quantity 必須在 1–999 之間
--    ALTER TABLE ... ADD CONSTRAINT 不支援 IF NOT EXISTS，用 DO $$ ... EXCEPTION 包起來讓重複執行不報錯
DO $$ BEGIN
  ALTER TABLE group_items
    ADD CONSTRAINT group_items_quantity_range CHECK (quantity >= 1 AND quantity <= 999);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE package_items
    ADD CONSTRAINT package_items_quantity_range CHECK (quantity >= 1 AND quantity <= 999);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
