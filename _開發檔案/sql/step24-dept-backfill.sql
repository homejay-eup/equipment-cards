-- Step 24：回填現有 issues.dept_group
-- 背景：Step 23 SQL 中的回填邏輯使用 profiles 表，本專案使用 allowed_emails
-- 此版本為正確版本，冪等（只補 dept_group IS NULL 的 rows）
-- 執行前提：Step 23 已執行（issues.dept_group 欄位已存在）

UPDATE issues i
SET dept_group = r.dept_group
FROM allowed_emails ae
JOIN roles r ON r.name = ae.role
WHERE i.created_by = ae.email
  AND i.dept_group IS NULL;
