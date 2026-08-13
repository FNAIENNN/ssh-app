-- ============================================================================
--  Seed data for local/dev Supabase projects.
--  Mirrors the "Thavvu" master data referenced in the PRD (e.g. Akividu).
--  Sites + sections + tanks get deterministic IDs so the app renders on first
--  run without manual setup.
--
--  NOTE: site_id values are fixed so seeded sections/tanks join cleanly.
--        Safe to re-run (idempotent on conflict).
-- ============================================================================

insert into public.sites (id, name, source, region) values
  ('11111111-1111-1111-1111-111111111111', 'Akividu', 'Thavvu', 'Akividu, Andhra Pradesh'),
  ('22222222-2222-2222-2222-222222222222', 'Bhimavaram', 'Thavvu', 'Bhimavaram, Andhra Pradesh'),
  ('33333333-3333-3333-3333-333333333333', 'Palakollu', 'Thavvu', 'Palakollu, Andhra Pradesh')
on conflict (id) do nothing;

-- Akividu → Sections A, B, C
insert into public.sections (id, site_id, name) values
  ('a0000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A'),
  ('a0000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'B'),
  ('a0000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'C')
on conflict (id) do nothing;

-- Akividu → Tanks A1..A3, B1..B2, C1
insert into public.tanks (id, site_id, section_id, name, area_acres) values
  ('t0000000-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'A1', 1.25),
  ('t0000000-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'A2', 1.00),
  ('t0000000-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001', 'A3', 0.75),
  ('t0000000-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'B1', 1.50),
  ('t0000000-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000002', 'B2', 1.10),
  ('t0000000-0000-0000-0000-0000000000c1', '11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000003', 'C1', 2.00)
on conflict (id) do nothing;

-- Bhimavaram → Section A + tanks A1..A2
insert into public.sections (id, site_id, name) values
  ('b0000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'A')
on conflict (id) do nothing;

insert into public.tanks (id, site_id, section_id, name, area_acres) values
  ('tb000000-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'A1', 1.20),
  ('tb000000-0000-0000-0000-0000000000a2', '22222222-2222-2222-2222-222222222222', 'b0000000-0000-0000-0000-000000000001', 'A2', 0.90)
on conflict (id) do nothing;
