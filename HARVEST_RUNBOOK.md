# SSH — Harvest & ESP32 Weighing Machine — Complete Runbook

End-to-end guide: how to run the app, connect the ESP32-S3 weighing machine, complete a harvest, and verify that the weight data reaches Supabase.

---

## 1. How the whole thing fits together

```
  ⚖️ Weighing machine (commercial scale)
          │  (analog/digital output)
          ▼
  🎛️ Specially-designed circuit (signal conditioning)
          │
          ▼
  📶 ESP32-S3 (firmware reads weight, streams it)
          │
      ┌───┴───┬─────────────┬───────────────┐
      ▼       ▼             ▼               ▼
  WebSocket USB Serial  Bluetooth      (Simulator
  ws://ip:81 (CP2102/    (BLE GATT)     in browser
              CH340)                    for testing)
      └───┬───┴─────────────┴───────────────┘
          ▼
  🌐 Browser (React app — live weight display, tare, stability)
          │
          ├──► Every capture → INSERT harvest_weighments  (fire-and-forget)
          │
          └──► Bill generation → INSERT bills + harvest_entries
                                   └── UPDATE harvest_weighments
                                       SET harvest_entry_id  (backfill)
          ▼
  🗄️ Supabase (PostgreSQL) — the "backend"
```

**Key point:** the ESP32 talks to the **browser**, not to Supabase. The browser (logged-in app user) is what writes the weight data into Supabase. No firmware changes are needed on your side.

---

## 2. Prerequisites

| Thing | What you need |
|---|---|
| Node.js | `node -v` → v18+ (the repo was built on v24) |
| Supabase CLI | `supabase --version` (already installed) |
| Linked Supabase project | Already linked → ref `kzkissrwiejcvphsdxul` |
| ESP32-S3 weighing machine | Firmware already flashed (reads the circuit) |
| A browser | Chrome/Edge recommended (needed for Serial/BLE) |

---

## 3. Part A — One-time setup

### A1. Install dependencies
```bash
cd /Users/ram/ZCodeProject/ssh-app
npm install
```

### A2. Check the environment file
The `.env` file already contains your Supabase credentials. It must **not** be empty:
```bash
cat .env
```
Expected:
```
VITE_SUPABASE_URL=https://kzkissrwiejcvphsdxul.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
```
> ⚠️ Vite bakes `.env` values at startup — **restart `npm run dev` after any edit**.

### A3. Push the database migrations
This applies `0001`, `0002`, and `0003` (harvest tables) to your Supabase project:
```bash
supabase db push --linked
```
You should see the harvest migration apply with no errors.

### A4. Verify the tables exist
Open **Supabase Dashboard → SQL Editor** and run:
```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('bills','harvest_entries','harvest_weighments',
                     'graders','labour_suppliers','harvest_checklists')
order by table_name;
```
All **6** rows must come back.

