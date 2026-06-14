-- Step 29-A: 刪除空的英文部門（角色已移至中文部門）
DELETE FROM departments
WHERE name IN ('admin', 'engineering', 'purchasing', 'sales', 'supply_chain', 'tech');

-- Step 29-B: 新增「記憶預設」欄位（Issue 2 需要）
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS custom_default_permissions   text[]   DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_default_assignable_role_names text[] DEFAULT NULL;
