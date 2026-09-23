-- Step 46b：標準售價改為獨立權限（view_standard_prices / edit_standard_prices）
-- 第一版只授予「管理員」角色；其他角色由管理員自行在「系統管理 → 角色管理」勾選。
-- 可安全重複執行（ON CONFLICT DO NOTHING）。
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'view_standard_prices' FROM roles WHERE name = '管理員'
UNION ALL SELECT id, 'edit_standard_prices' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
