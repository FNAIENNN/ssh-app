/**
 * StatCard — a compact glassmorphic stat tile (label + big value + icon).
 *
 * Reused by the Seed Exchange card for the "Total Kg" / "Count" tiles that
 * appear in both the Seed Exchange section and the Overall Report.
 *
 * Props:
 *   - icon:  emoji or short string shown in a tinted chip
 *   - label: small caption above the value
 *   - value: the headline figure (string or number)
 *   - color: a CSS var (defaults to the primary navy)
 */
export default function StatCard({ icon = '📊', label = '', value = '—', color = 'var(--color-primary)' }) {
  return (
    <div
      className="flex items-center gap-3"
      style={{
        background: 'rgba(255,255,255,0.78)',
        backdropFilter: 'blur(16px) saturate(180%)',
        WebkitBackdropFilter: 'blur(16px) saturate(180%)',
        border: '1px solid rgba(255,255,255,0.60)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
        padding: '16px',
      }}
    >
      <div
        className="w-11 h-11 rounded-[12px] flex items-center justify-center text-xl shrink-0"
        style={{ background: `${color}1f`, color }}
      >
        <span>{icon}</span>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
          {label}
        </p>
        <p className="text-2xl font-extrabold leading-tight truncate" style={{ color }}>
          {value}
        </p>
      </div>
    </div>
  );
}