### A5. ⭐ Create your user and grant site access (critical)
Every harvest table is protected by Row-Level Security: a user can only read/write data for **sites they belong to** (or if they're `admin`/`finance`).

1. In the app, **Sign Up** (a `profiles` row is auto-created by the `handle_new_user` trigger).
2. In **Supabase Dashboard → Table Editor → `profiles`**, open your user's row and set:
   - `role` = `admin` (simplest for now), **or**
   - `site_ids` = `{<site-uuid>}` for each site you operate.

> If you skip this, everything looks "silently broken": the app shows no data and captures don't save, because RLS denies the queries.

---

## 4. Part B — Run the app

```bash
cd /Users/ram/ZCodeProject/ssh-app
npm run dev
```
Open **http://localhost:5173**.

### Switch to Live mode (not Demo)
- The app defaults to **Demo** (localStorage, no Supabase). To use the real backend, flip the **mode toggle in the header** to **Live**.
- Equivalent from the console: `localStorage.setItem('ssh.mode','live')` then reload.
- You'll know you're on Live when your Supabase data (sites, tanks) appears instead of the demo data.

---

## 5. Part C — Connect the ESP32 weighing machine

In the Harvest wizard, **Step 3 (Weight Entry)** shows the ESP32 control panel. Click **⚙️ Config** and pick a connection mode:

| Mode | When to use | How the ESP32 must speak |
|---|---|---|
| 📶 **WiFi (WebSocket)** | Production, same network | WebSocket server on `ws://<ip>:81`. Sends `{"weight": 25.4, "stable": true}` **or** raw text `"25.40 KG STABLE"` |
| 🔌 **USB Serial** | Bench/one-off (Chrome/Edge only) | UART @ **115200** baud, line-based, e.g. `25.40 KG STABLE` |
| 📡 **Bluetooth** | Wireless, short range | BLE GATT service `0000181d-...` |
| 🎮 **Simulator** | Testing with no hardware | Built into the browser — no ESP32 needed |

**Default connection:** the app assumes the ESP32 is an **access point** at `192.168.4.1:81`. Adjust the IP/port in ⚙️ Config to match your ESP32.

### Auto-capture behaviour
- The panel shows a live **NET WEIGHT** readout; green = **STABLE**, amber = weighing.
- **Tare** subtracts the crate/basket weight. **Zero** resets everything.
- When a stable weight is held for **~1.2 s**, it is **auto-captured** into the weighment table (toggle "Auto-add weight row" off to require manual **➕ Capture Weight**).
- Every capture is immediately logged to `harvest_weighments` in Supabase (fire-and-forget — a failed log never blocks weighing).

### Two important networking gotchas
1. **Don't cut your internet.** If the device connects to the ESP32's own hotspot, it may lose internet and Supabase writes will fail (the weighment log silently skips). Best setup: put the ESP32 on the **same WiFi LAN as your phone/laptop** (station mode) so the device keeps internet while talking to the scale.
2. **HTTPS blocks insecure WebSockets.** If you deploy the app to `https://` (Vercel), the browser blocks `ws://192.168.4.1:81` as mixed content. For production over https, use **USB Serial or Bluetooth**, or serve the scale over `wss://`. In local dev (`http://localhost`), WebSocket works fine.

---

## 6. Part D — Use the harvest workflow

The Harvest tab runs a **7-step wizard**. You'll need a **site** with **tanks** that have `ready_harvest = true` (or stocked tanks) to begin.

| Step | What to do |
|---|---|
| **1. Tank Selection** | Pick the tank being harvested (Middle or Full harvest). DOC + stocked quantity shown. |
| **2. Pre-Harvest Checklist** | All **9** checks must be ✅ to proceed (permission, water, net, ice, vehicle, packing, labour, count sample, supervisor). |
| **3. Weight Entry (ESP32)** | Connect the scale (Part C). Capture each basket's weight — auto or manual. Edit `kgs`/`loose` per row. Watch the totals chips (Gross / Loose / Net Save). |
| **4. Count & Price** | Enter the sample count table (pieces per kg) and the **price per kg**. Final count is computed. |
| **5. Grader & Buyer** | Pick a registered grader or type manual details; add buyer/factory, bata (driver/packing), extra payment. |
| **6. Labour Details** | Pick a supplier or type manual; enter main/guntu/chethi workers + rates. |
| **7. Review & Payment** | Review net KGs, count, price, revenue, expenses, profit. Click **🧾 Generate Printable Harvest Bill**. |
| *(after)* | Optionally record payment with the built-in payment component; view the printable bill invoice. |

### What "Generate Bill" actually saves
1. `bills` — one row, `type='harvest'`, bill number `HRV<YYYYMMDD>####`, status `pending`.
2. `harvest_entries` — one row with totals, count, price, grader/labour JSON snapshots, checklist JSON, linked `bill_id`.
3. `harvest_weighments` — the individual captures from this session are **backfilled** with `harvest_entry_id` (so you can trace every basket to its entry).
4. *Full harvest only:* the tank is reset to empty (`quantity=0`, `ready_harvest=false`, stocking fields cleared).

---

## 7. Part E — Verify the data landed in Supabase

**Supabase Dashboard → SQL Editor**:

```sql
-- 1) Individual weighments captured (should be 1+ per basket)
select weight_kg, source, mode, captured_at
from harvest_weighments
order by captured_at desc
limit 10;

-- 2) The harvest bill
select bill_number, total_amount, balance_amount, status
from bills
where type = 'harvest'
order by created_at desc
limit 5;

-- 3) The harvest entry (aggregates)
select bill_number, total_kgs, total_loose, total_save, final_count, total_amount
from harvest_entries
order by created_at desc
limit 5;

-- 4) Weighments linked back to their harvest entry (backfill worked)
select hw.weight_kg, hw.source, hw.mode, he.bill_number
from harvest_weighments hw
join harvest_entries he on hw.harvest_entry_id = he.id
order by hw.captured_at desc
limit 10;
```

**Good sign:** query 4 returns rows with matching `bill_number` — the full loop works.

---

## 8. Part F — Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| App shows demo data / no sites | App is in **Demo** mode | Toggle header to **Live**, or `localStorage.setItem('ssh.mode','live')` |
| Harvest wizard saves fail in Live | `bills`/`harvest_entries` tables missing | Run `supabase db push --linked` (Part A3) |
| "new row violates row-level security" or no data | User has no `site_ids` / `role` | Set `role='admin'` or add site UUIDs in `profiles` (Part A5) |
| Scale panel stuck "disconnected" | ESP32 on a different network / wrong IP | Same LAN, correct IP:port in ⚙️ Config; ESP32 must be a WebSocket server |
| Weights capture but never appear in Supabase | No internet while on ESP32 hotspot | Put ESP32 on your WiFi LAN; or check RLS (Part A5) |
| WebSocket won't connect from deployed https app | Mixed content blocks `ws://` | Use Serial/BLE, or `wss://` |
| Serial/BLE buttons greyed out | Not Chrome/Edge, or no permission | Use Chrome/Edge, allow device access |
| Weighment log fails silently (console warns) | RLS, network, or schema mismatch | Check browser console; confirm tables exist and user has site access |

---

## 9. Quick-start cheat sheet

```bash
# 1. Install + env (once)
npm install
# confirm .env has the URL + anon key

# 2. Apply schema (once, after any new migration)
supabase db push --linked

# 3. Run the app
npm run dev          # → http://localhost:5173

# 4. In the app
#   - Sign in, set your profile role=admin (or site_ids) in Supabase
#   - Switch header to LIVE
#   - Harvest tab → start wizard → connect ESP32 (⚙️ Config) → weigh → generate bill
#   - Check harvest_weighments / harvest_entries / bills in Supabase
```
