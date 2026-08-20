-- Shared looks: a combination may be used by several departments.
--
-- Mirrors 005_shared_pieces.sql for combinations. The motivation is cost: a black suit
-- look built for Ushers previously had to be rebuilt — and re-rendered through the image
-- model — for Choir and Praise Team. One render is now reusable across departments.
--
-- Gender stays single-valued on combinations: a look is one outfit on one figure, and
-- making it multi-gender would mean a second render, not a saved one.

ALTER TABLE public.combinations
  ADD COLUMN IF NOT EXISTS department_ids  uuid[]  NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS all_departments boolean NOT NULL DEFAULT false;

-- Backfill from the single-valued column. Guarded so re-running is safe.
UPDATE public.combinations
  SET department_ids = ARRAY[department_id]
  WHERE cardinality(department_ids) = 0 AND department_id IS NOT NULL;

-- As in 005: dropping the RESTRICT foreign key is required, not cosmetic. It would
-- otherwise keep blocking department deletion for every pre-existing row.
--
-- NOTE: PostgREST derives its embedded-resource syntax from foreign keys, so dropping
-- this breaks any `departments(name)` embed on combinations. Those call sites resolve
-- department names from department_ids instead.
ALTER TABLE public.combinations
  ALTER COLUMN department_id DROP NOT NULL;
ALTER TABLE public.combinations
  DROP CONSTRAINT IF EXISTS combinations_department_id_fkey;

COMMENT ON COLUMN public.combinations.department_id IS
  'LEGACY — superseded by department_ids/all_departments. No longer read or written.';

CREATE INDEX IF NOT EXISTS idx_combinations_department_ids
  ON public.combinations USING GIN (department_ids);
CREATE INDEX IF NOT EXISTS idx_combinations_all_departments
  ON public.combinations (all_departments) WHERE all_departments;
