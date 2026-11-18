-- Step 57：把整份彙總打包成一筆（2026-11-18）
-- 為什麼：資料庫一次最多回 1,000 列，3,900 多列要分 4～5 頁、來回兩輪，約 2 秒。打包成一筆就只要一次來回。
-- 只新增一個欄位＋更新函式；沒有 payload（或比實際庫存舊）時網站會自動退回分頁讀取／現算，數字不會錯。可重複執行。
ALTER TABLE inventory_summary_meta ADD COLUMN IF NOT EXISTS payload JSONB;

CREATE OR REPLACE FUNCTION refresh_inventory_summary() RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src TIMESTAMPTZ; pl JSONB;
BEGIN
  SELECT max(updated_at) INTO src FROM inventory_batch_current;
  DELETE FROM inventory_summary_cache WHERE id > 0;
  INSERT INTO inventory_summary_cache (product_id, category, name, warehouse, region, batch_key, ok_count, bad_count, exported_at)
    SELECT product_id, category, name, warehouse, region, batch_key, ok_count, bad_count, exported_at FROM inventory_summary;
  SELECT COALESCE(jsonb_agg(jsonb_build_array(product_id, category, name, warehouse, region, ok_count, bad_count) ORDER BY id), '[]'::jsonb) INTO pl FROM inventory_summary_cache;
  INSERT INTO inventory_summary_meta (id, src_updated_at, built_at, payload) VALUES (1, src, now(), pl)
    ON CONFLICT (id) DO UPDATE SET src_updated_at = EXCLUDED.src_updated_at, built_at = now(), payload = EXCLUDED.payload;
  RETURN src;
END $$;
REVOKE ALL ON FUNCTION refresh_inventory_summary() FROM PUBLIC, anon, authenticated;

SELECT refresh_inventory_summary();
SELECT jsonb_array_length(payload) AS n FROM inventory_summary_meta WHERE id = 1;
