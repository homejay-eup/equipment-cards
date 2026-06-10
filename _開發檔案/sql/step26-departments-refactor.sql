-- Step 26: 部門資料表重構（dept_group TEXT → departments + department_id UUID FK）

-- 1. 建立 departments 資料表
CREATE TABLE IF NOT EXISTS departments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;

-- 所有已登入使用者可讀取（API 用 service_role 寫入，不需寫入 policy）
CREATE POLICY "departments_select"
  ON departments FOR SELECT TO authenticated USING (true);

-- 2. 從 roles.dept_group 建立初始部門清單
INSERT INTO departments (name)
SELECT DISTINCT dept_group FROM roles WHERE dept_group IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- 3. roles 加入 department_id FK
ALTER TABLE roles
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- 4. 回填 roles.department_id
UPDATE roles r
SET department_id = d.id
FROM departments d
WHERE r.dept_group = d.name;

-- 5. issues 加入 department_id FK
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES departments(id) ON DELETE SET NULL;

-- 6. 回填 issues.department_id
UPDATE issues i
SET department_id = d.id
FROM departments d
WHERE i.dept_group = d.name;

-- 7. 更新 issues RLS（使用 department_id）
DROP POLICY IF EXISTS "group scoped tracker" ON issues;
CREATE POLICY "group scoped tracker"
  ON issues FOR ALL
  USING (
    department_id IS NOT DISTINCT FROM (
      SELECT r.department_id
      FROM profiles p
      JOIN roles r ON r.name = p.role
      WHERE p.id = auth.uid()
    )
  )
  WITH CHECK (
    department_id IS NOT DISTINCT FROM (
      SELECT r.department_id
      FROM profiles p
      JOIN roles r ON r.name = p.role
      WHERE p.id = auth.uid()
    )
  );

-- 8. 移除舊欄位
ALTER TABLE roles DROP COLUMN IF EXISTS dept_group;
ALTER TABLE issues DROP COLUMN IF EXISTS dept_group;
