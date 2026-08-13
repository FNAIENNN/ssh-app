-- ============================================================================
--  SSH — Seed Exchange v2 (PRD §7.3 rework).
--  Adds the Seed Exchanging Chart, Count Table, and Workers Payments tables
--  onto the existing schema. Safe to re-run (every statement is idempotent).
--
--  NOTE on the demo client: the local demo backend (localClient.js) spreads
--  unknown payload fields, so these new JSON / integer columns work in demo
--  mode automatically — this migration is only required for live Supabase.
-- ============================================================================

-- NOTE: worker payments reuse the existing `outside_worker` payment_type so
-- they roll up into the existing "Workers" category in History/aggregate
-- (same RequestPayment path used elsewhere — AGENTS.md rule #3). No enum
-- change is required.

-- ---------------------------------------------------------------------------
-- Extend seed_exchanges with the new chart / count / snapshot columns.
-- Each existing row keeps working (defaults keep them null / empty).
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='seed_exchanges'
                   and column_name='weighings') then
    alter table public.seed_exchanges add column weighings jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='seed_exchanges'
                   and column_name='count_rows') then
    alter table public.seed_exchanges add column count_rows jsonb not null default '[]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='seed_exchanges'
                   and column_name='final_count') then
    alter table public.seed_exchanges add column final_count integer not null default 0;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='seed_exchanges'
                   and column_name='from_snapshot') then
    alter table public.seed_exchanges add column from_snapshot jsonb;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='seed_exchanges'
                   and column_name='to_snapshot') then
    alter table public.seed_exchanges add column to_snapshot jsonb;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- exchange_workers — one row per workers-payment session for an exchange.
-- line_items is a JSON array of:
--   { batch, no_of_people, amount, total }
-- grand_total = Σ line_items.total (kept denormalised for the ledger).
-- ---------------------------------------------------------------------------
create table if not exists public.exchange_workers (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.sites (id) on delete cascade,
  exchange_id   uuid references public.seed_exchanges (id) on delete set null,
  mestri_name   text not null,
  line_items    jsonb not null default '[]'::jsonb,
  grand_total   numeric(14,2) not null default 0,
  payment_id    uuid references public.payments (id) on delete set null,
  created_by    uuid references auth.users (id),
  created_at    timestamptz not null default now()
);

-- RLS — generic site-scoped read/write policy (matches the pattern in 0001).
alter table public.exchange_workers enable row level security;

drop policy if exists "exchange_workers read"  on public.exchange_workers;
drop policy if exists "exchange_workers write" on public.exchange_workers;
create policy "exchange_workers read"  on public.exchange_workers for select
  using (public.user_can_access_site(site_id));
create policy "exchange_workers write" on public.exchange_workers for all
  using (public.user_can_access_site(site_id))
  with check (public.user_can_access_site(site_id));

-- Publish for Realtime so the workers ledger stays live alongside payments.
do $$
begin
  execute format('alter publication supabase_realtime add table public.%I;', 'exchange_workers');
exception when others then null;
end $$;
