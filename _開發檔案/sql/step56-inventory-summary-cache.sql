-- Step 56：庫存彙總預先算好（2026-11-18）
-- 為什麼：庫存頁每次打開，資料庫都要把 7.5 萬筆明細現場「彙總」（inventory_summary 是個檢視），約佔開頁 3～4 秒的一大半。
-- 怎麼做：每輪庫存同步完，由公司電腦呼叫 refresh_inventory_summary() 把彙總結果存進 inventory_summary_cache（約 1～2 秒）；
--         網站讀預先算好的表。安全網：網站會比對「這份快取是以哪個時間的資料算的」，只要比目前生效資料舊（例如同步到一半、或快取沒更新成功），
--         就自動改讀原本的檢視（慢一點但一定是對的）。所以快取壞掉也不會讀到舊數字。
-- 內容完全是從 inventory_summary 複製，數字不會和現在不同。可重複執行。

CREATE TABLE IF NOT EXISTS inventory_summary_cache (
  id          BIGSERIAL PRIMARY KEY,   -- 分頁讀取時用它排序，確保每頁接得起來（不會重複或漏列）
  product_id  TEXT,
  category    TEXT,
  name        TEXT,
  warehouse   TEXT,
  region      TEXT,
  batch_key   TEXT,
  ok_count    BIGINT,
  bad_count   BIGINT,
  exported_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS inventory_summary_cache_wh_idx ON inventory_summary_cache (warehouse);

CREATE TABLE IF NOT EXISTS inventory_summary_meta (
  id             INT PRIMARY KEY DEFAULT 1,
  src_updated_at TIMESTAMPTZ,      -- 這份快取是以哪一刻的「生效資料」（inventory_batch_current 最新時間）算的
  built_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT inventory_summary_meta_one CHECK (id = 1)
);

ALTER TABLE inventory_summary_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_summary_meta  ENABLE ROW LEVEL SECURITY;   -- 沒有任何 policy＝只有 service_role 能讀寫（和其他庫存表一致）

CREATE OR REPLACE FUNCTION refresh_inventory_summary() RETURNS TIMESTAMPTZ
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE src TIMESTAMPTZ;
BEGIN
  SELECT max(updated_at) INTO src FROM inventory_batch_current;
  DELETE FROM inventory_summary_cache WHERE id > 0;   -- 資料庫有 pg_safeupdate：DELETE 一定要有 WHERE。同一個交易內換新：讀的人在這個函式提交前看到的還是舊的整份，不會看到一半
  INSERT INTO inventory_summary_cache (product_id, category, name, warehouse, region, batch_key, ok_count, bad_count, exported_at)
    SELECT product_id, category, name, warehouse, region, batch_key, ok_count, bad_count, exported_at FROM inventory_summary;
  INSERT INTO inventory_summary_meta (id, src_updated_at, built_at) VALUES (1, src, now())
    ON CONFLICT (id) DO UPDATE SET src_updated_at = EXCLUDED.src_updated_at, built_at = now();
  RETURN src;
END $$;
REVOKE ALL ON FUNCTION refresh_inventory_summary() FROM PUBLIC, anon, authenticated;   -- 只有 service_role（公司電腦同步程式）能呼叫

-- 第一次建好後手動跑一次：SELECT refresh_inventory_summary();
