-- Full-body dress support for uniforms and combination builder zones.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'body_zone'
      AND n.nspname = 'public'
  ) THEN
    ALTER TYPE public.body_zone ADD VALUE IF NOT EXISTS 'full_body';
  END IF;
END $$;

ALTER TABLE public.uniforms
  DROP CONSTRAINT IF EXISTS uniforms_category_check;

ALTER TABLE public.uniforms
  ADD CONSTRAINT uniforms_category_check
  CHECK (category IN ('top','bottom','footwear','accessory','outer','head','full_body'));
