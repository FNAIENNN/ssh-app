# AGENTS.md — SSH app

Guidance for AI coding agents working in this repo.

## Stack
- React 18 (Vite) + react-router-dom v6 + Tailwind v3.
- Supabase (Postgres + Auth + Realtime). Single shared client at `src/lib/supabaseClient.js`.
- No state library; React Context (`useAuth`, `useSite`, `useToast`) is enough for v1.

## Conventions
- Aqua theme is single-sourced in `src/theme/tokens.css` (CSS variables). Tailwind
  config maps those vars to utility classes — **don't hardcode hex colors** in components.
- Reusable primitives live in `components/` (layout, payments, cards, tables, ui).
  Feature code in `features/` consumes them; don't duplicate the RequestPayment /
  LedgerTable / card / table logic.
- Supabase table names go through the `TABLES` map in `supabaseClient.js`.
- RLS is enabled on every table (see `supabase/migrations/0001_init.sql`). Any new
  site-scoped table must get the generic read/write policies.
- Trail-netting date math is pure and lives in `hooks/useTrailNettingCadence.js`.

## When adding a feature
1. Pick the right home: `features/<tab>/<feature>/` for screens, `components/<kind>/` for
   reusable UI.
2. Scope every query by `site_id` from `useSite()`.
3. If money changes hands, use `components/payments/RequestPayment.jsx` — do not add a
   new payment path.
4. Update the table map in `supabaseClient.js` and add an RLS policy for any new table.
