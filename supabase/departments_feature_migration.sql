-- Departments Feature Migration
-- Applied: 2026-05-21
-- All tables were empty at time of migration — NOT NULL columns are safe.

-- 1. Uniforms: add department_id (uniforms are department-exclusive)
ALTER TABLE uniforms
  ADD COLUMN department_id uuid NOT NULL
  REFERENCES departments(id) ON DELETE RESTRICT;
-- RESTRICT: prevents deleting a department that still owns uniforms

CREATE INDEX IF NOT EXISTS idx_uniforms_department_id ON uniforms(department_id);

-- 2. Combinations: add department_id (one combination = one department)
ALTER TABLE combinations
  ADD COLUMN department_id uuid NOT NULL
  REFERENCES departments(id) ON DELETE RESTRICT;
-- RESTRICT: prevents deleting a department that still owns combinations

CREATE INDEX IF NOT EXISTS idx_combinations_department_id ON combinations(department_id);

-- 3. Departments: enforce unique name per branch
ALTER TABLE departments
  ADD CONSTRAINT departments_branch_name_unique UNIQUE (branch_id, name);

-- 4. New table: department_members
--    - Members have only a name (not system users)
--    - Can belong to multiple departments (separate row per membership)
--    - branch_id denormalised for efficient branch-scoped queries
--    - CASCADE on department delete (members are meaningless without department)
CREATE TABLE IF NOT EXISTS department_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  branch_id     uuid NOT NULL REFERENCES branches(id)   ON DELETE CASCADE,
  name          text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 100),
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_members_department ON department_members(department_id);
CREATE INDEX IF NOT EXISTS idx_dept_members_branch     ON department_members(branch_id);
