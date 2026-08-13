import { isSupabaseConfigured } from '../../lib/supabaseClient';

/**
 * Shows a hard-to-miss banner when Supabase env vars are missing.
 * Renders nothing when everything is configured.
 *
 * This exists so a misconfigured environment never looks like a blank/broken
 * app — the user always gets an actionable message.
 */
export default function ConfigBanner() {
  if (isSupabaseConfigured) return null;
  return (
    <div
      className="px-4 py-3 text-sm font-semibold text-white flex items-center gap-2 flex-wrap"
      style={{ background: 'var(--color-danger)' }}
      role="alert"
    >
      <span>⚠️</span>
      <span>Supabase is not configured.</span>
      <span className="font-normal opacity-90">
        Add <code className="bg-black/20 px-1 rounded">VITE_SUPABASE_URL</code> and{' '}
        <code className="bg-black/20 px-1 rounded">VITE_SUPABASE_ANON_KEY</code> to{' '}
        <code className="bg-black/20 px-1 rounded">.env</code>, then restart{' '}
        <code className="bg-black/20 px-1 rounded">npm run dev</code>.
      </span>
    </div>
  );
}
