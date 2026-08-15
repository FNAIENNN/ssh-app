/**
 * Runtime backend mode: 'demo' (local localStorage data) or 'live' (real Supabase).
 *
 * Demo is the default so the app is explorable on first run with no DB setup.
 * The header toggle (or `localStorage.setItem('ssh.mode','live')`) flips it.
 *
 * Mode is read at runtime, NOT at build time, so toggling takes effect on the
 * next page load without rebuilding.
 */

export const MODE_KEY = 'ssh.mode';

export function getMode() {
  // Prefer explicit localStorage choice. If Supabase env vars are missing,
  // force demo regardless (prevents the "supabaseUrl required" crash).
  const envConfigured = Boolean(
    import.meta.env.VITE_SUPABASE_URL?.trim() && import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
  );
  const stored = localStorage.getItem(MODE_KEY);
  if (stored === 'live' && envConfigured) return 'live';
  if (stored === 'demo') return 'demo';
  // Default: demo unless env is configured AND user previously chose live.
  return envConfigured && stored === 'live' ? 'live' : 'demo';
}

export function setMode(mode) {
  if (mode === 'live') localStorage.setItem(MODE_KEY, 'live');
  else if (mode === 'demo') localStorage.setItem(MODE_KEY, 'demo');
  else localStorage.removeItem(MODE_KEY);
}

export function isDemo() {
  return getMode() === 'demo';
}
