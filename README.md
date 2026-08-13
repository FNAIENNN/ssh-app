<div align="center">
  <pre>
  ███████╗███████╗██╗  ██╗
  ██╔════╝██╔════╝██║  ██║
  ███████╗███████╗███████║
  ╚════██║╚════██║██╔══██║
  ███████║███████║██║  ██║
  ╚══════╝╚══════╝╚═╝  ╚═╝
  </pre>
  <h1>⚡ AQUA · CYBER · SHELL ⚡</h1>
  <p><strong>Oryxen</strong> · In‑app: <code>SSH</code> · Theme: <span style="color:#00f0ff;">Aqua</span></p>
  <p>
    <img src="https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB" alt="React" />
    <img src="https://img.shields.io/badge/Vite-646CFF?style=for-the-badge&logo=vite&logoColor=white" alt="Vite" />
    <img src="https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white" alt="Supabase" />
    <img src="https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind" />
    <img src="https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Node.js" />
    <img src="https://img.shields.io/badge/license-MIT-0?style=for-the-badge&logo=opensourceinitiative&logoColor=white&color=cyan" alt="MIT" />
  </p>
  <p>
    <img src="https://img.shields.io/badge/STATUS-ACTIVE-brightgreen?style=flat-square&logo=statuspage" />
    <img src="https://img.shields.io/badge/COVERAGE-??-yellow?style=flat-square" />
    <img src="https://img.shields.io/badge/PRs-WELCOME-ff69b4?style=flat-square" />
    <img src="https://img.shields.io/badge/MADE_WITH-♥_&_☕-critical?style=flat-square" />
  </p>
  <blockquote>
    🚀 <em>“Manage shrimp, ride the neon wave.”</em>
  </blockquote>
</div>

---

## 🔮 TABLE OF CONTENTS

