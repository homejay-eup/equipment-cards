-- ============================================================
-- 修正：dept_admin 角色的 department_id 未對齊同部門 member 角色
-- 效果：管理員(採購)+採購、管理員(工程)+工程 ... 共享同一任務板
-- 執行地點：Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. 診斷查詢（可先執行確認現況） ─────────────────────────
-- SELECT r.name, r.level, r.department_id, d.name AS dept_name
-- FROM roles r
-- LEFT JOIN departments d ON d.id = r.department_id
-- ORDER BY r.name;

-- ── 2. 修正 dept_admin 角色的 department_id ────────────────
-- 將每個 管理員(*) 角色的 department_id 對齊對應 member 角色
-- 僅在不一致時更新（安全執行，無副作用）

UPDATE roles r_admin
SET department_id = r_member.department_id
FROM roles r_member
WHERE (r_admin.name, r_member.name) IN (
  ('管理員(採購)',   '採購'),
  ('管理員(工程)',   '工程'),
  ('管理員(業務)',   '業務'),
  ('管理員(技師)',   '技師'),
  ('管理員(供應鏈)', '供應鏈')
)
  AND r_member.department_id IS NOT NULL
  AND (r_admin.department_id IS NULL
       OR r_admin.department_id != r_member.department_id);

-- ── 3. 修正歷史議題的 department_id（可選） ────────────────
-- 若 dept_admin 過去在錯誤部門建立了議題，執行下方 SQL 將其歸回正確部門
-- 邏輯：議題 created_by = 某 dept_admin 使用者 → 改為該角色目前所屬部門

UPDATE issues i
SET department_id = r.department_id
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND r.level = 'dept_admin'
  AND r.department_id IS NOT NULL
  AND (i.department_id IS NULL
       OR i.department_id != r.department_id);

-- ── 4. 確認修正結果 ─────────────────────────────────────────
-- SELECT r.name, r.level, r.department_id, d.name AS dept_name
-- FROM roles r
-- LEFT JOIN departments d ON d.id = r.department_id
-- ORDER BY r.name;
