# Harvest Backend & ESP32 Integration — Implementation Complete

## Summary

The ESP32 weighing machine integration is **fully implemented**:

✅ **Database migration created**: `supabase/migrations/0003_harvest_backend.sql`
✅ **Frontend logging implemented**: Individual weight captures are logged to `harvest_weighments` table
✅ **Session management**: Each harvest wizard session groups its weighments via a UUID
✅ **Backfill logic**: After bill generation, weighments are linked to the harvest_entry
✅ **Demo mode compatibility**: localClient will lazily create the new table

## What's Been Done

### 1. Database Schema (`0003_harvest_backend.sql`)
Created 6 tables following the app's established patterns:
- **`graders`**: Site-scoped master data for transporters
- **`labour_suppliers`**: Site-scoped master data for labour contractors  
- **`bills`**: Shared table for seed + harvest bills (type discriminator)
- **`harvest_entries`**: Main harvest records
- **`harvest_weighments`**: NEW — logs every individual ESP32 weight capture
- **`harvest_checklists`**: Minimal (vestigial — satisfies TABLES map)

All tables have:
- Proper RLS policies using `user_can_access_site(site_id)`
- `updated_at` triggers
- Realtime publication
- Indexes for common queries

### 2. Frontend Changes

**`src/lib/supabaseClient.js`**:
- Added `harvestWeighments: 'harvest_weighments'` to TABLES map

**`src/lib/localClient.js`**:
- Added `harvest_weighments` to TABLE_NAMES map

**`src/features/harvest/hooks/useESP32Scale.js`**:
- Updated callbacks to pass `source` ('auto'/'manual') and `mode` (connection type)

**`src/features/harvest/components/HarvestWizard.jsx`**:
- Generates stable `sessionId` on mount via `crypto.randomUUID()`
- Threads `siteId`, `tankId`, `sessionId` to WeightEntryTable
- Backfills `harvest_entry_id` in weighments after bill creation

**`src/features/harvest/components/WeightEntryTable.jsx`**:
- Fire-and-forget insert to `harvest_weighments` on every capture
- Logs: weight_kg, source, mode, session_id, site_id, tank_id, captured_by
- Errors never block the UI (console.warn only)

## Data Flow Architecture

```
ESP32 Hardware (firmware reads circuit → streams weight)
    ↓
Browser (WebSocket/Serial/BLE/Simulator)
    ↓
useESP32Scale hook (stability detection, tare calc)
    ↓
WeightEntryTable callback
    ├→ Update React state (weightRows) → UI table
    └→ Fire-and-forget INSERT into harvest_weighments
        (session_id groups all captures before entry exists)
    ↓
User completes wizard → HarvestWizard.handleGenerateBill
    ├→ INSERT bills
    ├→ INSERT harvest_entries
    └→ UPDATE harvest_weighments SET harvest_entry_id WHERE session_id
```

## ⚠️ ACTION REQUIRED: Deploy the Migration

The Supabase CLI cannot run from this sandboxed environment (permission error writing telemetry). You must push the migration manually:

### Option 1: Terminal (Recommended)
Open a terminal in the project directory and run:

```bash
cd /Users/ram/ZCodeProject/ssh-app
supabase db push --linked
```

This will apply `0003_harvest_backend.sql` to your linked project (`kzkissrwiejcvphsdxul`).

### Option 2: Supabase Dashboard
1. Go to https://supabase.com/dashboard/project/kzkissrwiejcvphsdxul/sql/new
2. Copy the entire contents of `/Users/ram/ZCodeProject/ssh-app/supabase/migrations/0003_harvest_backend.sql`
3. Paste into the SQL Editor
4. Click "Run"

## Verification Steps

After deploying the migration:

### 1. Check Tables Exist
In Supabase Dashboard → SQL Editor:
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN ('bills', 'harvest_entries', 'harvest_weighments', 'graders', 'labour_suppliers', 'harvest_checklists')
ORDER BY table_name;
```
Should return all 6 tables.

### 2. Test in Live Mode
1. Toggle app to **Live** mode (header switch)
2. Navigate to Harvest tab
3. Start a harvest wizard:
   - Select a tank
   - Complete checklist
   - Use ESP32 simulator to capture 3-5 weights
   - Fill count/price/grader/labour
   - Generate bill

### 3. Verify Data
In Supabase Dashboard → SQL Editor:
```sql
-- Check weighments were logged
SELECT id, weight_kg, source, mode, captured_at 
FROM harvest_weighments 
ORDER BY captured_at DESC 
LIMIT 10;

-- Check harvest entry was created
SELECT id, bill_number, total_kgs, total_save, buyer_name, created_at
FROM harvest_entries
ORDER BY created_at DESC
LIMIT 5;

-- Check weighments linked to entry
SELECT hw.weight_kg, hw.source, hw.mode, he.bill_number
FROM harvest_weighments hw
JOIN harvest_entries he ON hw.harvest_entry_id = he.id
ORDER BY hw.captured_at DESC
LIMIT 10;
```

### 4. Test RLS
- Create a second user without access to the site
- Verify they cannot read weighments or harvest entries

## ESP32 Hardware Connection

Your ESP32-S3 firmware is already reading the weighing machine's circuit. The app supports 4 connection modes:

1. **WebSocket** (Production): ESP32 hosts WiFi AP at `ws://192.168.4.1:81`, streams JSON `{"weight": 25.5, "stable": true}`
2. **Web Serial**: USB connection via Chrome (115200 baud), CP2102/CH340 chip
3. **Web Bluetooth**: BLE GATT connection
4. **Simulator**: Browser-only testing (no hardware)

The browser acts as the intermediary — ESP32 sends weights to browser, browser logs to Supabase. No firmware changes needed.

## Files Modified

- ✅ `supabase/migrations/0003_harvest_backend.sql` (new)
- ✅ `src/lib/supabaseClient.js`
- ✅ `src/lib/localClient.js`
- ✅ `src/features/harvest/hooks/useESP32Scale.js`
- ✅ `src/features/harvest/components/HarvestWizard.jsx`
- ✅ `src/features/harvest/components/WeightEntryTable.jsx`

## Next Steps

1. **Deploy the migration** (see Action Required above)
2. **Test the flow** in live mode
3. **Optional**: Add a UI screen to view individual weighment logs (currently only aggregates are shown in harvest dashboard)

The integration is production-ready once the migration is pushed!