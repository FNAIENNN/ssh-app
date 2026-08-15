-- ============================================================================
--  SSH — Aquaculture Site & Seed Management Platform (Oryxen)
--  Initial schema.  Run on a fresh Supabase project.
--  Implements the data model from PRD §11 with Row Level Security scoped
--  per site / per user. Enables Postgres + Realtime + Storage extensions.
-- ============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Common updated_at trigger
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ----------------------------------------------------------------------------
-- profiles  (mirrors auth.users; carries app-level role + assigned sites)
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'finance', 'field', 'manager');

create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  full_name    text,
  phone        text,
  role         public.user_role not null default 'field',
  site_ids     uuid[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- sites  (master site list — seeded from "Thavvu" reference data; e.g. Akividu)
-- ----------------------------------------------------------------------------
create table if not exists public.sites (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  source      text,                       -- legacy ref, e.g. "Thavvu"
  region      text,                       -- e.g. "Akividu, Andhra Pradesh"
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- sections  (A / B / C / D… under a site)
-- ----------------------------------------------------------------------------
create table if not exists public.sections (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid not null references public.sites (id) on delete cascade,
  name        text not null,              -- "A", "B"…
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (site_id, name)
);

-- ----------------------------------------------------------------------------
-- tanks  (A1, A2… under a section) — carries live quantity + stocking lineage
-- ----------------------------------------------------------------------------
create table if not exists public.tanks (
  id            uuid primary key default gen_random_uuid(),
  section_id    uuid not null references public.sections (id) on delete cascade,
  site_id       uuid not null references public.sites (id) on delete cascade,
  name          text not null,            -- "A1"
  area_acres    numeric(10,2) not null default 0,
  -- Live stocking snapshot kept here so Sections card / Trail Netting list
  -- can render without re-joining every seed entry:
  quantity      numeric(14,2) not null default 0,
  seed_type     text,
  hatchery      text,
  start_date    date,                     -- stocking date (preserved on exchange)
  ready_harvest boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (section_id, name)
);

-- ----------------------------------------------------------------------------
-- seed_entries  (immutable stocking log; one row per stock-in / exchange-in)
-- ----------------------------------------------------------------------------
create table if not exists public.seed_entries (
  id              uuid primary key default gen_random_uuid(),
  tank_id         uuid not null references public.tanks (id) on delete cascade,
  site_id         uuid not null references public.sites (id) on delete cascade,
  date            date not null,
  seed_type       text not null,
  quantity        numeric(14,2) not null,
  hatchery        text,
  source          text not null default 'stocked',  -- stocked | exchanged
  payment_id      uuid,
  created_by      uuid references auth.users (id),
  created_at      timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- seed_exchanges  (From → To transfers; see PRD §7.3)
-- ----------------------------------------------------------------------------
create table if not exists public.seed_exchanges (
  id                uuid primary key default gen_random_uuid(),
  site_id           uuid not null references public.sites (id) on delete cascade,
  from_tank_id      uuid not null references public.tanks (id),
  to_tank_id        uuid not null references public.tanks (id),
  no_of_kgs         numeric(14,2) not null default 0,
  total_kgs         numeric(14,2) not null default 0,
  count             integer not null default 0,
  total_exchanged   numeric(14,2) not null default 0,   -- total_kgs * count
  start_date        date,           -- lineage start copied from "From" tank
  exchange_date     date not null default current_date,
  blind_feed        boolean not null default false,
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- payments  (single ledger for Seed / Vehicle / Outside-Worker — PRD §10)
-- ----------------------------------------------------------------------------
create type public.payment_type as enum ('seed', 'vehicle', 'outside_worker');
create type public.payment_method as enum ('cash', 'advance');
create type public.advance_mode as enum ('upi', 'bank');
create type public.payment_status as enum ('requested', 'completed', 'rejected');

create table if not exists public.payments (
  id                  uuid primary key default gen_random_uuid(),
  site_id             uuid not null references public.sites (id) on delete cascade,
  type                public.payment_type not null,
  method              public.payment_method not null,
  advance_mode        public.advance_mode,             -- null when cash
  amount              numeric(14,2) not null check (amount >= 0),
  status              public.payment_status not null default 'requested',
  proof_url           text,
  registered_in_machine_ids_book boolean not null default false,
  related_tank_id     uuid references public.tanks (id),
  related_section_id  uuid references public.sections (id),
  payment_account_id  uuid,
  bank_account_id     uuid,
  note                text,
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- payment_accounts  (saved UPI accounts — PRD §10)
-- ----------------------------------------------------------------------------
create table if not exists public.payment_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  upi_id      text not null,
  bank_name   text,
  holder_name text,
  is_primary  boolean not null default false,
  verified    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- bank_accounts  (saved bank accounts for advance / bank transfer)
-- ----------------------------------------------------------------------------
create table if not exists public.bank_accounts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users (id) on delete cascade,
  ifsc          text not null,
  account_number text not null,
  bank_name     text not null,
  holder_name   text,
  is_primary    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- vehicle_bookings  (Spread logic sits on top of payments — PRD §7.2)
-- ----------------------------------------------------------------------------
create table if not exists public.vehicle_bookings (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  payment_id    uuid not null references public.payments (id) on delete cascade,
  tank_ids      uuid[] not null default '{}',
  spread        boolean not null default false,
  per_tank_amount numeric(14,2),
  driver_name   text,
  driver_phone  text,
  vehicle_no    text,
  created_at    timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- trail_netting_checklists  (Box / Nets / Dettol / Weighing Machine — §8.2)
-- ----------------------------------------------------------------------------
create table if not exists public.trail_netting_checklists (
  id                uuid primary key default gen_random_uuid(),
  tank_id           uuid not null references public.tanks (id) on delete cascade,
  box               boolean not null default false,
  nets              boolean not null default false,
  dettol            boolean not null default false,
  weighing_machine  boolean not null default false,
  completed_at      timestamptz
);

-- ----------------------------------------------------------------------------
-- trail_netting_records  (per netting event — samples + cadence output)
-- ----------------------------------------------------------------------------
create table if not exists public.trail_netting_records (
  id                  uuid primary key default gen_random_uuid(),
  tank_id             uuid not null references public.tanks (id) on delete cascade,
  site_id             uuid not null references public.sites (id) on delete cascade,
  date                date not null default current_date,
  -- samples stored as JSON array: [{ no_of_kgs, count }, ...]
  samples             jsonb not null default '[]'::jsonb,
  final_count         integer not null default 0,
  growth_diff         numeric(10,2),
  feed_consp_between  numeric(10,2),
  next_expected_date  date,
  created_by          uuid references auth.users (id),
  created_at          timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- trail_netting_reports  (canonical "Trail Netting Report & Pattubadi" — §8.4)
-- ----------------------------------------------------------------------------
create table if not exists public.trail_netting_reports (
  id                   uuid primary key default gen_random_uuid(),
  tank_id              uuid not null references public.tanks (id) on delete cascade,
  site_id              uuid not null references public.sites (id) on delete cascade,
  hatchery             text,
  seed_stocked         numeric(14,2),
  survived_seed        numeric(14,2),
  doc                  integer,                         -- days of culture
  latest_date          date,
  previous_date        date,
  latest_count         integer,
  previous_count       integer,
  count_diff           integer,                         -- latest - previous
  growth_diff          numeric(10,2),
  weekly_growth        numeric(10,2),                   -- derived weekly rate
  feed_consp_between   numeric(10,2),
  growth_kgs_between   numeric(10,2),
  fcr_between          numeric(10,2),
  feed_consp_total     numeric(14,2),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- food_orders  (stub → syncs to external Canteen App — §7.4)
-- ----------------------------------------------------------------------------
create table if not exists public.food_orders (
  id          uuid primary key default gen_random_uuid(),
  site_id     uuid references public.sites (id) on delete cascade,
  tank_id     uuid references public.tanks (id) on delete cascade,
  payload     jsonb not null default '{}'::jsonb,
  synced      boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- notifications  (in-app bell — 45-day alerts, pending proofs, etc.)
-- ----------------------------------------------------------------------------
create type public.notification_kind as enum (
  'trail_netting_due', 'trail_netting_overdue', 'payment_proof_pending', 'info'
);

create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users (id) on delete cascade,
  site_id     uuid references public.sites (id) on delete cascade,
  kind        public.notification_kind not null default 'info',
  title       text not null,
  body        text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- updated_at triggers
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','sites','sections','tanks','payments','payment_accounts',
    'bank_accounts','trail_netting_records','trail_netting_reports'
  ] loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I; ' ||
      'create trigger set_updated_at before update on public.%I ' ||
      'for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- Days-Completed helper view (PRD §7.1). Columns listed explicitly so the
-- tank's site_id / section_id don't collide with seed_entries' own columns.
-- ----------------------------------------------------------------------------
create or replace view public.v_seed_entries as
  select
    se.id, se.tank_id, se.site_id, se.date, se.seed_type,
    se.quantity, se.hatchery, se.source, se.payment_id,
    se.created_by, se.created_at,
    t.name        as tank_name,
    t.section_id  as section_id,
    (current_date - se.date) as days_completed
  from public.seed_entries se
  join public.tanks t on t.id = se.tank_id;

-- ----------------------------------------------------------------------------
-- RLS  — scope every table by site membership / role.
-- ----------------------------------------------------------------------------

alter table public.profiles                 enable row level security;
alter table public.sites                    enable row level security;
alter table public.sections                 enable row level security;
alter table public.tanks                    enable row level security;
alter table public.seed_entries             enable row level security;
alter table public.seed_exchanges           enable row level security;
alter table public.payments                 enable row level security;
alter table public.payment_accounts         enable row level security;
alter table public.bank_accounts            enable row level security;
alter table public.vehicle_bookings         enable row level security;
alter table public.trail_netting_checklists enable row level security;
alter table public.trail_netting_records    enable row level security;
alter table public.trail_netting_reports    enable row level security;
alter table public.food_orders              enable row level security;
alter table public.notifications            enable row level security;

-- Helper: current user's profile row.
create or replace function public.current_profile()
returns public.profiles language sql stable security definer as $$
  select * from public.profiles where id = auth.uid();
$$;

-- Scalar role helper — avoids the `func().field` parse quirk in policy USING.
create or replace function public.current_user_role()
returns public.user_role language sql stable security definer as $$
  select p.role from public.profiles p where p.id = auth.uid();
$$;

-- A user may touch a site if it's in their site_ids or they're admin/finance.
create or replace function public.user_can_access_site(sid uuid)
returns boolean language sql stable security definer as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role in ('admin','finance') or sid = any(p.site_ids))
  );
$$;

-- profiles: self + admin/finance (idempotent — safe to re-run).
drop policy if exists "profiles self read"   on public.profiles;
drop policy if exists "profiles self write"  on public.profiles;
drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self read"   on public.profiles for select using (id = auth.uid() or current_user_role() in ('admin','finance'));
create policy "profiles self write"  on public.profiles for update using (id = auth.uid() or current_user_role() in ('admin','finance'));
create policy "profiles self insert" on public.profiles for insert with check (id = auth.uid());

-- sites: read if member; insert/update for admin/manager
drop policy if exists "sites read"  on public.sites;
drop policy if exists "sites write" on public.sites;
create policy "sites read"   on public.sites for select using (user_can_access_site(id));
create policy "sites write"  on public.sites for all
  using (current_user_role() in ('admin','manager'))
  with check (current_user_role() in ('admin','manager'));

-- Generic site-scoped policy applied to every site_id-bearing table.
do $$
declare t text;
begin
  foreach t in array array[
    'sections','tanks','seed_entries','seed_exchanges','payments',
    'vehicle_bookings','trail_netting_records','trail_netting_reports',
    'food_orders','notifications'
  ] loop
    execute format('drop policy if exists "%1$s read"  on public.%1$I;', t);
    execute format('drop policy if exists "%1$s write" on public.%1$I;', t);
    execute format('create policy "%1$s read" on public.%1$I for select using (user_can_access_site(site_id));', t);
    execute format('create policy "%1$s write" on public.%1$I for all ' ||
      'using (user_can_access_site(site_id)) with check (user_can_access_site(site_id));', t);
  end loop;
end $$;

-- Owner-scoped tables (payment_accounts, bank_accounts)
drop policy if exists "accounts owner read"  on public.payment_accounts;
drop policy if exists "accounts owner write" on public.payment_accounts;
drop policy if exists "bank owner read"      on public.bank_accounts;
drop policy if exists "bank owner write"     on public.bank_accounts;
create policy "accounts owner read"  on public.payment_accounts for select using (user_id = auth.uid());
create policy "accounts owner write" on public.payment_accounts for all    using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "bank owner read"      on public.bank_accounts    for select using (user_id = auth.uid());
create policy "bank owner write"     on public.bank_accounts    for all    using (user_id = auth.uid()) with check (user_id = auth.uid());

-- trail_netting_checklists (no site_id column → scope via tank → site)
drop policy if exists "checklist read"  on public.trail_netting_checklists;
drop policy if exists "checklist write" on public.trail_netting_checklists;
create policy "checklist read" on public.trail_netting_checklists for select
  using (exists (select 1 from public.tanks t where t.id = tank_id and user_can_access_site(t.site_id)));
create policy "checklist write" on public.trail_netting_checklists for all
  using (exists (select 1 from public.tanks t where t.id = tank_id and user_can_access_site(t.site_id)))
  with check (exists (select 1 from public.tanks t where t.id = tank_id and user_can_access_site(t.site_id)));

-- ----------------------------------------------------------------------------
-- Auto-provision a profile row whenever auth.users gets a new user.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- Realtime: publish key tables so dashboards stay live (PRD §12).
-- ----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'payments','seed_entries','seed_exchanges','tanks',
    'trail_netting_records','trail_netting_reports','notifications'
  ] loop
    execute format('alter publication supabase_realtime add table public.%I;', t);
  end loop;
exception when others then null;
end $$;
