-- Gender-specific flow support.
-- New records require gender at the API/UI layer; columns stay nullable so legacy
-- pieces, looks, and assignments continue to load until they are edited/rebuilt.

ALTER TABLE public.uniforms
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female'));

ALTER TABLE public.combinations
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female'));

ALTER TABLE public.schedule_assignments
  ADD COLUMN IF NOT EXISTS gender text CHECK (gender IN ('male', 'female'));

ALTER TABLE public.schedule_assignments
  DROP CONSTRAINT IF EXISTS schedule_assignments_schedule_id_department_id_key;

ALTER TABLE public.schedule_assignments
  ADD CONSTRAINT schedule_assignments_schedule_department_gender_unique
  UNIQUE (schedule_id, department_id, gender);

CREATE INDEX IF NOT EXISTS idx_uniforms_department_gender
  ON public.uniforms(department_id, gender);

CREATE INDEX IF NOT EXISTS idx_combinations_department_gender
  ON public.combinations(department_id, gender);

CREATE INDEX IF NOT EXISTS idx_schedule_assignments_gender
  ON public.schedule_assignments(gender);
