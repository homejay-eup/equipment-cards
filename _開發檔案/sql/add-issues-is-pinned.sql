-- 公佈欄功能：為 issues 資料表加入 is_pinned 欄位
-- 執行時機：Step（公佈欄功能）
-- 執行方式：Supabase SQL Editor

ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_pinned boolean DEFAULT false;
