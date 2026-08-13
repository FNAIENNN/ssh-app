import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createLocalClient } from './localClient';
import { getMode } from './mode';

/**
 * Single shared "supabase" instance used across the whole app.
 *
 * At runtime this is EITHER:
 *   - the real Supabase client (mode === 'live'), OR
 *   - a local demo client backed by localStorage (mode === 'demo')
 *
 * Default is demo so the app works on first run with no DB setup. The header
 * has a toggle to flip to live; switching reloads the page so the new client
 * takes effect everywhere.
 *
 * Credentials for live mode come from Vite env vars — see `.env.example`.
 * Vite bakes env vars at startup, so after editing `.env` you must restart
 * `npm run dev`.
 */

export const mode = getMode();

export const isDemoMode = mode === 'demo';

export const isSupabaseConfigured = Boolean(
  import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
);

export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
export const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim();

export const supabase =
  mode === 'live' && isSupabaseConfigured
    ? createSupabaseClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
        realtime: {
          params: { eventsPerSecond: 5 },
        },
      })
    : createLocalClient();

/** Convenience: tables referenced across the app, centralised for refactors. */
export const TABLES = {
  users: 'profiles',
  profiles: 'profiles',
  sites: 'sites',
  sections: 'sections',
  tanks: 'tanks',
  seedEntries: 'seed_entries',
  seedExchanges: 'seed_exchanges',
  exchangeWorkers: 'exchange_workers',
  payments: 'payments',
  bills: 'bills',
  paymentAccounts: 'payment_accounts',
  bankAccounts: 'bank_accounts',
  vehicleBookings: 'vehicle_bookings',
  trailNettingChecklists: 'trail_netting_checklists',
  trailNettingRecords: 'trail_netting_records',
  trailNettingReports: 'trail_netting_reports',
  foodOrders: 'food_orders',
  notifications: 'notifications',
  harvestEntries: 'harvest_entries',
  harvestChecklists: 'harvest_checklists',
  graders: 'graders',
  labourSuppliers: 'labour_suppliers',
  harvestWeighments: 'harvest_weighments',
};
