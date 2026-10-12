-- Step 48：列印料卡獨立權限（print_cards）
-- 第一版只授予「管理員」角色；其他角色由管理員自行在「系統管理 → 角色管理」勾選。
-- 可安全重複執行（ON CONFLICT DO NOTHING）。
INSERT INTO role_permissions (role_id, permission_key)
SELECT id, 'print_cards' FROM roles WHERE name = '管理員'
ON CONFLICT DO NOTHING;
