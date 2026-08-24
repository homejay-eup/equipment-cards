-- Step 41：任務板更新紀錄支援貼圖/貼表格
-- issue_updates 從純文字留言升級為「文字＋可選圖片(多張)＋可選表格」複合留言

-- ── 1. 新增欄位 ──────────────────────────────────────────────

-- 圖片陣列：保留上傳順序，每個元素 { public_id, url }
-- 必須保留 public_id（刪除更新紀錄時要連動呼叫 Cloudinary API 刪除，只有 url 沒辦法刪）
ALTER TABLE issue_updates ADD COLUMN IF NOT EXISTS image_urls JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 表格結構化資料：{ rows: string[][], hasHeader: boolean }，允許 null 表示無表格
ALTER TABLE issue_updates ADD COLUMN IF NOT EXISTS table_data JSONB;

-- content 從必填改為選填：複合留言允許「只貼圖片沒打字」或「只貼表格沒打字」
ALTER TABLE issue_updates ALTER COLUMN content DROP NOT NULL;

-- ── 2. CHECK constraint：三者至少要有一個非空 ─────────────
-- 與 API 端（/api/issues/[id]/updates POST）驗證邏輯一致，資料庫層再把關一次。
-- ALTER TABLE ... ADD CONSTRAINT 不支援 IF NOT EXISTS，用 DO $$ ... EXCEPTION 包起來讓重複執行不報錯
-- （寫法比照 step39-maintenance-warranty-period.sql）
DO $$ BEGIN
  ALTER TABLE issue_updates
    ADD CONSTRAINT issue_updates_content_not_all_empty
    CHECK (
      (content IS NOT NULL AND btrim(content) <> '')
      OR image_urls <> '[]'::jsonb
      OR table_data IS NOT NULL
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── 3. 舊資料相容性 ────────────────────────────────────────
-- 既有留言（純文字）：image_urls 因 DEFAULT '[]'::jsonb 而不會是 null，table_data 維持 null。
-- 前端讀取時 image_urls 一律可安全 .map()／.length，不需額外的 ?? [] 防護；
-- table_data 為 null 時代表「無表格」，前端渲染前需判斷 table_data != null。
-- 不需要額外 UPDATE 既有資料列。
