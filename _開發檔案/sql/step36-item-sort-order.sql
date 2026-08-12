-- Step 36：「我的關注」群組 / 設備套餐 支援拖曳排序
-- 執行前注意：本檔案為一次性 migration，可安全重複執行：
--   - ADD COLUMN 用 IF NOT EXISTS
--   - backfill 的 UPDATE 用 WHERE sort_order IS NULL 條件包住，重複跑不會覆蓋已經手動排序過的資料
--   - SET NOT NULL 重複執行本身也是安全的（欄位已經是 NOT NULL 時再執行一次不會報錯）
--
-- ⚠️ 本檔案只是寫好放著，尚未在正式 Supabase 執行。請在 Supabase Dashboard 手動執行後，
--    才能部署依賴 group_items.sort_order / package_items.sort_order 的程式碼，
--    否則正式站「我的關注」與「設備套餐」的資料會整批讀不出來（Step 34 quantity 功能上線時已踩過一次同樣的坑）。

-- 1. 新增欄位（group_items / package_items）
ALTER TABLE group_items ADD COLUMN IF NOT EXISTS sort_order INTEGER;
ALTER TABLE package_items ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- 2. backfill：group_items 依 group_id 分組，組內依 equipment_id（料號）升序給初始排序值
UPDATE group_items gi
SET sort_order = ranked.rn * 1000
FROM (
  SELECT group_id, equipment_id,
         ROW_NUMBER() OVER (PARTITION BY group_id ORDER BY equipment_id) AS rn
  FROM group_items
) ranked
WHERE gi.group_id = ranked.group_id
  AND gi.equipment_id = ranked.equipment_id
  AND gi.sort_order IS NULL;

-- 3. backfill：package_items 同樣邏輯，依 package_id 分組
UPDATE package_items pi
SET sort_order = ranked.rn * 1000
FROM (
  SELECT package_id, equipment_id,
         ROW_NUMBER() OVER (PARTITION BY package_id ORDER BY equipment_id) AS rn
  FROM package_items
) ranked
WHERE pi.package_id = ranked.package_id
  AND pi.equipment_id = ranked.equipment_id
  AND pi.sort_order IS NULL;

-- 4. backfill：equipment_packages.sort_order 目前應該全部是 NULL（從未被使用過），
--    依「目前畫面上看到的顯示順序」給初始值：同部門內依名稱字母排序，
--    這樣接上拖曳排序後，使用者不會發現套餐清單「無緣無故洗牌」，只有真正拖曳過的部分才會改變。
UPDATE equipment_packages ep
SET sort_order = ranked.rn * 1000
FROM (
  SELECT id, department_id,
         ROW_NUMBER() OVER (PARTITION BY department_id ORDER BY name) AS rn
  FROM equipment_packages
) ranked
WHERE ep.id = ranked.id
  AND ep.sort_order IS NULL;

-- 5. backfill 完成後，group_items / package_items 兩個欄位改為 NOT NULL
--    （equipment_packages.sort_order 維持 nullable，這張表本來就是 nullable，不用改）
ALTER TABLE group_items ALTER COLUMN sort_order SET NOT NULL;
ALTER TABLE package_items ALTER COLUMN sort_order SET NOT NULL;
