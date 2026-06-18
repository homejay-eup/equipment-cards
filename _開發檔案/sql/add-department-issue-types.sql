-- 每個部門獨立的任務類型與標籤
CREATE TABLE IF NOT EXISTS department_issue_types (
  department_id UUID PRIMARY KEY REFERENCES departments(id) ON DELETE CASCADE,
  types         JSONB NOT NULL DEFAULT '[]',
  tags          JSONB NOT NULL DEFAULT '[]',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
