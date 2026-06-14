-- ============================================================
-- Step 28：修正部門角色分配
-- 問題：採購/工程等 member 角色與管理員在同一個 department
--       導致不同部門的人互看任務板
-- 執行地點：Supabase Dashboard → SQL Editor
-- 建議分兩段執行，先執行第一段，確認結果後再執行第二段
-- ============================================================

-- ═══════════════════════════════════════════════════
-- 第一段：建立正確部門 + 修正角色的 department_id
-- ═══════════════════════════════════════════════════

-- 1. 建立各部門（已存在的不重複建）
INSERT INTO departments (name) VALUES
  ('管理'),
  ('採購'),
  ('工程'),
  ('業務'),
  ('技師'),
  ('供應鏈')
ON CONFLICT (name) DO NOTHING;

-- 2. 將每個角色指派到正確的部門
--    管理員(採購) 與 採購 → 同一個「採購」部門（這是核心修正）
UPDATE roles r
SET department_id = d.id
FROM departments d
WHERE
  (r.name = '管理員'       AND d.name = '管理')
  OR (r.name = '管理員(採購)'   AND d.name = '採購')
  OR (r.name = '採購'           AND d.name = '採購')
  OR (r.name = '管理員(工程)'   AND d.name = '工程')
  OR (r.name = '工程'           AND d.name = '工程')
  OR (r.name = '管理員(業務)'   AND d.name = '業務')
  OR (r.name = '業務'           AND d.name = '業務')
  OR (r.name = '管理員(技師)'   AND d.name = '技師')
  OR (r.name = '技師'           AND d.name = '技師')
  OR (r.name = '管理員(供應鏈)' AND d.name = '供應鏈')
  OR (r.name = '供應鏈'         AND d.name = '供應鏈');

-- 3. 確認結果（先檢查，再繼續）
SELECT r.name, r.level, d.name AS dept_name
FROM roles r
LEFT JOIN departments d ON d.id = r.department_id
ORDER BY r.name;


-- ═══════════════════════════════════════════════════
-- 第二段：修正現有議題的 department_id
-- 將每筆議題的部門改為「建立者目前角色的部門」
-- 效果：管理員建立的舊議題移到管理部門，採購的移到採購部門
-- ⚠ 執行後各部門只會看到各自的議題（不再混在一起）
-- ═══════════════════════════════════════════════════

UPDATE issues i
SET department_id = r.department_id
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND r.department_id IS NOT NULL
  AND (i.department_id IS DISTINCT FROM r.department_id);

-- 確認議題修正結果
SELECT i.title, i.created_by, d.name AS dept_name
FROM issues i
LEFT JOIN departments d ON d.id = i.department_id
ORDER BY i.created_at DESC
LIMIT 20;
