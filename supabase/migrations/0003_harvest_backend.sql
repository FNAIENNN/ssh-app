-- ============================================================================
--  SSH — Harvest Backend (PRD §7.5, §7.6, §7.7)
--  Adds the tables required for the Harvest workflow:
--    * graders, labour_suppliers
--    * bills (seed/harvest)
--    * harvest_entries, harvest_weighments
--    * harvest_checklists (vestigial)
--  This migration is idempotent and safe to re-run.
-- ============================================================================

-- Enable pgcrypto extension if not already present (should be from 0001)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- graders  (site-scoped)
-- ----------------------------------------------------------------------------
create table if not exists public.graders (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites (id) on delete cascade,
  name                text not null,
  phone               text,
  vehicle_no          text not null,
  upi_id              text,
  bank_account        text,
  default_driver_bata numeric not null default 500,
  default_packing_bata numeric not null default 1200,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- labour_suppliers  (site-scoped)
-- ----------------------------------------------------------------------------
create table if not exists public.labour_suppliers (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  name        text not null,
  phone       text not null,
  address     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bills  (site-scoped, shared seed + harvest)
-- ----------------------------------------------------------------------------
create table if not exists public.bills (
  id              uuid primary key default gen_random_uuid(),
  site_id         uuid not null references public.sites (id) on delete cascade,
  bill_number     text not null,
  type            text not null check (type in ('seed', 'harvest')),
  -- harvest-only fields (nullable for seed bills):
  harvest_type    text check (harvest_type in ('middle', 'full')),
  tank_id         uuid references public.tanks (id),
  buyer_name      text,
  factory_name    text,
  -- seed-only fields (nullable for harvest bills):
  seed_total      numeric,
  vehicle_total   numeric,
  workers_total   numeric,
  per_piece_price numeric,
  overall_quantity numeric,
  pl_size         numeric,
  seed_type       text,
  hatchery        text,
  -- shared financials:
  total_amount    numeric not null,
  paid_amount     numeric not null default 0,
  balance_amount  numeric not null default 0,
  status          text not null default 'pending' check (status in ('pending', 'completed', 'cancelled', 'open')),
  created_by      uuid not null references auth.users (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- harvest_entries  (site-scoped)
-- ----------------------------------------------------------------------------
create table if not exists public.harvest_entries (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  tank_id            uuid not null references public.tanks (id),
  harvest_type       text not null check (harvest_type in ('middle', 'full')),
  date               date not null,
  doc                integer not null default 0,
  total_kgs          numeric not null,
  total_loose        numeric not null,
  total_save         numeric not null,
  final_count        integer,
  price_per_kg       numeric not null,
  total_amount       numeric not null,
  buyer_name         text,
  factory_name       text,
  grader_id          uuid references public.graders (id) on delete set null,
  grader_details     jsonb,
  labour_supplier_id uuid references public.labour_suppliers (id) on delete set null,
  labour_details     jsonb,
  bill_id            uuid references public.bills (id),
  bill_number        text,
  checklist          jsonb,
  created_by         uuid not null references auth.users (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- harvest_weighments  (site-scoped, individual weighment log)
-- ----------------------------------------------------------------------------
create table if not exists public.harvest_weighments (
  id                 uuid primary key default gen_random_uuid(),
  session_id         uuid not null,
  site_id            uuid not null references public.sites (id) on delete cascade,
  tank_id            uuid references public.tanks (id),
  harvest_entry_id   uuid references public.harvest_entries (id) on delete set null,
  weight_kg          numeric not null,
  loose_kg           numeric not null default 0,
  captured_by        uuid not null references auth.users (id),
  source             text not null check (source in ('auto', 'manual')),
  mode               text not null check (mode in ('simulator', 'websocket', 'serial', 'bluetooth')),
  raw                jsonb,
  captured_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- harvest_checklists  (vestigial - only to satisfy TABLES map)
-- ----------------------------------------------------------------------------
create table if not exists public.harvest_checklists (
  id                 uuid primary key default gen_random_uuid(),
  site_id            uuid not null references public.sites (id) on delete cascade,
  tank_id            uuid references public.tanks (id),
  permission         boolean not null default false,
  waterLevel         boolean not null default false,
  harvestNet         boolean not null default false,
  iceReady           boolean not null default false,
  vehicleReady       boolean not null default false,
  packingReady       boolean not null default false,
  labourReady        boolean not null default false,
  countSample        boolean not null default false,
  supervisorApproval boolean not null default false,
  created_by         uuid not null references auth.users (id),
  created_at         timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Enable Row Level Security on all new tables
-- ----------------------------------------------------------------------------
alter table public.graders enable row level security;
alter table public.labour_suppliers enable row level security;
alter table public.bills enable row level security;
alter table public.harvest_entries enable row level security;
alter table public.harvest_weighments enable row level security;
alter table public.harvest_checklists enable row level security;

-- ----------------------------------------------------------------------------
-- Helper functions are already created in 0001_init.sql:
--   public.current_profile()
--   public.current_user_role()
--   public.user_can_access_site(sid uuid)
-- We do not recreate them here because PostgreSQL forbids nested $$ blocks
-- inside a DO block when both use the same delimiter.
-- ----------------------------------------------------------------------------

-- ----------------------------------------------------------------------------
-- Generic site-scoped RLS policies
-- ----------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array[
        'graders','labour_suppliers','bills','harvest_entries','harvest_weighments','harvest_checklists'
    ] loop
        execute format('drop policy if exists "%1$s read"  on public.%1$I;', t);
        execute format('drop policy if exists "%1$s write" on public.%1$I;', t);
        execute format('create policy "%1$s read" on public.%1$I for select using (user_can_access_site(site_id));', t);
        execute format('create policy "%1$s write" on public.%1$I for all ' ||
          'using (user_can_access_site(site_id)) with check (user_can_access_site(site_id));', t);
    end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Updated At Triggers
-- ----------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array[
        'graders','labour_suppliers','bills','harvest_entries','harvest_weighments','harvest_checklists'
    ] loop
        execute format('drop trigger if exists set_%s_updated_at on public.%I;', t, t);
        execute format('create trigger set_%s_updated_at before update on public.%I for each row execute procedure public.set_updated_at();', t, t);
    end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Realtime publication
-- ----------------------------------------------------------------------------
do $$
declare
    t text;
begin
    foreach t in array array[
        'bills','harvest_entries','graders','labour_suppliers','harvest_weighments'
    ] loop
        execute format('alter publication supabase_realtime add table public.%I;', t);
    end loop;
exception when others then null;
end $$;

-- ----------------------------------------------------------------------------
-- Indexes for common query patterns
-- ----------------------------------------------------------------------------
create index if not exists idx_harvest_weighments_session_id on public.harvest_weighments(session_id);
create index if not exists idx_harvest_weighments_harvest_entry_id on public.harvest_weighments(harvest_entry_id);
create index if not exists idx_harvest_entries_bill_id on public.harvest_entries(bill_id);
create index if not exists idx_harvest_entries_site_id on public.harvest_entries(site_id);
create index if not exists idx_bills_site_id on public.bills(site_id);