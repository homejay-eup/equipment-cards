-- Step 38：維修資訊管理
-- 新增 3 張表：maintenance_vendors（廠商）、maintenance_rules（維修規則）、
-- maintenance_rule_equipment（規則↔料號多對多掛載，比照 Step30b card_documents 模式）。
-- 過時判斷（6 個月未更新/未確認 → 建議覆核）由 API 層依 last_updated_at / confirmed_at 計算，
-- 不在 DB 內存派生欄位。

-- ── 1. maintenance_vendors（廠商）──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_vendors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_code TEXT,                 -- 廠商代號，原表格式不一致，不加唯一性限制，允許重複/空白
  name TEXT NOT NULL,
  address TEXT,                     -- 地址（海外廠商用）
  contact_name TEXT,
  contact_phone TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ── 2. maintenance_rules（維修規則）─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS maintenance_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  vendor_id UUID NOT NULL REFERENCES maintenance_vendors(id) ON DELETE CASCADE,
  item TEXT NOT NULL,               -- 項目/型號名稱（自由文字，非料號）
  rule_type TEXT NOT NULL,          -- 限定值：送修規則／保固說明／報廢條件／其他（API 層驗證）
  content TEXT NOT NULL,
  warranty_start_date DATE,
  last_updated_at TIMESTAMPTZ DEFAULT now(),
  last_updated_by TEXT,
  confirmed_at TIMESTAMPTZ,
  confirmed_by TEXT,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_rules_vendor_id ON maintenance_rules(vendor_id);

-- ── 3. maintenance_rule_equipment（規則↔料號多對多掛載）────────────────────
CREATE TABLE IF NOT EXISTS maintenance_rule_equipment (
  rule_id UUID NOT NULL REFERENCES maintenance_rules(id) ON DELETE CASCADE,
  equipment_id TEXT NOT NULL REFERENCES equipment_cards(equipment_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (rule_id, equipment_id)
);

-- 反向查詢用索引（依料號查相關規則，供 GET /api/maintenance/rules/by-equipment 使用）
CREATE INDEX IF NOT EXISTS idx_maintenance_rule_equipment_equipment_id ON maintenance_rule_equipment(equipment_id);

-- ── 4. RLS：已登入使用者可讀，寫入一律走 service_role API（比照 documents 慣例，不開 write policy）──
ALTER TABLE maintenance_vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_rule_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY "maintenance_vendors_select" ON maintenance_vendors FOR SELECT TO authenticated USING (true);
CREATE POLICY "maintenance_rules_select" ON maintenance_rules FOR SELECT TO authenticated USING (true);
CREATE POLICY "maintenance_rule_equipment_select" ON maintenance_rule_equipment FOR SELECT TO authenticated USING (true);

-- 誰能做什麼：
--   - 讀取（SELECT）：所有已登入使用者（一般人員唯讀瀏覽廠商/規則清單）
--   - 新增/編輯/刪除廠商與規則、掛載/移除料號、標示已確認最新：一律透過 API Route 的
--     requirePermission('manage_maintenance_info') 檢查，API 用 service_role key 執行寫入，
--     不開放 anon/authenticated 角色直接寫入資料表（無 INSERT/UPDATE/DELETE policy）。
