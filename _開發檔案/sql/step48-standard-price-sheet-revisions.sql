-- Step 48b：標準售價價目表「細節修改」與修改紀錄
-- 版本（生效月份）≠ 細節修改：現行版本可直接「儲存修改」覆蓋內容，不新增版本；
-- 每次修改前後的內容都留在 standard_price_sheet_revisions，可查看與還原。
-- 可安全重複執行。

ALTER TABLE standard_price_sheets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ; -- 最後細節修改時間（NULL＝上傳後未修改過）
ALTER TABLE standard_price_sheets ADD COLUMN IF NOT EXISTS updated_by TEXT;        -- 最後細節修改者 email

CREATE TABLE IF NOT EXISTS standard_price_sheet_revisions (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id  UUID NOT NULL REFERENCES standard_price_sheets(id) ON DELETE CASCADE,
  html      TEXT NOT NULL,           -- 該次存檔後的完整內容
  saved_by  TEXT,                    -- 誰存的（email）
  saved_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  note      TEXT                     -- 例如「上傳原始內容」「細節修改」「還原至 …」
);

CREATE INDEX IF NOT EXISTS standard_price_sheet_revisions_sheet_idx ON standard_price_sheet_revisions (sheet_id, saved_at DESC);

-- RLS：全鎖，一律經 /api/standard-prices/sheets* 用 service_role 讀寫
ALTER TABLE standard_price_sheet_revisions ENABLE ROW LEVEL SECURITY;

-- 儲存修改（單一交易）：
-- 1. 鎖定該版本，比對 p_base（編輯器開啟時看到的 updated_at，沒修改過則為 created_at），不同＝已被別人改過 → 'conflict'
-- 2. 第一次修改時，先把上傳時的原始內容存成第一筆紀錄，之後才能還原回去
-- 3. 更新內容，並把這次的內容存成一筆紀錄
CREATE OR REPLACE FUNCTION update_standard_price_sheet(
  p_id UUID, p_html TEXT, p_title TEXT, p_user TEXT, p_note TEXT, p_base TIMESTAMPTZ
) RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  s standard_price_sheets%ROWTYPE;
BEGIN
  SELECT * INTO s FROM standard_price_sheets WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF p_base IS NOT NULL AND COALESCE(s.updated_at, s.created_at) <> p_base THEN RETURN 'conflict'; END IF;

  IF NOT EXISTS (SELECT 1 FROM standard_price_sheet_revisions WHERE sheet_id = p_id) THEN
    INSERT INTO standard_price_sheet_revisions (sheet_id, html, saved_by, saved_at, note)
    VALUES (p_id, s.html, s.uploaded_by, s.created_at, '上傳原始內容');
  END IF;

  UPDATE standard_price_sheets
     SET html = p_html, title = COALESCE(NULLIF(p_title, ''), title), updated_at = now(), updated_by = p_user
   WHERE id = p_id;

  INSERT INTO standard_price_sheet_revisions (sheet_id, html, saved_by, note)
  VALUES (p_id, p_html, p_user, p_note);

  RETURN 'ok';
END;
$$;

-- 只給 service_role 呼叫（API 已檢查權限），一般登入者不能直接透過 RPC 改資料
REVOKE ALL ON FUNCTION update_standard_price_sheet(UUID, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
