-- ============================================================
-- Polar — Phase 1 Schema Migration
-- Run this in Supabase SQL Editor (or via supabase db push)
-- ============================================================

-- ── Extensions ──────────────────────────────────────────────
create extension if not exists "pgcrypto";

-- ── Branches ────────────────────────────────────────────────
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  view_code   text unique not null,
  created_at  timestamptz default now()
);

-- ── Profiles ────────────────────────────────────────────────
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text not null,
  full_name   text,
  role        text check (role in ('super_admin', 'branch_leader')) not null,
  branch_id   uuid references branches(id) on delete set null,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- ── Invitations ──────────────────────────────────────────────
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  email       text not null,
  branch_id   uuid not null references branches(id) on delete cascade,
  role        text default 'branch_leader',
  status      text default 'pending' check (status in ('pending','accepted','expired')),
  expires_at  timestamptz not null,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── Departments ──────────────────────────────────────────────
create table if not exists departments (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz default now()
);

-- ── Uniforms ─────────────────────────────────────────────────
create table if not exists uniforms (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null references branches(id) on delete cascade,
  name             text not null,
  category         text not null check (category in ('top','bottom','footwear','accessory','outer','head')),
  image_url        text,
  raw_image_url    text,
  storage_path     text,
  description      text,
  is_archived      boolean default false,
  bg_removed       boolean default false,
  created_at       timestamptz default now()
);

-- ── Combinations ─────────────────────────────────────────────
create table if not exists combinations (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null references branches(id) on delete cascade,
  name        text not null,
  description text,
  canvas_data jsonb,
  preview_url text,
  created_by  uuid references profiles(id) on delete set null,
  created_at  timestamptz default now()
);

-- ── Combination Items ─────────────────────────────────────────
create table if not exists combination_items (
  id             uuid primary key default gen_random_uuid(),
  combination_id uuid not null references combinations(id) on delete cascade,
  uniform_id     uuid not null references uniforms(id) on delete restrict,
  layer_order    int not null,
  x              float default 0,
  y              float default 0,
  scale_x        float default 1,
  scale_y        float default 1,
  rotation       float default 0,
  created_at     timestamptz default now()
);

-- ── Schedules ─────────────────────────────────────────────────
create table if not exists schedules (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id) on delete cascade,
  combination_id uuid references combinations(id) on delete set null,
  service_date   date not null,
  title          text not null,
  notes          text,
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz default now()
);

-- ── Inventory Items ───────────────────────────────────────────
create table if not exists inventory_items (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references branches(id) on delete cascade,
  uniform_id     uuid not null references uniforms(id) on delete cascade,
  quantity       int default 0,
  unit           text default 'pieces',
  reorder_level  int default 0,
  updated_at     timestamptz default now(),
  unique(branch_id, uniform_id)
);

-- ── Inventory Transactions ────────────────────────────────────
create table if not exists inventory_transactions (
  id                uuid primary key default gen_random_uuid(),
  branch_id         uuid not null references branches(id) on delete cascade,
  inventory_item_id uuid not null references inventory_items(id) on delete cascade,
  change_amount     int not null,
  reason            text,
  created_by        uuid references profiles(id) on delete set null,
  created_at        timestamptz default now()
);

-- ── Announcements ─────────────────────────────────────────────
create table if not exists announcements (
  id           uuid primary key default gen_random_uuid(),
  branch_id    uuid not null references branches(id) on delete cascade,
  title        text not null,
  body         text,
  is_published boolean default false,
  created_by   uuid references profiles(id) on delete set null,
  created_at   timestamptz default now()
);

-- ── Audit Logs ────────────────────────────────────────────────
create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid references branches(id) on delete set null,
  user_id     uuid references profiles(id) on delete set null,
  action      text not null,
  table_name  text,
  record_id   uuid,
  metadata    jsonb,
  created_at  timestamptz default now()
);

-- ============================================================
-- AUTO-CREATE PROFILE TRIGGER
-- ============================================================
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into profiles (id, email, role, branch_id, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'role', 'branch_leader'),
    (new.raw_user_meta_data->>'branch_id')::uuid,
    new.raw_user_meta_data->>'full_name'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table branches enable row level security;
alter table profiles enable row level security;
alter table invitations enable row level security;
alter table departments enable row level security;
alter table uniforms enable row level security;
alter table combinations enable row level security;
alter table combination_items enable row level security;
alter table schedules enable row level security;
alter table inventory_items enable row level security;
alter table inventory_transactions enable row level security;
alter table announcements enable row level security;
alter table audit_logs enable row level security;

-- Helper function: get calling user's branch_id
create or replace function get_my_branch_id()
returns uuid as $$
  select branch_id from profiles where id = auth.uid();
$$ language sql security definer stable;

-- Helper function: get calling user's role
create or replace function get_my_role()
returns text as $$
  select role from profiles where id = auth.uid();
$$ language sql security definer stable;

-- ── Profiles policies ────────────────────────────────────────
create policy "users can read own profile"
  on profiles for select using (auth.uid() = id);

create policy "users can update own profile"
  on profiles for update using (auth.uid() = id);

-- ── Branches policies ────────────────────────────────────────
create policy "branch leaders read own branch"
  on branches for select
  using (id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Departments policies ──────────────────────────────────────
create policy "branch scoped departments"
  on departments for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Uniforms policies ─────────────────────────────────────────
create policy "branch scoped uniforms"
  on uniforms for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Combinations policies ─────────────────────────────────────
create policy "branch scoped combinations"
  on combinations for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Combination items policies ────────────────────────────────
create policy "branch scoped combination items"
  on combination_items for all
  using (
    combination_id in (
      select id from combinations
      where branch_id = get_my_branch_id() or get_my_role() = 'super_admin'
    )
  );

-- ── Schedules policies ────────────────────────────────────────
create policy "branch scoped schedules"
  on schedules for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Inventory policies ────────────────────────────────────────
create policy "branch scoped inventory items"
  on inventory_items for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

create policy "branch scoped inventory transactions"
  on inventory_transactions for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Announcements policies ────────────────────────────────────
create policy "branch scoped announcements"
  on announcements for all
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

-- ── Audit logs policies ───────────────────────────────────────
create policy "branch scoped audit logs"
  on audit_logs for select
  using (branch_id = get_my_branch_id() or get_my_role() = 'super_admin');

create policy "insert audit logs"
  on audit_logs for insert with check (true);

-- ============================================================
-- STORAGE BUCKET SETUP
-- Run these separately if using Supabase Dashboard
-- ============================================================
-- insert into storage.buckets (id, name, public) values ('uniforms', 'uniforms', false);
-- insert into storage.buckets (id, name, public) values ('exports', 'exports', false);
-- insert into storage.buckets (id, name, public) values ('mannequins', 'mannequins', true);
