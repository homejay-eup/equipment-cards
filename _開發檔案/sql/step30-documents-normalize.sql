-- Step 30（階段 1）：文件（規格書）資料正規化
-- equipment_cards.documents JSONB 欄位角色從「唯一資料來源」改為「唯讀快取」，
-- 真正的資料來源改為 documents 主檔 + card_documents 多對多對照表。
-- 現有讀取端（CardDetailDialog.tsx / PhotoWall.tsx / GET /api/cards）完全不用改，
-- 因為快取欄位格式維持 {name, url, type}[] 不變。

-- ── 1. documents 主檔 ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  drive_file_id TEXT NOT NULL,        -- Google Drive file ID；覆蓋上傳新版本時 ID 不變 → url 不變
  url TEXT NOT NULL,                  -- webViewLink，前端直接開啟
  uploaded_by TEXT,                   -- 上傳者 email（來自 requirePermission 的 session user）
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (drive_file_id)
);

-- ── 2. card_documents 對照表（多對多） ───────────────────────────────────
CREATE TABLE IF NOT EXISTS card_documents (
  equipment_id TEXT NOT NULL REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  PRIMARY KEY (equipment_id, document_id)
);

-- 反向查詢用索引（PK 是 (equipment_id, document_id) 組合，document_id 單獨查詢需要額外索引，
-- 例如「這份文件還有幾個關聯」「這份文件掛在哪些料號」）
CREATE INDEX IF NOT EXISTS idx_card_documents_document_id ON card_documents(document_id);

-- ── 3. RLS：全部登入者可讀，寫入一律走 service_role API（不開 write policy）─
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE card_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "documents_select" ON documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "card_documents_select" ON card_documents FOR SELECT TO authenticated USING (true);

-- ══════════════════════════════════════════════════════════════════════════
-- 4.（選用／一次性）從現有 equipment_cards.documents JSONB 遷移歷史資料
--
-- ⚠️ 執行前必讀：
--   1. 這段只能執行「一次」，且必須在 documents 表是空的狀態下執行
--      （執行前先跑 `SELECT count(*) FROM documents;` 確認為 0）。
--   2. drive_file_id 用正則從 url 擷取（支援 .../file/d/{id}/view 與 .../open?id={id}
--      兩種現有腳本（upload-spec-books.py / link-documents.ts）產生的 Drive 連結格式）。
--      若 url 不是這兩種格式，drive_file_id 會 fallback 成整個 url 字串（僅為滿足 NOT NULL，
--      該筆之後無法用 PATCH /api/documents/[id] 覆蓋版本，需要人工修正)。
--      執行後請跑下方「驗證」SQL 檢查有多少筆落入 fallback。
--   3. 同一個 url 出現在多張卡片時，只會建立一筆 documents 列，但會建立多筆 card_documents 關聯。
--   4. 這一步不會反過來更新 equipment_cards.documents 快取欄位——遷移前後該欄位內容本來就是
--      這批資料的原始來源，語意上仍然一致，不需要重算。
--
-- 若評估後覺得用 SQL 一次寫完風險較高（例如想先人工核對 drive_file_id 擷取結果），
-- 可以跳過這段，改在階段 2 改寫 upload-spec-books.py 時用 Python 腳本重新產生
-- documents/card_documents（該腳本本來就有完整的檔案級 metadata，來源更可靠)。

WITH expanded AS (
  SELECT
    ec.equipment_id,
    NULLIF(TRIM(doc->>'name'), '') AS name,
    NULLIF(TRIM(doc->>'type'), '') AS type,
    TRIM(doc->>'url') AS url
  FROM equipment_cards ec,
       jsonb_array_elements(COALESCE(ec.documents, '[]'::jsonb)) AS doc
  WHERE COALESCE(TRIM(doc->>'url'), '') <> ''
),
distinct_docs AS (
  SELECT DISTINCT ON (url)
    url,
    COALESCE(name, '未命名文件') AS name,
    COALESCE(type, '文件') AS type
  FROM expanded
  ORDER BY url, name
),
inserted_docs AS (
  INSERT INTO documents (name, type, drive_file_id, url)
  SELECT
    name,
    type,
    COALESCE(
      substring(url FROM '/d/([a-zA-Z0-9_-]+)'),      -- .../file/d/{id}/view
      substring(url FROM '[?&]id=([a-zA-Z0-9_-]+)'),  -- .../open?id={id}
      url                                              -- fallback：無法擷取時用整個 url 佔位
    ) AS drive_file_id,
    url
  FROM distinct_docs
  ON CONFLICT (drive_file_id) DO NOTHING
  RETURNING id, url
)
INSERT INTO card_documents (equipment_id, document_id)
SELECT DISTINCT e.equipment_id, d.id
FROM expanded e
JOIN inserted_docs d ON d.url = e.url
ON CONFLICT (equipment_id, document_id) DO NOTHING;

-- ── 驗證（遷移後手動執行檢查）──────────────────────────────────────────
-- 1. drive_file_id 擷取失敗（fallback 成 url 本身）的筆數，需人工確認/修正：
--   SELECT id, name, url, drive_file_id FROM documents WHERE drive_file_id = url;
-- 2. 遷移後每張卡片的關聯數，應與原本 jsonb_array_length(documents) 相符（允許因去重而變少，不應變多）：
--   SELECT ec.equipment_id,
--          jsonb_array_length(COALESCE(ec.documents, '[]'::jsonb)) AS before_count,
--          count(cd.document_id) AS after_count
--   FROM equipment_cards ec
--   LEFT JOIN card_documents cd ON cd.equipment_id = ec.equipment_id
--   GROUP BY ec.equipment_id, ec.documents
--   HAVING count(cd.document_id) > jsonb_array_length(COALESCE(ec.documents, '[]'::jsonb));
