-- Step 45：equipment_cards 備註欄位支援複合內容（文字＋圖片＋表格）
-- 比照任務板 Step 41/42 的 issues.description_image_urls / description_table_data 設計。
-- 舊資料相容性：
--   notes_image_urls 預設 '[]'::jsonb（非 NULL），既有 786 筆料卡的備註視為「只有文字、無圖片」，
--     前端讀取時直接當空陣列處理，不需要額外 migration 逐筆補值。
--   notes_table_data 預設 NULL，既有資料視為「無表格」。
-- 執行方式：使用者於正式 Supabase SQL Editor 手動執行，非本次程式自動執行。

ALTER TABLE equipment_cards
  ADD COLUMN IF NOT EXISTS notes_image_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS notes_table_data jsonb DEFAULT NULL;