- [🌀 Quick Start](#-quick-start)
- [🗂️ Project Structure](#-project-structure)
- [📡 Module → PRD Mapping](#-module--prd-mapping)
- [🧪 Trail‑Netting Cadence](#-trailnetting-cadence)
- [💸 Payment Flow](#-payment-flow)
- [🧬 Git Collaboration (Glitch‑Free)](#-git-collaboration-glitchfree)
- [⚙️ Handling Conflicts](#️-handling-conflicts)
- [📌 Notes & Next Steps](#-notes--next-steps)

---

## 🌀 QUICK START

> [!IMPORTANT]  
> **Prereqs:** Node.js 16+, npm, git, GitHub account. Optional: `gh` CLI.

### 1. Clone & install
```bash
git clone https://github.com/your-repo/ssh-app.git
cd ssh-app
npm install
```

### 2. Configure Supabase (the neural core)
Copy env template and inject your credentials (from Supabase Dashboard → *Project Settings → API*):
```bash
cp .env.example .env
```
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Bootstrap the database
In Supabase **SQL Editor**, execute:
1. `supabase/migrations/0001_init.sql` – all tables, RLS, triggers, Realtime.
2. `supabase/seed.sql` – demo sites (Akividu, Bhimavaram, Palakollu).

### 4. Fire up the dev server
```bash
npm run dev
```
Open http://localhost:5173 – the grid is alive.

### 5. Create your first user
Use **Sign Up** – the `handle_new_user` trigger auto‑creates a `profiles` row.  
Grant site access / elevate role (`admin`/`finance`) by editing `profiles.site_ids` / `profiles.role` in Supabase.

---

## 🗂️ PROJECT STRUCTURE (PRD §13 mirrored)

```
ssh-app/
├── public/
│   └── logo.svg                 # Oryxen mark (drop logo.png to override)
├── src/
│   ├── theme/                   # Aqua tokens (tokens.css) + Tailwind layer
│   ├── lib/supabaseClient.js    # shared typed client + TABLES map
│   ├── auth/                    # Splash, Login, SignUp, ForgotPassword, AuthShell
│   ├── components/
│   │   ├── layout/              # AppHeader, QuickActionsMenu, NotificationBell, ProfileMenu
│   │   ├── payments/            # RequestPayment, LedgerTable (shared pattern)
│   │   ├── cards/               # SiteCard, SectionCard, TankCard
│   │   ├── tables/              # SeedTable, TrailNettingReportTable
│   │   └── ui/                  # PageHeader, Empty, Spinner, PillButton
│   ├── features/
│   │   ├── siteSelection/
│   │   ├── seed/
│   │   │   ├── sections/
│   │   │   ├── payments/{seedPayments,outsideWorkers,vehicleBooking}/
│   │   │   ├── seedExchange/
│   │   │   ├── food/
│   │   │   └── reports/
│   │   ├── trailNetting/
│   │   └── harvest/             # placeholder (PRD §9)
│   ├── hooks/                   # useAuth, useSite, useToast, useTrailNettingCadence
│   ├── routes/                  # AppRoutes, AppShell, ProtectedRoute
│   ├── App.jsx
│   └── main.jsx
└── supabase/
    ├── migrations/0001_init.sql
    └── seed.sql
```

---

## 📡 MODULE → PRD MAPPING

| PRD § | Module | Location |
|-------|--------|----------|
| §3 | Aqua theme tokens | `src/theme/tokens.css`, `tailwind.config.js` |
| §3 | Splash screen | `src/auth/Splash.jsx` |
| §4 | Auth (login/signup/forgot/session) | `src/auth/*`, `src/hooks/useAuth.jsx`, `routes/ProtectedRoute.jsx` |
| §4–5 | Site selection → Site Cards | `features/siteSelection/`, `components/cards/SiteCard.jsx` |
| §6 | Dashboard shell (logo/SSH/bell/avatar/3 tabs) | `components/layout/AppHeader.jsx` + `routes/AppShell.jsx` |
| §7.1 | Sections card → tanks → seed table | `features/seed/sections/`, `tables/SeedTable.jsx` |
| §7.2 | Payments (Seed + Outside Workers) + Vehicle Booking + Spread | `features/seed/payments/**` |
| §7.3 | Seed Exchange (lineage, qty, Blind Feed) | `features/seed/seedExchange/` |
| §7.4 | Food stub → Canteen sync | `features/seed/food/` |
| §7.5 | Reports + CSV export | `features/seed/reports/` |
| §8.1 | Trail Netting tank cards + cadence | `features/trailNetting/TankList.jsx`, `hooks/useTrailNettingCadence.js` |
| §8.2 | Checklist + sampling table + save | `features/trailNetting/TrailNettingPage.jsx` |
| §8.3 | Per‑tank trail‑netting history | inside `TrailNettingPage.jsx` |
| §8.4 | Canonical *Trail Netting Report & Pattubadi* table | `components/tables/TrailNettingReportTable.jsx` (16 columns) |
| §9 | Harvest placeholder | `features/harvest/Harvest.jsx` |
| §10 | Shared Request Payment (cash + advance/UPI/Bank + ledger) | `components/payments/RequestPayment.jsx` |
| §11 | Supabase data model + RLS + Realtime | `supabase/migrations/0001_init.sql` |
| §12 | Realtime subscriptions + in‑app notifications | `components/layout/NotificationBell.jsx` |

---

## 🧪 TRAIL‑NETTING CADENCE (PRD §8.1)

Implemented in `useTrailNettingCadence.js`:

- **1st netting window:** Day 45–60 after stocking.
- **Subsequent nettings:** must occur **within 7 days** of previous.
- **Next expected date** = last netting date + 7 days (shown with calendar).
- Tank cards glow **green** at Day 45; the *Trail Netting* button is disabled until then.

> [!TIP]  
> The cadence logic is fully reactive – your tanks will pulse with neon urgency.

---

## 💸 PAYMENT FLOW (PRD §10)

`RequestPayment` is **the** payment nexus – reused across Seed Payments, Vehicle advances, and Outside Workers.

Two toggleable flows:

- **Cash** – live balance validation + HOD limit (success/warning/danger).
- **Advance / Request** – UPI or Bank Transfer. Status: *Requested* → finance uploads proof → marks *Completed* → proof preview + *register‑in‑machine‑IDs‑book* toggle.

All backed by a shared ledger table. Spread functionality for vehicle advances across tanks.

---

## 🧬 GIT COLLABORATION (GLITCH‑FREE)

> [!NOTE]  
> Follow the neon‑lit path to keep your branches in sync.

1. **Sync `main`** before starting:
   ```bash
   git checkout main && git pull origin main
   ```
2. **Create a feature branch** (descriptive names):
   ```bash
   git switch -c feat/seed-yourname-short
   ```
3. **Work** inside `src/features/seed` – keep changes focused.
4. **Commit often** with clear messages:
   ```bash
   git add path/to/files
   git commit -m "seed: add <short description>"
   ```
5. **Push & open a Pull Request**:
   ```bash
   git push -u origin feat/seed-yourname-short
   gh pr create --fill   # or use GitHub web UI
   ```
6. **Request reviews**, address comments, merge into `main`.
7. **After merge**, update local `main` and delete branch:
   ```bash
   git checkout main
   git pull origin main
   git push origin --delete feat/seed-yourname-short
   git branch -d feat/seed-yourname-short
   ```

---

## ⚙️ HANDLING CONFLICTS

If your branch falls behind, **rebase** or **merge** `main` before opening a PR:

```bash
git fetch origin
git switch feat/seed-yourname-short
git rebase origin/main   # or git merge origin/main
```

Resolve conflicts in your editor, `git add` the resolved files, then:
- `git rebase --continue` (if rebasing)
- or `git commit` (if merging)

> [!WARNING]  
> Rebasing rewrites history – make sure you’re the only one working on that branch.

---

## 📌 NOTES & NEXT STEPS

- **Harvest tab** is a placeholder (PRD §9, open question #4).  
- **Canteen app** sync is one‑way SSH → Canteen via `food_orders` (open question #3).  
- Drop a raster `public/logo.png` to override the inline SVG mark.  
- Growth / feed / FCR columns in the Trail Netting report are written as `null` on first save – to be enriched by finance/field later.

---

<div align="center">
  <pre>
  ╔═══════════════════════════════════════╗
  ║   HACK THE PLANET · STAY AQUATIC     ║
  ╚═══════════════════════════════════════╝
  </pre>
  <p>🔥 Made with ☕ & neon dreams 🔥</p>
</div>
# SSH — Aquaculture Site & Seed Management Platform

**Brand:** Oryxen · **In-app name:** SSH · **Theme:** Aqua
**Frontend:** React (Vite) · **Backend:** Supabase

A web app for managing shrimp/fish hatchery operations across multiple sites:
sites → sections → tanks, seed stocking & seed exchange, trail-netting sampling
cycles, payments (seed / vehicle / outside workers), and consolidated reports.

> Built directly from the PRD. API-first against Supabase so sibling apps
> (e.g. the Canteen app) can integrate cleanly.

---

## Quick start

### 1. Install dependencies
```bash
cd ssh-app
npm install
```

### 2. Configure Supabase
Copy the env template and fill in your project credentials (Supabase dashboard →
*Project Settings → API*):
```bash
cp .env.example .env
```
```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Apply the database schema
In the Supabase dashboard **SQL Editor**, run:
1. `supabase/migrations/0001_init.sql` — all tables, RLS policies, triggers, Realtime.
2. `supabase/seed.sql` — demo sites (Akividu, Bhimavaram, Palakollu), sections, tanks.

### 4. Run the app
```bash
npm run dev
```
Open http://localhost:5173.

### 5. Create your first user
Use **Sign Up** in the app. A `profiles` row is auto-created by the
`handle_new_user` trigger. Grant the user access to sites / an elevated role
(admin/finance) by editing their `profiles.site_ids` / `profiles.role` in Supabase.

---

## Project structure (mirrors PRD §13)

```
ssh-app/
├── public/
│   └── logo.svg                 # Oryxen mark (drop logo.png in to override)
├── src/
│   ├── theme/                   # Aqua tokens (tokens.css) + Tailwind layer
│   ├── lib/supabaseClient.js    # shared typed Supabase client + TABLES map
│   ├── auth/                    # Splash, Login, SignUp, ForgotPassword, AuthShell
│   ├── components/
│   │   ├── layout/              # AppHeader, QuickActionsMenu, NotificationBell, ProfileMenu
│   │   ├── payments/            # RequestPayment, LedgerTable  (shared pattern, PRD §10)
│   │   ├── cards/               # SiteCard, SectionCard, TankCard
│   │   ├── tables/              # SeedTable, TrailNettingReportTable
│   │   └── ui/                  # PageHeader, Empty, Spinner, PillButton
│   ├── features/
│   │   ├── siteSelection/
│   │   ├── seed/
│   │   │   ├── sections/
│   │   │   ├── payments/{seedPayments,outsideWorkers,vehicleBooking}/
│   │   │   ├── seedExchange/
│   │   │   ├── food/
│   │   │   └── reports/
│   │   ├── trailNetting/
│   │   └── harvest/             # placeholder route only (PRD §9)
│   ├── hooks/                   # useAuth, useSite, useToast, useTrailNettingCadence
│   ├── routes/                  # AppRoutes, AppShell, ProtectedRoute
│   ├── App.jsx
│   └── main.jsx
└── supabase/
    ├── migrations/0001_init.sql
    └── seed.sql
```

---

## How the modules map to the PRD

| PRD § | Module | Where |
|---|---|---|
| §3 | Aqua theme tokens | `src/theme/tokens.css`, `tailwind.config.js` |
| §3 | Splash screen | `src/auth/Splash.jsx` |
| §4 | Auth (login/signup/forgot/session) | `src/auth/*`, `src/hooks/useAuth.jsx`, `routes/ProtectedRoute.jsx` |
| §4–5 | Site selection → Site Cards | `features/siteSelection/`, `components/cards/SiteCard.jsx` |
| §6 | Dashboard shell (logo / SSH / bell / avatar / 3 tabs) | `components/layout/AppHeader.jsx` + `routes/AppShell.jsx` |
| §7.1 | Sections card → tanks → seed table | `features/seed/sections/`, `tables/SeedTable.jsx` |
| §7.2 | Payments (Seed + Outside Workers) + Vehicle Booking + Spread | `features/seed/payments/**` |
| §7.3 | Seed Exchange (lineage preserved, qty propagates, Blind Feed) | `features/seed/seedExchange/` |
| §7.4 | Food stub → Canteen sync | `features/seed/food/` |
| §7.5 | Reports + CSV export | `features/seed/reports/` |
| §8.1 | Trail Netting tank cards + cadence | `features/trailNetting/TankList.jsx`, `hooks/useTrailNettingCadence.js` |
| §8.2 | Checklist + sampling table + save | `features/trailNetting/TrailNettingPage.jsx` |
| §8.3 | Per-tank trail-netting history table | inside `TrailNettingPage.jsx` |
| §8.4 | Canonical *Trail Netting Report & Pattubadi* table | `components/tables/TrailNettingReportTable.jsx` (16 columns) |
| §9 | Harvest placeholder | `features/harvest/Harvest.jsx` |
| §10 | Shared Request Payment (cash + advance/UPI/Bank + ledger) | `components/payments/RequestPayment.jsx` |
| §11 | Supabase data model + RLS + Realtime | `supabase/migrations/0001_init.sql` |
| §12 | Realtime subscriptions, in-app notifications | `components/layout/NotificationBell.jsx` |

---

## Trail-netting cadence (PRD §8.1) — implemented in `useTrailNettingCadence.js`

- 1st netting window: **Day 45–60** after stocking.
- Each later netting must happen **within 7 days** of the previous one.
- **Next expected date = last netting date + 7 days** (shown with the calendar date).
- Tank cards highlight green at Day 45; the **Trail Netting** button is disabled until then.

## Request Payment (PRD §10) — shared pattern

`RequestPayment` is the only payment path in the app. Two independently togglable
flows, each with its own ledger table:

- **Cash** — live validation vs. available balance + HOD limit; success / warning / danger states.
- **Advance / Request** — UPI or Bank Transfer; status starts *Requested*, finance uploads
  proof, marks *Completed* → proof preview + *register-in-machine-IDs-book* toggle unlock.

The same component is reused for Seed Payments, Vehicle advances (with **Spread**
across tanks), and Outside Workers.

---

## Notes & next steps

- **Harvest tab** is intentionally a placeholder (PRD §9, open question #4).
- **Canteen app** sync is one-way SSH → Canteen via `food_orders` (open question #3).
- Drop a raster `public/logo.png` to override the inline SVG mark used in the header / splash.
- Growth / feed / FCR columns in the Trail Netting report are written as `null` on
  first save and expected to be enriched by finance/field in a later pass.
