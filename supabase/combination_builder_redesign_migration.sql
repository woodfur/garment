-- Combination Builder Redesign Migration
-- Applied: 2026-05-21

-- Phase 1a: Extend combinations with AI preview columns
ALTER TABLE combinations
  ADD COLUMN IF NOT EXISTS male_composite_url   text,
  ADD COLUMN IF NOT EXISTS female_composite_url  text,
  ADD COLUMN IF NOT EXISTS male_gif_url          text,
  ADD COLUMN IF NOT EXISTS female_gif_url        text,
  ADD COLUMN IF NOT EXISTS preview_status        text NOT NULL DEFAULT 'none'
    CHECK (preview_status IN ('none','processing','ready','failed'));

-- Phase 1b: body_zone ENUM (extensible via ALTER TYPE ... ADD VALUE)
DO $$ BEGIN
  CREATE TYPE body_zone AS ENUM (
    'head','top','outer','bottom','footwear',
    'accessory_neck','accessory_wrist_left',
    'accessory_wrist_right','accessory_belt',
    'accessory_chest_pin','accessory_bag'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Phase 1c: Zone-based combination items (replaces canvas-based combination_items)
-- combination_items remains for backward-compat with old canvas combinations
CREATE TABLE IF NOT EXISTS combination_zone_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id uuid NOT NULL REFERENCES combinations(id) ON DELETE CASCADE,
  gender         text NOT NULL CHECK (gender IN ('male','female')),
  zone           body_zone NOT NULL,
  uniform_id     uuid NOT NULL REFERENCES uniforms(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (combination_id, gender, zone)
);

CREATE INDEX IF NOT EXISTS idx_czitems_combination ON combination_zone_items(combination_id);

-- Phase 1d: Replicate job tracking for async AI pipeline
CREATE TABLE IF NOT EXISTS replicate_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combination_id    uuid REFERENCES combinations(id) ON DELETE CASCADE,
  prediction_id     text NOT NULL,
  job_type          text NOT NULL,
  gender            text CHECK (gender IN ('male','female')),
  sequence_index    int NOT NULL DEFAULT 0,
  total_steps       int NOT NULL DEFAULT 1,
  current_image_url text,
  next_uniform_id   uuid REFERENCES uniforms(id) ON DELETE SET NULL,
  status            text DEFAULT 'pending',
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_replicate_jobs_combination ON replicate_jobs(combination_id);
CREATE INDEX IF NOT EXISTS idx_replicate_jobs_prediction  ON replicate_jobs(prediction_id);

-- Phase 1e: Multi-department schedule assignments
-- schedules.combination_id remains (legacy single assignment), new junction table for multi-dept
CREATE TABLE IF NOT EXISTS schedule_assignments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id    uuid NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
  department_id  uuid NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  combination_id uuid NOT NULL REFERENCES combinations(id) ON DELETE CASCADE,
  created_at     timestamptz DEFAULT now(),
  UNIQUE (schedule_id, department_id)
);

CREATE INDEX IF NOT EXISTS idx_sched_assignments_schedule ON schedule_assignments(schedule_id);
CREATE INDEX IF NOT EXISTS idx_sched_assignments_dept     ON schedule_assignments(department_id);
