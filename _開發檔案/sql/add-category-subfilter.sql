-- Step 28: 分類次級篩選標籤
-- 執行環境：Supabase Dashboard > SQL Editor

-- 1. 建立次級篩選標籤設定表
CREATE TABLE IF NOT EXISTS category_subfilter_tags (
  id          SERIAL PRIMARY KEY,
  category    TEXT NOT NULL,
  tag         TEXT NOT NULL,
  sort_order  INT DEFAULT 0,
  UNIQUE(category, tag)
);

-- 2. 啟用 RLS
ALTER TABLE category_subfilter_tags ENABLE ROW LEVEL SECURITY;

-- 3. 登入使用者可讀
CREATE POLICY "authenticated can read subfilter tags"
  ON category_subfilter_tags FOR SELECT
  TO authenticated USING (true);

-- 4. service_role 可完整操作（API Routes 使用 service_role key）
CREATE POLICY "service_role can write subfilter tags"
  ON category_subfilter_tags FOR ALL
  TO service_role USING (true);

-- 5. 管理員角色加入新權限
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'manage_subfilter_tags' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
