-- Fix: Add DEFAULT false to must_change_password so the handle_new_user trigger
-- can insert profiles without specifying this column.
-- The column was added without a DEFAULT, causing trigger inserts to fail with
-- "Database error creating new user" (NOT NULL constraint violation).

ALTER TABLE public.profiles
  ALTER COLUMN must_change_password SET DEFAULT false;

-- Also update the trigger to explicitly set must_change_password = false
-- on auto-created profiles (belt and suspenders).
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, email, role, branch_id, full_name, must_change_password)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'role', 'branch_leader'),
    (new.raw_user_meta_data->>'branch_id')::uuid,
    new.raw_user_meta_data->>'full_name',
    false
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
