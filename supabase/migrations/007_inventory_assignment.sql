-- Inventory and Assignment Module

create table if not exists inventory_categories (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);

create unique index if not exists idx_inventory_categories_branch_lower_name
  on inventory_categories(branch_id, lower(name));

create table if not exists inventory_accessories (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id) on delete cascade,
  category_id   uuid not null references inventory_categories(id) on delete restrict,
  name          text not null,
  quantity      int not null default 0 check (quantity >= 0),
  image_url     text,
  raw_image_url text,
  storage_path  text,
  bg_removed    boolean not null default false,
  is_archived   boolean not null default false,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

create index if not exists idx_inventory_accessories_branch
  on inventory_accessories(branch_id, is_archived, created_at desc);
create index if not exists idx_inventory_accessories_category
  on inventory_accessories(category_id);

create table if not exists people (
  id         uuid primary key default gen_random_uuid(),
  branch_id  uuid not null references branches(id) on delete cascade,
  name       text not null,
  gender     text not null check (gender in ('male','female')),
  created_at timestamptz default now()
);

create index if not exists idx_people_branch_lower_name
  on people(branch_id, lower(name));

create table if not exists department_memberships (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  person_id     uuid not null references people(id) on delete cascade,
  created_at    timestamptz default now(),
  unique(department_id, person_id)
);

create index if not exists idx_department_memberships_branch
  on department_memberships(branch_id);
create index if not exists idx_department_memberships_person
  on department_memberships(person_id);

alter table combination_zone_items
  add column if not exists inventory_item_id uuid references inventory_accessories(id) on delete restrict;

alter table combination_zone_items
  alter column uniform_id drop not null;

alter table combination_zone_items
  drop constraint if exists combination_zone_items_one_source;

alter table combination_zone_items
  add constraint combination_zone_items_one_source
  check (
    (uniform_id is not null and inventory_item_id is null)
    or
    (uniform_id is null and inventory_item_id is not null)
  );

create index if not exists idx_czitems_inventory_item
  on combination_zone_items(inventory_item_id)
  where inventory_item_id is not null;

create table if not exists inventory_assignments (
  id            uuid primary key default gen_random_uuid(),
  branch_id     uuid not null references branches(id) on delete cascade,
  schedule_id   uuid not null references schedules(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  person_id     uuid not null references people(id) on delete restrict,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz default now(),
  unique(schedule_id, department_id, person_id)
);

create index if not exists idx_inventory_assignments_branch_schedule
  on inventory_assignments(branch_id, schedule_id);

create table if not exists inventory_assignment_items (
  id                uuid primary key default gen_random_uuid(),
  assignment_id     uuid not null references inventory_assignments(id) on delete cascade,
  inventory_item_id uuid not null references inventory_accessories(id) on delete restrict,
  quantity          int not null check (quantity > 0),
  status            text not null default 'assigned'
    check (status in ('assigned','returned','damaged','destroyed','missing')),
  returned_at       timestamptz,
  was_overdue       boolean not null default false,
  notes             text,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists idx_inventory_assignment_items_assignment
  on inventory_assignment_items(assignment_id);
create index if not exists idx_inventory_assignment_items_unresolved
  on inventory_assignment_items(inventory_item_id, status)
  where status = 'assigned';

create table if not exists inventory_stock_events (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid not null references branches(id) on delete cascade,
  inventory_item_id  uuid not null references inventory_accessories(id) on delete cascade,
  assignment_item_id uuid references inventory_assignment_items(id) on delete set null,
  event_type         text not null
    check (event_type in ('manual_adjustment','assigned','returned','damaged','destroyed','missing')),
  quantity_delta     int not null,
  quantity_before    int not null,
  quantity_after     int not null,
  reason             text,
  created_by         uuid references profiles(id) on delete set null,
  created_at         timestamptz default now()
);

create index if not exists idx_inventory_stock_events_branch_created
  on inventory_stock_events(branch_id, created_at desc);
create index if not exists idx_inventory_stock_events_item_created
  on inventory_stock_events(inventory_item_id, created_at desc);
