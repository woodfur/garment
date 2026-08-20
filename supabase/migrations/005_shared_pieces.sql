-- Shared pieces: a uniform may belong to several departments and both genders.
--
-- Replaces the original "uniforms are department-exclusive" model. A white shirt worn by
-- almost every department was previously impossible to express without duplicating the
-- piece once per department.
--
-- Matching rule used by the app:
--   department matches when all_departments = true OR the id is in department_ids
--   gender     matches when the gender is in genders

ALTER TABLE public.uniforms
  ADD COLUMN IF NOT EXISTS department_ids  uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS genders         text[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS all_departments boolean NOT NULL DEFAULT false;

-- Backfill from the single-valued columns. Guarded so re-running is safe.
UPDATE public.uniforms
  SET department_ids = ARRAY[department_id]
  WHERE cardinality(department_ids) = 0 AND department_id IS NOT NULL;

UPDATE public.uniforms
  SET genders = ARRAY[gender]
  WHERE cardinality(genders) = 0 AND gender IS NOT NULL;

-- Only the two supported values may appear. '{}' passes, and is rejected at the API layer
-- instead, so existing rows with no gender do not block the migration.
ALTER TABLE public.uniforms
  DROP CONSTRAINT IF EXISTS uniforms_genders_valid;
ALTER TABLE public.uniforms
  ADD CONSTRAINT uniforms_genders_valid
  CHECK (genders <@ ARRAY['male', 'female']::text[]);

-- The legacy single-value columns are no longer read or written by the app.
--
-- Dropping the NOT NULL and the RESTRICT foreign key is required, not cosmetic: the FK
-- would otherwise keep blocking department deletion for every pre-existing row, no matter
-- what the application code does.
ALTER TABLE public.uniforms
  ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE public.uniforms
  DROP CONSTRAINT IF EXISTS uniforms_department_id_fkey;

COMMENT ON COLUMN public.uniforms.department_id IS
  'LEGACY — superseded by department_ids/all_departments. No longer read or written.';
COMMENT ON COLUMN public.uniforms.gender IS
  'LEGACY — superseded by genders. No longer read or written.';

CREATE INDEX IF NOT EXISTS idx_uniforms_department_ids
  ON public.uniforms USING GIN (department_ids);
CREATE INDEX IF NOT EXISTS idx_uniforms_genders
  ON public.uniforms USING GIN (genders);
CREATE INDEX IF NOT EXISTS idx_uniforms_all_departments
  ON public.uniforms (all_departments) WHERE all_departments;
