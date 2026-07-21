-- Step 34：設備套餐（部門共享群組）
-- 執行前注意：本檔案為一次性建表腳本，可安全重複執行（皆用 IF NOT EXISTS / ON CONFLICT DO NOTHING）。
-- 不對 user_groups/group_items 做結構性變更以外的異動（僅補 updated_at 欄位供對齊機制比對用）。

-- 1. 部門共享套餐主表
CREATE TABLE IF NOT EXISTS equipment_packages (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  department_id     UUID NOT NULL REFERENCES departments(id),
  source_group_id   UUID REFERENCES user_groups(id) ON DELETE SET NULL,
  source_synced_at  TIMESTAMPTZ,
  sort_order        INTEGER,
  created_by        TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (department_id, name)
);

-- 2. 套餐內的料卡（比照 group_items）
CREATE TABLE IF NOT EXISTS package_items (
  package_id    UUID NOT NULL REFERENCES equipment_packages(id) ON DELETE CASCADE,
  equipment_id  TEXT NOT NULL,
  added_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, equipment_id)
);

-- 3. 套餐分享給哪些其他部門（多對多）
CREATE TABLE IF NOT EXISTS package_shared_departments (
  package_id     UUID NOT NULL REFERENCES equipment_packages(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  shared_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (package_id, department_id)
);

-- 4. RLS：內部資料，全鎖不開放 authenticated 直接讀寫（比照 Step 31/32 的作法）
--    所有讀寫一律經過 API Route，用 service_role 存取並在程式碼層做部門過濾（比照 issues 表模式）
ALTER TABLE equipment_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE package_shared_departments ENABLE ROW LEVEL SECURITY;

-- 5. 「我的關注」群組補上 updated_at 欄位（若尚未存在），供「來源對齊機制」比對是否有新版本
ALTER TABLE user_groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 6. 常用查詢索引
CREATE INDEX IF NOT EXISTS idx_equipment_packages_department_id ON equipment_packages(department_id);
CREATE INDEX IF NOT EXISTS idx_package_items_equipment_id ON package_items(equipment_id);
CREATE INDEX IF NOT EXISTS idx_package_shared_departments_department_id ON package_shared_departments(department_id);

-- 6b. 「一個群組最多連結一份套餐」在應用層只有「先查後擋」，存在併發競態窗口
--     （兩個並發請求可同時通過檢查，各自 insert 出兩筆都指向同一個 source_group_id 的套餐）。
--     加 partial unique index 讓 DB 層真正把關，POST /api/packages 遇到 23505 時
--     比照既有 name 衝突的處理方式，查詢並回傳既有套餐 id。
CREATE UNIQUE INDEX IF NOT EXISTS equipment_packages_source_group_id_unique
  ON equipment_packages(source_group_id) WHERE source_group_id IS NOT NULL;

-- 7. 管理員角色預設授予 4 個新權限（其他角色由管理員自行在角色管理頁勾選）
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'view_own_packages' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'edit_own_packages' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'share_own_packages' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'view_shared_packages' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
