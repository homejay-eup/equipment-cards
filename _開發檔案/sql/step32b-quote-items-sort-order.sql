-- Step 32 補充：報價查詢品項支援手動拖拉排序
-- 可安全重複執行（IF NOT EXISTS / 只在 sort_order 全空時才backfill）

ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 初始排序：同分類內依名稱排序後，間隔 1000 backfill（僅在該分類全部為 NULL 時才處理，避免蓋掉已手動排序過的資料）
DO $$
DECLARE
  cat TEXT;
BEGIN
  FOR cat IN SELECT DISTINCT category FROM quote_items LOOP
    IF NOT EXISTS (
      SELECT 1 FROM quote_items WHERE category = cat AND sort_order IS NOT NULL
    ) THEN
      WITH ranked AS (
        SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
        FROM quote_items WHERE category = cat
      )
      UPDATE quote_items
      SET sort_order = ranked.rn * 1000
      FROM ranked
      WHERE quote_items.id = ranked.id;
    END IF;
  END LOOP;
END $$;
