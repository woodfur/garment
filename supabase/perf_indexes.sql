-- Performance: add branch_id indexes to all branch-scoped tables
-- Applied: 2026-05-21
-- Previously only PK/unique indexes existed; all branch_id filters were full table scans.

CREATE INDEX IF NOT EXISTS idx_uniforms_branch_id
  ON uniforms(branch_id);

CREATE INDEX IF NOT EXISTS idx_combinations_branch_id
  ON combinations(branch_id);

-- Compound index covers both WHERE branch_id = ? AND ORDER BY service_date
CREATE INDEX IF NOT EXISTS idx_schedules_branch_date
  ON schedules(branch_id, service_date);

-- Compound index covers WHERE branch_id = ? AND is_published = true
CREATE INDEX IF NOT EXISTS idx_announcements_branch_published
  ON announcements(branch_id, is_published);

CREATE INDEX IF NOT EXISTS idx_inventory_branch_id
  ON inventory_items(branch_id);

-- Covers profiles WHERE branch_id = ? (used in admin branch leader queries)
CREATE INDEX IF NOT EXISTS idx_profiles_branch_id
  ON profiles(branch_id);
